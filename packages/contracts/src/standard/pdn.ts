// Grupo «PDN» del Estándar S5: el nodo como proveedor de la PDN, con la metodología de las APIs del
// S2 y del S3 (especificaciones públicas de PDNMX/api_docs y servidor PDNMX/piloto_oauth2.0): su
// servidor de autorización OAuth 2.0 (`POST /oauth/token`) y la estadística agregada de denuncias
// (`POST /v1/denuncias/estadisticas`), que consulta la SESNA para el portal (Bases, art. 61).
import type { z } from 'zod';
import {
  PDN_ACCESS_TOKEN_TTL_SECONDS,
  PDN_REFRESH_TOKEN_TTL_SECONDS,
  PDN_ROUTES,
  PDN_SCOPES,
} from '../pdn-oauth.ts';
import type {
  PdnError,
  PdnScope,
  PdnTokenError,
  PdnTokenRequest,
  PdnTokenResponse,
} from '../pdn-oauth.ts';
import {
  PdnErrorSchema,
  PdnTokenErrorSchema,
  PdnTokenRequestSchema,
  PdnTokenResponseSchema,
} from '../pdn-oauth.ts';
import {
  NationalStatisticsNodeSchema,
  PDN_CLOSURE_CATALOG,
  PDN_STATUS_CATALOG,
  NationalStatisticsSchema,
  PdnAuthoritiesSchema,
  PdnAuthoritySchema,
  PdnPaginationSchema,
  PdnStatisticsRequestSchema,
  PdnStatisticsResponseSchema,
  PdnStatisticsRowSchema,
} from '../pdn-statistics.ts';
import type {
  NationalStatistics,
  PdnAuthorities,
  PdnStatisticsRequest,
  PdnStatisticsResponse,
  PdnStatisticsRow,
} from '../pdn-statistics.ts';
import type { StandardParameter } from './operations.ts';

/** Esquemas con nombre del grupo «PDN». */
export const PDN_COMPONENTS = {
  PdnTokenRequest: PdnTokenRequestSchema,
  PdnTokenResponse: PdnTokenResponseSchema,
  PdnTokenError: PdnTokenErrorSchema,
  PdnError: PdnErrorSchema,
  PdnStatisticsRequest: PdnStatisticsRequestSchema,
  PdnStatisticsResponse: PdnStatisticsResponseSchema,
  PdnPagination: PdnPaginationSchema,
  PdnStatisticsRow: PdnStatisticsRowSchema,
  PdnAuthorities: PdnAuthoritiesSchema,
  PdnAuthority: PdnAuthoritySchema,
  NationalStatistics: NationalStatisticsSchema,
  NationalStatisticsNode: NationalStatisticsNodeSchema,
} as const satisfies Record<string, z.ZodType>;

export type PdnComponentName = keyof typeof PDN_COMPONENTS;

/** Sección del estándar del grupo. */
export const PDN_TAG = {
  name: 'PDN',
  description:
    'El nodo como proveedor de la Plataforma Digital Nacional, con la metodología de las APIs del S2 y del S3: cada nodo expone su servidor de autorización OAuth 2.0 (`POST /oauth/token`, flujos password —el de la PDN— y client_credentials —el recomendado—) y su recurso con paginación (`POST /v1/denuncias/estadisticas`). La SESNA es el cliente: con las credenciales que le entrega cada nodo pide su token y consulta. Solo números agregados de meses cerrados, nunca denuncias.',
} as const;

/** Requisito de seguridad OAuth 2.0 con los permisos que exige la operación. */
export interface OAuthSecurity {
  oauth: readonly PdnScope[];
}

/** Cuerpo JSON de una operación del grupo; `mediaTypes` permite también formulario. */
export interface PdnBody {
  kind: 'json';
  component: PdnComponentName;
  isArray?: boolean;
  example: PdnExampleName;
  mediaTypes?: readonly string[];
}

/** Respuesta de error con el formato propio de la PDN (no el `ApiError` del nodo). */
export interface PdnErrorResponse {
  status: 400 | 401 | 403 | 413 | 415 | 429;
  description: string;
  component: 'PdnError' | 'PdnTokenError';
}

