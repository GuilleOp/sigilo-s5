// Construye el documento OpenAPI 3.1 del Estándar S5 a partir de las operaciones y los esquemas zod
// de @sigilo/contracts, con `z.toJSONSchema` (JSON Schema 2020-12). Función pura: no escribe nada.
import { z } from 'zod';
import {
  API_ERROR_DESCRIPTIONS,
  API_ERROR_HTTP_STATUS,
  API_ERROR_MESSAGES,
  CLOSURE_REASONS,
  COMPLAINT_STATUSES,
  DEADLINE_RULES,
  LEGAL_STAGES,
  MANAGEMENT_STATES,
  OFFENSES,
  PROCEDURE_ACTORS,
  STATES,
} from '@sigilo/contracts';
import type { ApiErrorCode } from '@sigilo/contracts';
import { PDN_SCOPE_DESCRIPTIONS, PDN_ROUTES } from '@sigilo/contracts';
import {
  PDN_OAUTH_DESCRIPTION,
  STANDARD_POW_HEADER,
  STANDARD_VERSION,
} from '@sigilo/contracts/standard';
import type { StandardBody, StandardComponentName } from '@sigilo/contracts/standard';
import {
  PUBLISHED_COMPONENTS,
  PUBLISHED_EXAMPLES,
  PUBLISHED_OPERATIONS,
  PUBLISHED_TAGS,
  operationServers,
} from './published.ts';
import type { PublishedOperation } from './published.ts';

/** Objeto JSON genérico del documento. */
export type JsonObject = Record<string, unknown>;

const COMPONENT_REF_PREFIX = '#/components/schemas/';

/** Valores de cada catálogo con clave y nombre, para listarlos en la descripción del enum. */
const ENUM_CATALOGS: Partial<
  Record<StandardComponentName, readonly { key: string; name: string; explanation: string }[]>
> = {
  ComplaintStatus: COMPLAINT_STATUSES,
  ManagementState: MANAGEMENT_STATES,
  ClosureReason: CLOSURE_REASONS,
  LegalStage: LEGAL_STAGES,
  ProcedureActor: PROCEDURE_ACTORS,
  DeadlineKey: DEADLINE_RULES,
};

/** Valores permitidos de los catálogos públicos fijos (los del despliegue no se enumeran). */
const CATALOG_ENUMS: Readonly<Record<string, readonly string[]>> = {
  STATES: STATES.map((state) => state.code),
  OFFENSES: OFFENSES.flatMap((offense) => [offense.code, ...offense.equivalentCodes]).sort(),
};

/** Referencia a un componente. */
export function componentRef(name: string): { $ref: string } {
  return { $ref: `${COMPONENT_REF_PREFIX}${name}` };
}

/**
 * Convierte los componentes con `z.toJSONSchema`. Las referencias entre ellos quedan como `$ref`;
 * las validaciones con `refine` de los catálogos fijos se traducen a `enum`.
 */
export function buildComponentSchemas(): Record<string, JsonObject> {
  const registry = z.registry<{ id: string }>();
  for (const [id, schema] of Object.entries(PUBLISHED_COMPONENTS)) registry.add(schema, { id });
  const { schemas } = z.toJSONSchema(registry, {
    target: 'draft-2020-12',
    uri: (id) => `${COMPONENT_REF_PREFIX}${id}`,
    unrepresentable: 'throw',
    override: (ctx) => {
      const catalog = ctx.jsonSchema['x-catalog'];
      const values = typeof catalog === 'string' ? CATALOG_ENUMS[catalog] : undefined;
      if (values !== undefined) ctx.jsonSchema.enum = [...values];
    },
  });
  const result: Record<string, JsonObject> = {};
  for (const id of Object.keys(PUBLISHED_COMPONENTS)) {
    // Se quitan `$schema` y `$id`: el dialecto por omisión de OpenAPI 3.1 ya es JSON Schema
    // 2020-12 con el vocabulario de OpenAPI, y declarar otro hace que Swagger UI lo rechace.
    const schema: JsonObject = { ...(schemas[id] as JsonObject) };
    delete schema.$schema;
    delete schema.$id;
    const entries = ENUM_CATALOGS[id as StandardComponentName];
    if (entries !== undefined) {
      const list = entries.map(
        (entry) => `- \`${entry.key}\`: ${entry.name}. ${entry.explanation}`,
      );
      schema.description = `${String(schema.description ?? '')}\n\n${list.join('\n')}`;
    }
    result[id] = schema;
  }
  return result;
}

/** Cuerpo JSON de una operación de cualquier grupo; `mediaTypes` agrega otros tipos. */
type JsonBody = {
  kind: 'json';
  component: string;
  isArray?: boolean;
  example: string;
  mediaTypes?: readonly string[];
};

function jsonContent(body: JsonBody): JsonObject {
  const reference = componentRef(body.component);
  const media = {
    schema: body.isArray === true ? { type: 'array', items: reference } : reference,
    examples: {
      sintetico: {
        summary: 'Ejemplo sintético',
        // `value` y `externalValue` se excluyen en OpenAPI 3.1: el archivo se cita en el texto.
        description: `También en \`ejemplos/${body.example}.json\`.`,
        value: PUBLISHED_EXAMPLES[body.example],
      },
    },
  };
  return Object.fromEntries((body.mediaTypes ?? ['application/json']).map((type) => [type, media]));
}

