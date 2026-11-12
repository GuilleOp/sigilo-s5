// Ventanilla única en el mismo origen del enrutador (perfil «ventanilla» de la web): la SESNA sirve
// la web pública (inicio, denunciar, Mi denuncia, registro público, observatorio, datos abiertos y
// solicitud de alta) junto al enrutador ciego, así la web usa el directorio, el relevo y el corte
// nacional sin hablar con otro origen. Además, pasos mínimos hacia rutas públicas: el evaluador OPRF
// (solo ve el elemento cegado), la bitácora pública de un nodo y la solicitud de alta de una
// institución en el nodo de su estado. Ninguno lleva denuncias: esas van solo en sobres por el relevo.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import {
  API_PREFIX,
  CORROBORATION_ROUTES,
  CorroborationEvaluationRequestSchema,
  NodeIdSchema,
  POW_HEADER,
  RegistrationRequestSchema,
  ROUTES,
  VENTANILLA_ROUTES,
  WEB_CONFIG_FILE_NAME,
  WEB_CONFIG_PATH,
  WebRuntimeConfigSchema,
} from '@sigilo/contracts';
import type { AuthorityDirectory, DirectoryNode, WebRuntimeConfig } from '@sigilo/contracts';
import { findNode } from '@sigilo/red';
import type { FetchLike } from '@sigilo/red';
import { DEFAULT_ROUTER_DATA_DIR } from './config.ts';
import { errorResponse, securityHeaders } from './http.ts';
import { nationalOpenDataCsv } from './open-data-aggregator.ts';
import type { OpenDataAggregator } from './open-data-aggregator.ts';

/** Configuración de la ventanilla, leída del entorno. */
export interface VentanillaConfig {
  /** Carpeta con la web construida en perfil «ventanilla» (`apps/web/dist`). */
  distDir: string;
  /** Dirección interna del evaluador OPRF; sin ella, la del directorio. */
  evaluatorUrl: string | null;
  /**
   * Configuración de la web en tiempo de ejecución (ADR 0011) que se sirve en
   * `/config/sigilo.json`; sin ella, 404 y la web usa su bundle.
   */
  webConfig?: WebRuntimeConfig;
}

/** Dependencias de la ventanilla dentro de la aplicación del enrutador. */
export interface VentanillaDeps extends VentanillaConfig {
  directory: () => AuthorityDirectory;
  /** Dirección para hablar con cada nodo (la interna si la operación la configuró). */
  nodeUrl: (node: DirectoryNode) => string;
  fetch: FetchLike;
  openData?: Pick<OpenDataAggregator, 'latest'>;
  hstsMaxAgeSeconds?: number | null;
}

const URL_PATTERN = /^https?:\/\/[^\s/?#]+$/u;
/** Mayor solicitud de alta que se pasa al nodo (la lista de personas es corta). */
const MAX_REGISTRATION_BODY_BYTES = 64 * 1024;
/** Mayor petición de evaluación OPRF, como en el nodo. */
const MAX_EVALUATION_BODY_BYTES = 1024;
const INTEGER_PATTERN = /^\d{1,9}$/u;

/**
 * Lee la configuración de la web en tiempo de ejecución, o `null` si no hay archivo. Lanza error si
 * el archivo no es válido: la ventanilla no arranca sirviendo una raíz que la web no aceptaría.
 */
export function loadVentanillaWebConfig(path: string): WebRuntimeConfig | null {
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('No se pudo leer la configuración de la web (web-config.json).');
  }
  const parsed = WebRuntimeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('La configuración de la web (web-config.json) no tiene el formato esperado.');
  }
  return parsed.data;
}

/**
 * Lee `SIGILO_ROUTER_WEB_DIST` (carpeta de la web en perfil ventanilla),
 * `SIGILO_ROUTER_EVALUATOR_URL` (dirección interna del evaluador) y
 * `SIGILO_ROUTER_WEB_CONFIG_FILE` (configuración de la web en tiempo de ejecución; por omisión
 * `web-config.json` en el directorio de datos del enrutador). Sin la primera, el enrutador no sirve
 * web. Lanza error si un valor no es válido.
 */