/** Operación del grupo «PDN»; las sirve cada nodo. */
export interface PdnOperation {
  operationId: string;
  method: 'get' | 'post';
  path: string;
  tag: 'PDN';
  servedBy: 'node';
  summary: string;
  description: string;
  security: 'none' | OAuthSecurity;
  parameters: readonly StandardParameter[];
  requestBody?: PdnBody;
  success: { status: 200; description: string; body: PdnBody };
  errors: readonly [];
  pdnErrors: readonly PdnErrorResponse[];
}

const tokenRequest: PdnTokenRequest = {
  grant_type: 'password',
  username: 'sesna.pdn',
  password: 'contraseña-ficticia',
  scope: PDN_SCOPES.statistics,
};

const tokenResponse: PdnTokenResponse = {
  access_token:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJub2RlLnF1ZXJldGFybyJ9.ZmlybWEtZmljdGljaWE',
  token_type: 'Bearer',
  expires_in: PDN_ACCESS_TOKEN_TTL_SECONDS,
  scope: PDN_SCOPES.statistics,
  refresh_token: 'cmVub3ZhY2lvbi1maWN0aWNpYS1kZS1lamVtcGxv',
  refresh_token_expires_in: PDN_REFRESH_TOKEN_TTL_SECONDS,
};

const tokenError: PdnTokenError = {
  error: 'invalid_client',
  error_description: 'No se pudo autenticar al cliente.',
  code: 401,
  message: 'No se pudo autenticar al cliente.',
};

const pdnError: PdnError = { code: 401, message: 'No autorizado.' };

const statisticsRequest: PdnStatisticsRequest = {
  sort: { mes: 'desc' },
  page: 1,
  pageSize: 10,
  query: { mesDesde: '2026-09', entidad: '22', conducta: '' },
};

const PUBLISHED_CLOSURES: Partial<Record<string, number>> = { IMPROCEDENTE: 5 };
const PUBLISHED_STATUSES: Partial<Record<string, number>> = { TURNADA: 5, EN_INVESTIGACION: 10 };

const row: PdnStatisticsRow = {
  id: '2026-10|authority.comptroller-queretaro|22|LGRA-52',
  fechaCaptura: '2026-11-01T00:00Z',
  mes: '2026-10',
  autoridad: {
    clave: 'authority.comptroller-queretaro',
    nombre: 'Contraloría Estatal Ficticia de Querétaro',
  },
  entidad: { clave: '22', valor: 'Querétaro' },
  conducta: { clave: 'LGRA-52', valor: 'Cohecho' },
  recibidas: 15,
  turnadas: { aTiempo: 10, vencidas: null },
  aceptadas: { aTiempo: 10, vencidas: 5 },
  archivadas: PDN_CLOSURE_CATALOG.map(({ clave, valor }) => ({
    clave,
    valor,
    total: PUBLISHED_CLOSURES[clave] ?? null,
  })),
  calificadas: { graves: null, noGraves: 5 },
  escalamientos: null,
  estatusAlCierre: PDN_STATUS_CATALOG.map(({ clave, valor }) => ({
    clave,
    valor,
    total: PUBLISHED_STATUSES[clave] ?? null,
  })),
  tiemposMedianosDiasHabiles: { turno: 1, aceptacion: 1, archivo: null },
};

const statisticsResponse: PdnStatisticsResponse = {
  pagination: { pageSize: 10, page: 1, totalRows: 1, hasNextPage: false },
  results: [row],
};

const authorities: PdnAuthorities = [
  { clave: 'authority.buzon-queretaro', nombre: 'Buzón general de Querétaro' },
  { clave: 'authority.comptroller-queretaro', nombre: 'Contraloría Estatal Ficticia de Querétaro' },
];

const nationalStatistics: NationalStatistics = {
  v: 1,
  cutAt: '2026-11-09T17:00Z',
  closedBefore: '2026-11',
  directorySerial: 1,
  nodes: [
    {
      nodeId: 'node.queretaro',
      name: 'Nodo estatal Querétaro',
      status: 'included',
      rejection: null,
      rows: 1,
    },
    {
      nodeId: 'node.federal',
      name: 'Nodo Federal',
      status: 'unreachable',
      rejection: null,
      rows: 0,
    },
  ],
  rows: [{ ...row, nodeId: 'node.queretaro' }],
};