function bodyContent(body: StandardBody | JsonBody): JsonObject {
  switch (body.kind) {
    case 'json':
      return jsonContent(body);
    case 'binary':
      // OpenAPI 3.1: un cuerpo binario crudo se declara por su tipo de medio, sin esquema.
      return Object.fromEntries(body.mediaTypes.map((mediaType) => [mediaType, {}]));
    case 'text':
      return {
        [body.mediaType]: { schema: { type: 'string' }, example: body.example },
      };
  }
}

function bodyDescription(body: StandardBody | JsonBody, fallback: string): string {
  return body.kind === 'json' ? fallback : `${fallback} ${body.description}`;
}

/**
 * Cabeceras comunes de toda respuesta. Seguridad: nada se guarda en cachés intermedias ni del
 * navegador (una respuesta del seguimiento en caché delataría la denuncia).
 */
const NO_STORE_HEADERS: JsonObject = {
  'Cache-Control': {
    description: 'Siempre `no-store`: ninguna respuesta se guarda en cachés.',
    schema: { type: 'string', const: 'no-store' },
  },
};

function errorResponse(code: ApiErrorCode): JsonObject {
  const response: JsonObject = {
    description: `\`${code}\`: ${API_ERROR_DESCRIPTIONS[code]}`,
    headers: { ...NO_STORE_HEADERS },
    content: {
      'application/json': {
        schema: componentRef('ApiError'),
        example: { error: { code, message: API_ERROR_MESSAGES[code] } },
      },
    },
  };
  if (code === 'unauthorized') {
    response.headers = {
      ...NO_STORE_HEADERS,
      'WWW-Authenticate': { description: 'Siempre `Bearer`.', schema: { type: 'string' } },
    };
  }
  return response;
}

/**
 * Respuestas de error de una operación por estatus HTTP. Si dos códigos comparten estatus (por
 * ejemplo, `conflict` y `reassignment_limit` en 409), la respuesta los describe a ambos y lleva un
 * ejemplo por código.
 */
