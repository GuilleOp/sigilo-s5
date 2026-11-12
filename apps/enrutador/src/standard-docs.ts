// Vista del Estándar S5 en el origen del enrutador (la ventanilla de la SESNA): Swagger UI con el
// desplegable de documentos por grupo (perfil PDN, nodo, red y corroboración) en
// `/estandar/swagger/`, y los archivos del estándar (OpenAPI, diccionarios y catálogos) junto a
// ella. Swagger UI sale de la versión fija de `swagger-ui-dist` instalada con el enrutador: nada se
// carga de un CDN, así que la CSP de la vista solo admite el mismo origen.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import type { Hono } from 'hono';
import { securityHeaders } from './http.ts';

/** Prefijo de la vista del estándar en el enrutador. */
export const STANDARD_DOCS_PREFIX = '/estandar';

/** Página de Swagger UI (con la diagonal final, para que sus rutas relativas funcionen). */
export const STANDARD_DOCS_PAGE = `${STANDARD_DOCS_PREFIX}/swagger/`;

/**
 * CSP de la vista: solo el mismo origen. Swagger UI necesita `style-src 'unsafe-inline'` (pone
 * estilos en línea) e imágenes `data:` (sus íconos); no necesita `unsafe-eval`.
 */
export const STANDARD_DOCS_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Archivos de Swagger UI que usa la vista, de `swagger-ui-dist`. */
const SWAGGER_UI_FILES = [
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'swagger-ui.css',
  'LICENSE',
  'NOTICE',
];

/** Carpetas y extensiones del estándar que se sirven (no los reportes ni los ejemplos). */
const STANDARD_FOLDERS = ['', 'oas', 'catalogos'];
const STANDARD_EXTENSIONS = new Set(['.json', '.yaml', '.csv', '.md']);

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yaml': 'application/yaml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Configuración de la vista: dónde está `estandar/` y dónde está `swagger-ui-dist`. */
export interface StandardDocsConfig {
  standardDir: string;
  swaggerUiDir: string;
}

/** Carpeta `estandar/` del repositorio, si el enrutador corre desde él. */
const REPOSITORY_STANDARD_DIR = resolve(import.meta.dirname, '..', '..', '..', 'estandar');

function swaggerUiDir(): string | null {
  try {
    return dirname(createRequire(import.meta.url).resolve('swagger-ui-dist/package.json'));
  } catch {
    return null;
  }
}

/**
 * Lee `SIGILO_ROUTER_STANDARD_DIR` (carpeta `estandar/`; por omisión la del repositorio si existe).
 * Sin carpeta o sin `swagger-ui-dist`, el enrutador no sirve la vista. Lanza error si la carpeta
 * indicada no tiene la vista de Swagger UI.
 */
export function loadStandardDocsConfig(env: NodeJS.ProcessEnv): StandardDocsConfig | null {
  const configured = env.SIGILO_ROUTER_STANDARD_DIR ?? '';
  const standardDir = configured === '' ? REPOSITORY_STANDARD_DIR : resolve(configured);
  const hasPage = existsSync(join(standardDir, 'swagger', 'index.html'));
  if (configured !== '' && !hasPage) {
    throw new Error('SIGILO_ROUTER_STANDARD_DIR no contiene swagger/index.html.');
  }
  const swagger = swaggerUiDir();
  if (!hasPage || swagger === null) return null;
  return { standardDir, swaggerUiDir: swagger };
}

interface DocsAsset {
  body: Uint8Array;
  contentType: string;
}

/**
 * Carga en memoria la vista y los archivos del estándar.
 * Seguridad: las rutas se resuelven contra un mapa fijo cargado al arrancar; ninguna petición toca
 * el sistema de archivos ni puede salir de las carpetas.
 */
function loadAssets(config: StandardDocsConfig): Map<string, DocsAsset> {
  const assets = new Map<string, DocsAsset>();
  const add = (urlPath: string, file: string): void => {
    const contentType = CONTENT_TYPES[extname(file).toLowerCase()] ?? 'text/plain; charset=utf-8';
    assets.set(`${STANDARD_DOCS_PREFIX}/${urlPath}`, {
      body: new Uint8Array(readFileSync(file)),
      contentType,
    });
  };
  const swaggerDir = join(config.standardDir, 'swagger');
  for (const entry of readdirSync(swaggerDir, { withFileTypes: true })) {
    if (entry.isFile()) add(`swagger/${entry.name}`, join(swaggerDir, entry.name));
  }
  for (const name of SWAGGER_UI_FILES) {
    add(`swagger/vendor/${name}`, join(config.swaggerUiDir, name));
  }
  for (const folder of STANDARD_FOLDERS) {
    const directory = join(config.standardDir, folder);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !STANDARD_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      add(folder === '' ? entry.name : `${folder}/${entry.name}`, join(directory, entry.name));
    }
  }
  if (!assets.has(`${STANDARD_DOCS_PAGE}index.html`)) {
    throw new Error('La vista del estándar no tiene swagger/index.html.');
  }
  return assets;
}

function isDocsPath(path: string): boolean {
  return path === STANDARD_DOCS_PREFIX || path.startsWith(`${STANDARD_DOCS_PREFIX}/`);
}

/**
 * Registra la vista del estándar, antes que la ventanilla y que las demás rutas. Sin
 * configuración no registra nada.
 * Seguridad: su middleware queda por fuera de todos: en `/estandar/` aplica las cabeceras del
 * enrutador (sin caché, sin marcos, sin referrer) y cambia la CSP por la de la vista; las demás
 * rutas no cambian.
 */
export function registerStandardDocs(
  app: Hono,
  config: StandardDocsConfig | undefined,
  hstsMaxAgeSeconds: number | null = null,
): void {
  if (config === undefined) return;
  const assets = loadAssets(config);
  const routerHeaders = securityHeaders(hstsMaxAgeSeconds);
  app.use('*', async (c, next) => {
    if (!isDocsPath(c.req.path)) return next();
    await routerHeaders(c, next);
    c.res.headers.set('Content-Security-Policy', STANDARD_DOCS_CSP);
  });
  for (const path of [
    STANDARD_DOCS_PREFIX,
    `${STANDARD_DOCS_PREFIX}/`,
    `${STANDARD_DOCS_PREFIX}/swagger`,
  ]) {
    app.get(path, (c) => c.redirect(STANDARD_DOCS_PAGE, 302));
  }
  app.get(`${STANDARD_DOCS_PREFIX}/*`, (c) => {
    const path = c.req.path.endsWith('/') ? `${c.req.path}index.html` : c.req.path;
    const asset = assets.get(path);
    if (asset === undefined) return c.text('No encontrado.', 404);
    c.header('Content-Type', asset.contentType);
    return c.body(new Uint8Array(asset.body));
  });
}