/** Ejemplos sintéticos del grupo. */
export const PDN_EXAMPLES = {
  'request-pdn-token.request': tokenRequest,
  'request-pdn-token.response': tokenResponse,
  'pdn-token-error.content': tokenError,
  'pdn-error.content': pdnError,
  'query-pdn-statistics.request': statisticsRequest,
  'query-pdn-statistics.response': statisticsResponse,
  'list-pdn-statistics-authorities.response': authorities,
  'get-national-statistics.response': nationalStatistics,
} as const;

export type PdnExampleName = keyof typeof PDN_EXAMPLES;

/** Ejemplos de componentes que no son cuerpo de ninguna operación. */
export const PDN_EXTRA_EXAMPLES: Partial<Record<PdnComponentName, PdnExampleName>> = {
  PdnTokenError: 'pdn-token-error.content',
  PdnError: 'pdn-error.content',
};

const RESOURCE_ERRORS: readonly PdnErrorResponse[] = [
  {
    status: 400,
    description:
      'Consulta inválida: un campo desconocido, `page` menor que 1 o `pageSize` fuera de 1 a 200. `code` es `400`.',
    component: 'PdnError',
  },
  {
    status: 401,
    description:
      'Sin token o con un token vencido, de otro nodo o con firma inválida; `code` es `401` y la cabecera `WWW-Authenticate: Bearer error="invalid_token"`.',
    component: 'PdnError',
  },
  {
    status: 403,
    description:
      'El token no tiene el permiso `sesna:estadisticas`; `code` es `403` y la cabecera `WWW-Authenticate: Bearer error="insufficient_scope"`.',
    component: 'PdnError',
  },
];