function errorResponses(codes: readonly ApiErrorCode[]): JsonObject {
  const byStatus = new Map<string, ApiErrorCode[]>();
  for (const code of codes) {
    const status = String(API_ERROR_HTTP_STATUS[code]);
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  const responses: JsonObject = {};
  for (const [status, sameStatus] of byStatus) {
    const [first, ...rest] = sameStatus;
    if (first === undefined) continue;
    const response = errorResponse(first);
    if (rest.length > 0) {
      response.description = sameStatus
        .map((code) => `\`${code}\`: ${API_ERROR_DESCRIPTIONS[code]}`)
        .join('\n\n');
      response.content = {
        'application/json': {
          schema: componentRef('ApiError'),
          examples: Object.fromEntries(
            sameStatus.map((code) => [
              code,
              { value: { error: { code, message: API_ERROR_MESSAGES[code] } } },
            ]),
          ),
        },
      };
    }
    responses[status] = response;
  }
  return responses;
}

/** Requisito de seguridad de una operación; OAuth 2.0 lleva sus permisos. */
function securityOf(security: PublishedOperation['security']): readonly JsonObject[] {
  if (typeof security === 'object') return [{ nodeOAuth: [...security.oauth] }];
  switch (security) {
    case 'none':
      return [];
    case 'proofOfWork':
      return [{ proofOfWork: [] }];
    case 'authorityBearer':
      return [{ authorityBearer: [] }];
  }
}

/** Errores con el formato de la PDN (`PdnError` o `PdnTokenError`), por estatus. */
function pdnErrorResponses(operation: PublishedOperation): JsonObject {
  if (!('pdnErrors' in operation)) return {};
  const responses: JsonObject = {};
  for (const item of operation.pdnErrors) {
    const response: JsonObject = {
      description: item.description,
      headers: { ...NO_STORE_HEADERS },
      content: { 'application/json': { schema: componentRef(item.component) } },
    };
    responses[String(item.status)] = response;
  }
  return responses;
}

function buildOperation(operation: PublishedOperation): JsonObject {
  const { body } = operation.success;
  const responses: JsonObject = {
    [String(operation.success.status)]: {
      description:
        body === undefined
          ? operation.success.description
          : bodyDescription(body, operation.success.description),
      headers: { ...NO_STORE_HEADERS },
      ...(body === undefined ? {} : { content: bodyContent(body) }),
    },
  };
  // El grupo «PDN» documenta su propio `500` con `resError`; los demás, `internal` con `ApiError`.
  const internal: ApiErrorCode[] = 'pdnErrors' in operation ? [] : ['internal'];
  Object.assign(responses, errorResponses([...operation.errors, ...internal]));
  Object.assign(responses, pdnErrorResponses(operation));
  const result: JsonObject = {
    operationId: operation.operationId,
    tags: [operation.tag],
    summary: operation.summary,
    description: operation.description,
    security: securityOf(operation.security),
  };
  if (operation.parameters.length > 0) result.parameters = operation.parameters;
  if (operation.requestBody !== undefined) {
    result.requestBody = {
      required: true,
      description: bodyDescription(operation.requestBody, 'Cuerpo de la petición.'),
      content: bodyContent(operation.requestBody),
    };
  }
  result.responses = responses;
  return result;
}

const DESCRIPTION = [
  'Especificación abierta del Sistema de denuncias públicas de faltas administrativas y hechos de corrupción (S5) de la Plataforma Digital Nacional, propuesta por SIGILO. Prototipo para el Datatón Anticorrupción 2026; no es el sistema oficial.',
  '',
  'La identidad de la persona denunciante se cifra en su navegador hacia la llave de la autoridad (HPKE, RFC 9180) y el servidor nunca la ve. El seguimiento usa un folio aleatorio y una llave derivada de un recibo de 8 palabras. Toda acción de la autoridad queda en una bitácora pública encadenada y firmada.',
  '',
  'El grupo «Red» describe la red federada: el directorio de autoridades firmado y cofirmado por testigos, el enrutador ciego (que solo ve el destino), el registro de nodos y la bitácora nacional cofirmada m de n. Lo sirve el enrutador, salvo el buzón de red, que lo sirve cada nodo.',
  '',
  'El grupo «PDN» describe al nodo como proveedor de la Plataforma Digital Nacional con la metodología de las APIs del S2 y del S3: su servidor de autorización OAuth 2.0 (`POST /oauth/token`) y la estadística agregada de denuncias con paginación (`POST /v1/denuncias/estadisticas`), que consulta la SESNA para el portal. Lo sirve cada nodo.',
  '',
  'El grupo «Corroboración» describe la corroboración ciega con VOPRF (RFC 9497): el evaluador OPRF, que ve solo elementos cegados, y el índice de coincidencias, que ve solo etiquetas y cuenta fuentes independientes. Son dos servicios con operación separada.',
  '',
  'Documento generado desde `packages/contracts` con `npm run standard:build`. Los esquemas son JSON Schema 2020-12. Las peticiones y respuestas no admiten campos que no estén en su esquema. El diccionario de datos, los catálogos y los ejemplos están en la misma carpeta; los cambios de cada versión, en `CHANGELOG.md`. El perfil de conexión con la PDN (solo lo que consume la SESNA) y un documento por grupo están en `oas/`, en OpenAPI 3.0.3.',
].join('\n');

/** Documento OpenAPI 3.1 completo del Estándar S5. */
export function buildOpenApiDocument(): JsonObject {
  const paths: Record<string, JsonObject> = {};
  for (const operation of PUBLISHED_OPERATIONS) {
    const item = paths[operation.path] ?? {};
    // Las rutas del enrutador y de la corroboración viven en otros servidores: se declaran en la
    // ruta (OpenAPI 3.1).
    const servers = operationServers(operation);
    if (servers !== null) item.servers = servers;
    item[operation.method] = buildOperation(operation);
    paths[operation.path] = item;
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Estándar S5',
      summary: 'API del sistema de denuncias con anonimato verificable.',
      description: DESCRIPTION,
      version: STANDARD_VERSION,
      license: { name: 'CC BY-NC 4.0', identifier: 'CC-BY-NC-4.0' },
    },
    servers: [
      {
        url: 'http://127.0.0.1:8787',
        description: 'Servidor de referencia en local (`npm run dev:server`).',
      },
      {
        url: 'https://denuncias.example.org',
        description: 'Ejemplo de un nodo publicado (dominio reservado para ejemplos).',
      },
    ],
    tags: PUBLISHED_TAGS,
    paths,
    components: {
      schemas: buildComponentSchemas(),
      securitySchemes: {
        proofOfWork: {
          type: 'apiKey',
          in: 'header',
          name: STANDARD_POW_HEADER,
          description: `Prueba de trabajo sin cuentas ni rastreo: \`${STANDARD_POW_HEADER}: <token>:<contador>\`, donde \`token\` viene de \`GET /api/v1/pow/challenge\` y \`SHA-256(token + ":" + contador)\` empieza con \`bits\` bits en cero. Si falta o no es válida, la respuesta es \`428 proof_required\`.`,
        },
        nodeOAuth: {
          type: 'oauth2',
          description: PDN_OAUTH_DESCRIPTION,
          flows: {
            password: { tokenUrl: PDN_ROUTES.token, scopes: PDN_SCOPE_DESCRIPTIONS },
            clientCredentials: { tokenUrl: PDN_ROUTES.token, scopes: PDN_SCOPE_DESCRIPTIONS },
          },
        },
        authorityBearer: {
          type: 'http',
          scheme: 'bearer',
          description:
            'Token de sesión de una cuenta individual de la autoridad (`Authorization: Bearer <token>`), emitido por `POST /api/v1/auth/login`. Vence tras 15 minutos sin actividad o 8 horas en total y se invalida al cerrar sesión. Todo fallo responde el mismo `401`.',
        },
      },
    },
  };
}