export function loadVentanillaConfig(env: NodeJS.ProcessEnv): VentanillaConfig | null {
  const dist = env.SIGILO_ROUTER_WEB_DIST ?? '';
  if (dist === '') return null;
  const distDir = resolve(dist);
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new Error('SIGILO_ROUTER_WEB_DIST no contiene index.html.');
  }
  const evaluator = env.SIGILO_ROUTER_EVALUATOR_URL ?? '';
  if (evaluator !== '' && !URL_PATTERN.test(evaluator)) {
    throw new Error('SIGILO_ROUTER_EVALUATOR_URL debe tener la forma http://host:puerto.');
  }
  const webConfig = loadVentanillaWebConfig(
    resolve(
      env.SIGILO_ROUTER_WEB_CONFIG_FILE ||
        join(env.SIGILO_ROUTER_DATA_DIR || DEFAULT_ROUTER_DATA_DIR, WEB_CONFIG_FILE_NAME),
    ),
  );
  return {
    distDir,
    evaluatorUrl: evaluator === '' ? null : evaluator,
    ...(webConfig === null ? {} : { webConfig }),
  };
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

interface WebAsset {
  body: Uint8Array;
  contentType: string;
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * Carga en memoria la web construida.
 * Seguridad: las rutas se resuelven contra un mapa fijo cargado al arrancar; ninguna petición toca
 * el sistema de archivos ni puede salir de la carpeta.
 */
function loadAssets(distDir: string): (pathname: string) => WebAsset | null {
  const assets = new Map<string, WebAsset>();
  for (const path of listFiles(distDir)) {
    const urlPath = `/${relative(distDir, path).split(sep).join('/')}`;
    const contentType = CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
    assets.set(urlPath, { body: new Uint8Array(readFileSync(path)), contentType });
  }
  const index = assets.get('/index.html');
  if (index === undefined) throw new Error('SIGILO_ROUTER_WEB_DIST no contiene index.html.');
  return (pathname) => {
    const asset = assets.get(pathname);
    if (asset !== undefined) return asset;
    // Las rutas de la web no tienen extensión; un archivo inexistente con extensión es 404.
    const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
    return lastSegment.includes('.') ? null : index;
  };
}

/** CSP de la web: la de `apps/web/index.html` más `frame-ancestors 'none'`, sin terceros. */
export const VENTANILLA_WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function isApiPath(path: string): boolean {
  return path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

/**
 * Reenvía la respuesta de otro servicio sin sus cabeceras: solo el estatus y el cuerpo JSON. Si no
 * responde JSON, se contesta `internal` sin detalles.
 */
async function relayJson(c: Context, response: Response): Promise<Response> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return errorResponse(c, 'internal');
  }
  return c.json(body as object, response.status as 200);
}

async function readJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/**
 * Registra la ventanilla en la aplicación del enrutador, antes de sus demás rutas. Sin
 * dependencias no registra nada: el enrutador sigue sin servir web.
 * Seguridad: la web va con su propia CSP (solo el mismo origen); el resto, con las cabeceras del
 * enrutador. Los pasos arman cada petición desde cero, con solo el tipo de contenido (y la prueba
 * de trabajo): no reenvían cookies, agente de usuario ni IP, y no leen ni guardan nada.
 */
