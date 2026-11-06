// API-01: compara cada intercambio del modo conformidad con la especificación OpenAPI 3.1 del
// estándar: ruta y método declarados, estatus documentado, tipo de contenido y esquema del cuerpo
// JSON (JSON Schema 2020-12, validado con Ajv).
import { existsSync, readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv/dist/2020.js';
import { parse as parseYaml } from 'yaml';
import { result } from '../catalog.ts';
import type { CheckResult, Evidence, HttpExchange } from '../types.ts';
import { jsonBodyOf } from './api-client.ts';

/** Fragmento de OpenAPI que usa el validador. */
interface OpenApiDocument {
  openapi?: string;
  servers?: { url?: string }[];
  paths?: Record<string, Record<string, OpenApiOperation | undefined> | undefined>;
}

interface OpenApiOperation {
  responses?: Record<string, OpenApiResponse | undefined>;
}

interface OpenApiResponse {
  content?: Record<string, { schema?: unknown } | undefined>;
  $ref?: string;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const SPEC_ID = 'https://sigilo.invalid/estandar/openapi';

/** Carga la especificación (YAML o JSON). Lanza error si no se puede leer. */
export function loadOpenApi(path: string): OpenApiDocument {
  const text = readFileSync(path, 'utf8');
  const parsed: unknown = path.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('La especificación OpenAPI no es un objeto.');
  }
  return parsed as OpenApiDocument;
}

/** Escapa un segmento para un JSON Pointer (RFC 6901). */
function pointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Convierte una plantilla `/a/{b}` en expresión regular. */
function templatePattern(template: string): RegExp {
  const escaped = template
    .split(/\{[^}]+\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  return new RegExp(`^${escaped}$`);
}

/** Busca la plantilla de ruta que corresponde a `path`, con o sin el prefijo de `servers`. */
export function matchPathTemplate(spec: OpenApiDocument, path: string): string | null {
  const templates = Object.keys(spec.paths ?? {});
  const prefixes = [''];
  for (const server of spec.servers ?? []) {
    try {
      const pathname = new URL(server.url ?? '', 'http://servidor.invalid').pathname.replace(
        /\/$/,
        '',
      );
      if (pathname !== '') prefixes.push(pathname);
    } catch {
      // URL de servidor no interpretable: se ignora.
    }
  }
  // Las plantillas literales ganan a las que tienen parámetros (regla de OpenAPI).
  const sorted = [...templates].sort(
    (a, b) => (a.match(/\{/g)?.length ?? 0) - (b.match(/\{/g)?.length ?? 0),
  );
  for (const prefix of prefixes) {
    if (!path.startsWith(prefix)) continue;
    const relative = path.slice(prefix.length) || '/';
    const found = sorted.find((template) => templatePattern(template).test(relative));
    if (found !== undefined) return found;
  }
  return null;
}

/** Resuelve una referencia local `#/a/b` a su valor y su puntero (sin `#/`). */
function resolveLocalRef(
  spec: OpenApiDocument,
  ref: string,
): { value: OpenApiResponse | undefined; pointer: string } | null {
  if (!ref.startsWith('#/')) return null;
  const pointer = ref.slice(2);
  let node: unknown = spec;
  for (const raw of pointer.split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[key]
        : undefined;
  }
  return { value: node as OpenApiResponse | undefined, pointer };
}

function statusKeyFor(responses: Record<string, unknown>, status: number): string | null {
  const exact = String(status);
  if (exact in responses) return exact;
  const range = `${Math.floor(status / 100)}XX`;
  if (range in responses) return range;
  return 'default' in responses ? 'default' : null;
}

function formatAjvErrors(errors: readonly ErrorObject[] | null | undefined): string {
  return (errors ?? [])
    .slice(0, 3)
    .map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim())
    .join('; ');
}

/** Resultado de comparar un intercambio. */
export interface ExchangeConformance {
  exchange: HttpExchange;
  problems: string[];
}

/** Compara los intercambios con la especificación. */
export function compareWithSpec(
  spec: OpenApiDocument,
  exchanges: readonly HttpExchange[],
): ExchangeConformance[] {
  const ajv = new Ajv2020({ strict: false, validateFormats: false, allErrors: false });
  ajv.addSchema(spec as object, SPEC_ID);
  return exchanges.map((exchange) => {
    const problems: string[] = [];
    const template = matchPathTemplate(spec, exchange.path);
    // Una ruta fuera del estándar que responde 404 es el comportamiento esperado.
    if (template === null) {
      return { exchange, problems: exchange.status === 404 ? [] : ['ruta no declarada'] };
    }
    const method = exchange.method.toLowerCase();
    const operation = spec.paths?.[template]?.[method];
    if (operation === undefined || !HTTP_METHODS.includes(method)) {
      return { exchange, problems: [`método ${exchange.method} no declarado en ${template}`] };
    }
    const responses = operation.responses ?? {};
    const statusKey = statusKeyFor(responses, exchange.status);
    if (statusKey === null) {
      return { exchange, problems: [`estatus ${exchange.status} no documentado en ${template}`] };
    }
    const declared = responses[statusKey];
    const resolved = declared?.$ref === undefined ? null : resolveLocalRef(spec, declared.$ref);
    const response = resolved === null ? declared : resolved.value;
    const responsePointer =
      resolved === null
        ? ['paths', template, method, 'responses', statusKey].map(pointerSegment).join('/')
        : resolved.pointer;
    const content = response?.content;
    if (content === undefined || Object.keys(content).length === 0) {
      if (exchange.bodyText.trim() !== '') problems.push('cuerpo no documentado');
      return { exchange, problems };
    }
    const mediaType = exchange.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    const mediaKey =
      Object.keys(content).find((key) => key.toLowerCase() === mediaType) ??
      Object.keys(content).find(
        (key) => key === '*/*' || (key.endsWith('/*') && mediaType.startsWith(key.slice(0, -1))),
      );
    if (mediaKey === undefined) {
      problems.push(`tipo de contenido ${mediaType || '(ausente)'} no documentado`);
      return { exchange, problems };
    }
    if (!/json/.test(mediaKey) || content[mediaKey]?.schema === undefined)
      return { exchange, problems };
    const body = jsonBodyOf(exchange);
    if (body === undefined) {
      problems.push('el cuerpo no es JSON válido');
      return { exchange, problems };
    }
    const pointer = `${responsePointer}/content/${pointerSegment(mediaKey)}/schema`;
    try {
      const validate = ajv.compile({ $ref: `${SPEC_ID}#/${pointer}` });
      if (!validate(body))
        problems.push(`no cumple el esquema: ${formatAjvErrors(validate.errors)}`);
    } catch (error) {
      problems.push(
        `no se pudo compilar el esquema: ${error instanceof Error ? error.message : 'error desconocido'}`,
      );
    }
    return { exchange, problems };
  });
}

/** API-01 a partir de la especificación en `specPath` y los intercambios registrados. */
export function checkOpenApiConformance(
  specPath: string,
  exchanges: readonly HttpExchange[],
): CheckResult {
  if (!existsSync(specPath)) {
    return result('API-01', {
      status: 'advertencia',
      summary: `No se encontró la especificación (${specPath}); no se pudo comparar. Pendiente hasta que el estándar publique estandar/openapi.yaml.`,
      evidence: [
        {
          kind: 'nota',
          description: `Se registraron ${exchanges.length} intercambios; vuelve a correr el validador con --openapi cuando exista la especificación.`,
        },
      ],
    });
  }
  let spec: OpenApiDocument;
  try {
    spec = loadOpenApi(specPath);
  } catch (error) {
    return result('API-01', {
      status: 'no_cumple',
      summary: `La especificación no se pudo leer: ${error instanceof Error ? error.message : 'error desconocido'}.`,
    });
  }
  const compared = compareWithSpec(spec, exchanges);
  const failing = compared.filter((item) => item.problems.length > 0);
  const evidence: Evidence[] = failing.slice(0, 25).map(({ exchange, problems }) => ({
    kind: 'respuesta',
    description: `${exchange.purpose}: ${problems.join('; ')}.`,
    url: exchange.url,
    value: `${exchange.method} → ${exchange.status}`,
    snippet: exchange.bodyText.slice(0, 300),
  }));
  const operations = [
    ...new Set(exchanges.map((exchange) => `${exchange.method} ${exchange.path}`)),
  ];
  evidence.push({
    kind: 'nota',
    description: `Especificación ${specPath} (OpenAPI ${spec.openapi ?? '?'}); ${exchanges.length} intercambios sobre ${operations.length} operaciones.`,
  });
  if (failing.length > 0) {
    return result('API-01', {
      status: 'no_cumple',
      summary: `${failing.length} de ${exchanges.length} respuestas no corresponden a la especificación.`,
      evidence,
    });
  }
  return result('API-01', {
    status: 'cumple',
    summary: `Las ${exchanges.length} respuestas corresponden a la especificación (ruta, estatus, tipo y esquema).`,
    evidence,
  });
}