export const PDN_OPERATIONS: readonly PdnOperation[] = [
  {
    operationId: 'requestPdnToken',
    method: 'post',
    path: PDN_ROUTES.token,
    tag: 'PDN',
    servedBy: 'node',
    summary: 'Pedir un token de acceso (OAuth 2.0)',
    description:
      'Servidor de autorización del nodo (RFC 6749), como el de las APIs de la PDN. El cliente se autentica con `Authorization: Basic` (client_secret_basic, recomendado) o con `client_id` y `client_secret` en el cuerpo (client_secret_post, como acepta el servidor OAuth de la PDN). Flujos: `password` con el usuario y la contraseña que el nodo entregó a la SESNA (el de la PDN; OAuth 2.1 lo desaconseja), `client_credentials` (recomendado, sin token de renovación) y `refresh_token` (de un solo uso). El cuerpo puede ir en formulario o en JSON. El token de acceso vive 5 minutos y solo vale en el nodo que lo emitió; el de renovación vive 7 minutos más (12 en total, dentro de la regla de ValidAPI: entre 5 y 10 minutos más que `expires_in`) y se borra al usarlo o al vencer. Tras 10 fallos de un cliente en 15 minutos responde `429` sin comparar nada. Los errores llevan los campos de RFC 6749 (`error`, `error_description`) y, además, `code` (el estatus HTTP) y `message`, como el `resError` de la PDN.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'PdnTokenRequest',
      example: 'request-pdn-token.request',
      mediaTypes: ['application/x-www-form-urlencoded', 'application/json'],
    },
    success: {
      status: 200,
      description: 'Token emitido.',
      body: { kind: 'json', component: 'PdnTokenResponse', example: 'request-pdn-token.response' },
    },
    errors: [],
    pdnErrors: [
      {
        status: 400,
        description:
          '`invalid_request`, `invalid_grant` (usuario, contraseña o token de renovación inválidos, vencidos o ya usados), `unauthorized_client`, `unsupported_grant_type` o `invalid_scope`; `code` es `400`.',
        component: 'PdnTokenError',
      },
      {
        status: 401,
        description:
          '`invalid_client`: identificador o secreto del cliente inválidos (con `WWW-Authenticate: Basic` si vino en la cabecera); `code` es `401`.',
        component: 'PdnTokenError',
      },
      {
        status: 429,
        description:
          'Demasiados fallos de ese cliente; se responde sin comparar credenciales (`code` es `429`).',
        component: 'PdnTokenError',
      },
    ],
  },
  {
    operationId: 'queryPdnStatistics',
    method: 'post',
    path: PDN_ROUTES.statistics,
    tag: 'PDN',
    servedBy: 'node',
    summary: 'Estadística agregada de denuncias',
    description:
      'Como `POST /v1/spic` del S2 y `POST /v1/ssancionados` del S3: `sort`, `page` (1 por omisión), `pageSize` (10 por omisión, de 1 a 200) y `query` (identificador, mes o rango de meses, entidad, autoridad, conducta y estatus); responde `{ pagination, results }`. Como pide ValidAPI: un cuerpo `{}` es válido, un filtro con cadena vacía se ignora, un `id` que no existe da `results: []` y una página después de la última también da `results: []`; `pageSize` fuera de rango o `page` menor que 1 dan `400`. Cada fila trae `id` y `fechaCaptura`, y sus valores de catálogo van como `{ clave, valor }`. Cada fila es un mes cerrado, una autoridad, una entidad y una conducta, con indicadores ya redondeados a múltiplos de 5 (al azar, con semilla fija por mes) y suprimidos (`null`) si quedan bajo 5; las medianas de tiempo solo con 10 observaciones o más. La tabla de cada mes se congela al cerrarse y los filtros solo eligen filas: ninguna consulta vuelve a sumar, así que no permite reconstruir una celda suprimida. Exige un token del nodo con `sesna:estadisticas`.',
    security: { oauth: [PDN_SCOPES.statistics] },
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'PdnStatisticsRequest',
      example: 'query-pdn-statistics.request',
    },
    success: {
      status: 200,
      description: 'Página de la estadística.',
      body: {
        kind: 'json',
        component: 'PdnStatisticsResponse',
        example: 'query-pdn-statistics.response',
      },
    },
    errors: [],
    pdnErrors: [
      ...RESOURCE_ERRORS,
      {
        status: 413,
        description: 'Consulta demasiado grande; `code` es `413`.',
        component: 'PdnError',
      },
      { status: 415, description: 'El cuerpo no es JSON; `code` es `415`.', component: 'PdnError' },
    ],
  },
  {
    operationId: 'listPdnStatisticsAuthorities',
    method: 'get',
    path: PDN_ROUTES.statisticsAuthorities,
    tag: 'PDN',
    servedBy: 'node',
    summary: 'Autoridades del nodo',
    description:
      'Catálogo de las autoridades que aloja el nodo (clave del directorio y nombre), sin repetidas y en orden alfabético por nombre, como `GET /v1/spic/dependencias` del S2. Sirve para el filtro `query.autoridad`. Exige un token del nodo con `sesna:estadisticas`.',
    security: { oauth: [PDN_SCOPES.statistics] },
    parameters: [],
    success: {
      status: 200,
      description: 'Autoridades del nodo.',
      body: {
        kind: 'json',
        component: 'PdnAuthorities',
        example: 'list-pdn-statistics-authorities.response',
      },
    },
    errors: [],
    pdnErrors: RESOURCE_ERRORS.filter((item) => item.status !== 400),
  },
];

/** Descripción del esquema de seguridad OAuth 2.0 de los nodos. */
export const PDN_OAUTH_DESCRIPTION =
  'OAuth 2.0 del nodo, con la metodología de las APIs de la PDN: cada nodo es el proveedor y su propio servidor de autorización (`POST /oauth/token` en el origen del nodo); la SESNA es el cliente con las credenciales que le entrega cada nodo. El token de acceso (JWT HS256, 5 minutos) solo lo verifica el nodo que lo emitió: `iss` y `aud` son el identificador del nodo, `sub` el cliente. Flujos: `password` (el de las APIs del S2 y del S3; desaconsejado en OAuth 2.1) y `clientCredentials` (recomendado).';