export function registerVentanilla(app: Hono, deps: VentanillaDeps | undefined): void {
  if (deps === undefined) return;
  const resolveAsset = loadAssets(deps.distDir);
  const routerHeaders = securityHeaders(deps.hstsMaxAgeSeconds ?? null);
  // Este middleware queda por fuera de todos: aplica las cabeceras del enrutador a toda respuesta
  // (también a la de los pasos de abajo) y, en la web, cambia la CSP por la de la web.
  app.use('*', async (c, next) => {
    await routerHeaders(c, next);
    // La configuración en tiempo de ejecución es un JSON: conserva la CSP del enrutador.
    if (!isApiPath(c.req.path) && c.req.path !== WEB_CONFIG_PATH) {
      c.res.headers.set('Content-Security-Policy', VENTANILLA_WEB_CSP);
    }
  });

  const nodeOf = (c: Context): DirectoryNode | null => {
    const nodeId = c.req.param('nodeId') ?? '';
    if (!NodeIdSchema.safeParse(nodeId).success) return null;
    return findNode(deps.directory(), nodeId) ?? null;
  };
  const toNode = async (c: Context, path: string, init: RequestInit = { method: 'GET' }) => {
    const node = nodeOf(c);
    if (node === null) return errorResponse(c, 'not_found');
    try {
      return await relayJson(c, await deps.fetch(`${deps.nodeUrl(node)}${path}`, init));
    } catch {
      return errorResponse(c, 'internal');
    }
  };

  // Bitácora pública de un nodo, para el registro público.
  app.get(VENTANILLA_ROUTES.nodeLedgerHead(':nodeId'), (c) => toNode(c, ROUTES.ledgerHead));
  app.get(VENTANILLA_ROUTES.nodeLedgerEvents(':nodeId'), (c) => {
    const from = c.req.query('from') ?? '0';
    const limit = c.req.query('limit') ?? '100';
    if (!INTEGER_PATTERN.test(from) || !INTEGER_PATTERN.test(limit)) {
      return errorResponse(c, 'bad_request');
    }
    return toNode(c, `${ROUTES.ledgerEvents}?from=${from}&limit=${limit}`);
  });

  // Solicitud de alta de una institución en el nodo de su estado (lo revisa su operación).
  app.get(VENTANILLA_ROUTES.nodeRegistrationChallenge(':nodeId'), (c) =>
    toNode(c, `${ROUTES.powChallenge}?purpose=registration`),
  );
  app.post(
    VENTANILLA_ROUTES.nodeRegistrationRequests(':nodeId'),
    bodyLimit({
      maxSize: MAX_REGISTRATION_BODY_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    async (c) => {
      const parsed = RegistrationRequestSchema.safeParse(await readJsonBody(c));
      if (!parsed.success) return errorResponse(c, 'bad_request');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const proof = c.req.header(POW_HEADER);
      if (proof !== undefined) headers[POW_HEADER] = proof;
      return toNode(c, ROUTES.registrationRequests, {
        method: 'POST',
        headers,
        body: JSON.stringify(parsed.data),
      });
    },
  );

  // Paso al evaluador OPRF: solo el elemento cegado, que no revela el identificador.
  const evaluatorUrl = (): string | null =>
    deps.evaluatorUrl ?? deps.directory().corroboration?.evaluatorUrl ?? null;
  app.get(CORROBORATION_ROUTES.evaluatorChallenge, async (c) => {
    const base = evaluatorUrl();
    if (base === null) return errorResponse(c, 'not_found');
    try {
      return await relayJson(
        c,
        await deps.fetch(`${base}${CORROBORATION_ROUTES.evaluatorChallenge}`, { method: 'GET' }),
      );
    } catch {
      return errorResponse(c, 'internal');
    }
  });
  app.post(
    CORROBORATION_ROUTES.evaluations,
    bodyLimit({
      maxSize: MAX_EVALUATION_BODY_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    async (c) => {
      const base = evaluatorUrl();
      if (base === null) return errorResponse(c, 'not_found');
      const parsed = CorroborationEvaluationRequestSchema.safeParse(await readJsonBody(c));
      if (!parsed.success) return errorResponse(c, 'bad_request');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const proof = c.req.header(POW_HEADER);
      if (proof !== undefined) headers[POW_HEADER] = proof;
      try {
        return await relayJson(
          c,
          await deps.fetch(`${base}${CORROBORATION_ROUTES.evaluations}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(parsed.data),
          }),
        );
      } catch {
        return errorResponse(c, 'internal');
      }
    },
  );

  // Datos abiertos de la ventanilla: el corte nacional en el CSV con las columnas de cada nodo.
  app.get(ROUTES.openDataCsv, (c) => {
    const latest = deps.openData?.latest() ?? null;
    if (latest === null) return errorResponse(c, 'not_found');
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="denuncias-nacional.csv"');
    return c.body(nationalOpenDataCsv(latest));
  });

  // Configuración de la web en tiempo de ejecución (ADR 0011): raíz de la red y llaves de relleno.
  const webConfig = deps.webConfig;
  if (webConfig !== undefined) app.get(WEB_CONFIG_PATH, (c) => c.json(webConfig));

  // La web: archivos tal cual e `index.html` para las rutas de la web. La API sigue de largo.
  app.get('*', async (c, next) => {
    if (isApiPath(c.req.path)) return next();
    const asset = resolveAsset(c.req.path);
    if (asset === null) return c.text('No encontrado.', 404);
    c.header('Content-Type', asset.contentType);
    return c.body(new Uint8Array(asset.body));
  });
}
