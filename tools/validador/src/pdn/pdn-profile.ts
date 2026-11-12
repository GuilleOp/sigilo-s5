// Perfil «conexión PDN» del validador: reproduce, contra el nodo de un estado, los casos con que la
// SESNA prueba a un proveedor en su protocolo de conexión (ValidAPI): generación y vida del token
// OAuth 2.0, renovación de un solo uso, consulta sin parámetros, paginación, `pageSize`, filtros
// vacíos, filtrado por `id`, ordenamiento, catálogo de autoridades, forma de los errores
// (`resError`), https en productivo y el aviso de menos de 50 registros. Solo hace peticiones de
// consulta con las credenciales que el propio estado le dio a la SESNA: no crea ni cambia nada.
import { PdnAuthoritiesSchema, PdnStatisticsResponseSchema } from '@sigilo/contracts';
import type { PdnStatisticsResponse } from '@sigilo/contracts';
import { TOOL_NAME, TOOL_VERSION, USER_AGENT } from '../version.ts';

/** Resultado de un caso, con los nombres de ValidAPI. */
export type PdnCaseStatus = 'aprobado' | 'no_aprobado' | 'advertencia' | 'no_evaluado';

/** Ambiente de la corrida: en productivo, la ruta del token y la de consulta deben ser https. */
export type PdnEnvironment = 'desarrollo' | 'productivo';

/** Categoría del protocolo de conexión de la SESNA. */
export type PdnCategory = 'seguridad' | 'funcional' | 'estres';

/** Resultado de un caso. */
export interface PdnCaseResult {
  id: string;
  title: string;
  category: PdnCategory;
  status: PdnCaseStatus;
  /** Conclusión en una o dos frases. */
  detail: string;
  /** Peticiones hechas y lo que respondieron (sin credenciales ni tokens). */
  evidence: string[];
}

/** Credenciales que el estado entregó a la SESNA (flujo `password` o `client_credentials`). */
export interface PdnCredentials {
  clientId: string;
  clientSecret: string;
  username?: string;
  password?: string;
  scope?: string;
}

/** Fetch inyectable (las pruebas usan un nodo en el mismo proceso). */
export type PdnFetch = (input: string, init: RequestInit) => Promise<Response>;

/** Opciones de una corrida. */
export interface PdnProfileOptions {
  /** Ruta del token, p. ej. `https://nodo.example.org/oauth/token`. */
  tokenUrl: string;
  /** Ruta de consulta, p. ej. `https://nodo.example.org/v1/denuncias/estadisticas`. */
  queryUrl: string;
  /** Catálogo de autoridades; por omisión, `<queryUrl>/autoridades`. */
  authoritiesUrl?: string;
  credentials: PdnCredentials;
  environment: PdnEnvironment;
  /** Espera a que venza el token y comprueba que ya no sirve (tarda `expires_in` segundos). */
  waitForExpiry?: boolean;
  fetch?: PdnFetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  timeoutMs?: number;
}

/** Reporte de la corrida. */
export interface PdnProfileReport {
  schemaVersion: 1;
  tool: { name: string; version: string };
  profile: 'conexion-pdn';
  environment: PdnEnvironment;
  target: { tokenUrl: string; queryUrl: string; authoritiesUrl: string };
  startedAt: string;
  finishedAt: string;
  summary: Record<PdnCaseStatus, number>;
  cases: PdnCaseResult[];
}

/** Casos del perfil, en el orden del reporte (los nombres siguen a los de ValidAPI). */
export const PDN_CASES = [
  { id: 'CPDEN-01', category: 'seguridad', title: 'Generación de token' },
  { id: 'CPDEN-02', category: 'seguridad', title: 'Tiempo de vida del token' },
  { id: 'CPDEN-03', category: 'seguridad', title: 'Token nuevo en cada petición' },
  { id: 'CPDEN-04', category: 'seguridad', title: 'Verificación de expiración del token' },
  { id: 'CPDEN-05', category: 'seguridad', title: 'Verificación del flujo refresh_token' },
  { id: 'CPDEN-06', category: 'seguridad', title: 'Consulta con un token inválido' },
  { id: 'CPDEN-07', category: 'seguridad', title: 'Protocolo https' },
  { id: 'CPDEN-08', category: 'funcional', title: 'Respuesta sin envío de parámetros' },
  { id: 'CPDEN-09', category: 'funcional', title: 'Validación de paginación' },
  { id: 'CPDEN-10', category: 'funcional', title: 'Validación de pageSize' },
  { id: 'CPDEN-11', category: 'funcional', title: 'Filtrado por id' },
  { id: 'CPDEN-12', category: 'funcional', title: 'Filtros con cadena vacía' },
  { id: 'CPDEN-13', category: 'funcional', title: 'Ordenamiento por mes' },
  { id: 'CPDEN-14', category: 'funcional', title: 'Consulta de autoridades' },
  { id: 'CPDEN-15', category: 'funcional', title: 'Estructura de los errores (resError)' },
  { id: 'CPDEN-16', category: 'funcional', title: 'Volumen de registros' },
  { id: 'CPDEN-17', category: 'estres', title: 'Pruebas de estrés' },
] as const satisfies readonly { id: string; category: PdnCategory; title: string }[];

type CaseId = (typeof PDN_CASES)[number]['id'];

/** Vida del token de acceso que acepta ValidAPI: de 5 minutos a 1 hora. */
export const TOKEN_LIFETIME_RANGE = { min: 300, max: 3600 } as const;
/** Lo que el token de renovación debe durar de más: de 5 a 10 minutos. */
export const REFRESH_EXTRA_RANGE = { min: 300, max: 600 } as const;
/** Registros con los que ValidAPI deja de avisar en desarrollo. */
export const MIN_RECORDS = 50;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 200;
const EMPTY_FILTERS = [
  'id',
  'mes',
  'mesDesde',
  'mesHasta',
  'entidad',
  'autoridad',
  'conducta',
  'estatus',
];

interface HttpResult {
  status: number;
  json: unknown;
}

interface TokenResult {
  ok: boolean;
  status: number;
  accessToken?: string;
  tokenType?: unknown;
  expiresIn?: number;
  refreshToken?: string;
  refreshExpiresIn?: number;
  body: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Indica si el cuerpo tiene la forma `resError`: `code` igual al estatus HTTP 4xx y `message`. */
export function isResError(status: number, body: unknown): boolean {
  if (!isObject(body)) return false;
  return (
    typeof body.code === 'number' &&
    body.code === status &&
    body.code >= 400 &&
    body.code <= 499 &&
    typeof body.message === 'string' &&
    body.message !== ''
  );
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Ejecuta el perfil completo. Nunca lanza por fallas del nodo: las reporta en los casos. */
export async function runPdnProfile(options: PdnProfileOptions): Promise<PdnProfileReport> {
  const now = options.now ?? (() => new Date());
  const doFetch: PdnFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const sleep =
    options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? 15_000;
  const authoritiesUrl =
    options.authoritiesUrl ?? `${options.queryUrl.replace(/\/$/u, '')}/autoridades`;
  const startedAt = now().toISOString();
  const results = new Map<CaseId, Omit<PdnCaseResult, 'id' | 'title' | 'category'>>();
  const set = (id: CaseId, status: PdnCaseStatus, detail: string, evidence: string[] = []) => {
    results.set(id, { status, detail, evidence });
  };
  /** Errores vistos en la corrida, para CPDEN-15. */
  const errors: { what: string; status: number; body: unknown }[] = [];

  const request = async (
    what: string,
    url: string,
    init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
  ): Promise<HttpResult> => {
    try {
      const response = await doFetch(url, {
        method: init.method,
        headers: { 'User-Agent': USER_AGENT, ...init.headers },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        ...(init.body === undefined ? {} : { body: init.body }),
      });
      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        json = undefined;
      }
      if (response.status >= 400) errors.push({ what, status: response.status, body: json });
      return { status: response.status, json };
    } catch {
      return { status: 0, json: undefined };
    }
  };

  const { credentials } = options;
  const grant =
    credentials.username !== undefined && credentials.password !== undefined
      ? 'password'
      : 'client_credentials';
  const grantParams: Record<string, string> = {
    grant_type: grant,
    ...(grant === 'password'
      ? { username: credentials.username ?? '', password: credentials.password ?? '' }
      : {}),
    ...(credentials.scope === undefined ? {} : { scope: credentials.scope }),
  };
  const form = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const basic = `Basic ${Buffer.from(
    `${encodeURIComponent(credentials.clientId)}:${encodeURIComponent(credentials.clientSecret)}`,
  ).toString('base64')}`;

  const askToken = async (
    what: string,
    params: Record<string, string>,
    method: 'cuerpo' | 'basic',
  ): Promise<TokenResult> => {
    const body =
      method === 'cuerpo'
        ? { ...params, client_id: credentials.clientId, client_secret: credentials.clientSecret }
        : params;
    const result = await request(what, options.tokenUrl, {
      method: 'POST',
      headers: method === 'basic' ? { ...form, Authorization: basic } : form,
      body: new URLSearchParams(body).toString(),
    });
    const json = isObject(result.json) ? result.json : {};
    const accessToken = typeof json.access_token === 'string' ? json.access_token : undefined;
    return {
      ok: result.status === 200 && accessToken !== undefined,
      status: result.status,
      ...(accessToken === undefined ? {} : { accessToken }),
      tokenType: json.token_type,
      ...(typeof json.expires_in === 'number' ? { expiresIn: json.expires_in } : {}),
      ...(typeof json.refresh_token === 'string' ? { refreshToken: json.refresh_token } : {}),
      ...(typeof json.refresh_token_expires_in === 'number'
        ? { refreshExpiresIn: json.refresh_token_expires_in }
        : {}),
      body: result.json,
    };
  };

  const tokenPath = pathOf(options.tokenUrl);
  const queryPath = pathOf(options.queryUrl);

  // CPDEN-01: los dos métodos de autenticación del cliente que acepta ValidAPI.
  const inBody = await askToken('Token con las credenciales en el cuerpo', grantParams, 'cuerpo');
  const inBasic = await askToken('Token con Authorization: Basic', grantParams, 'basic');
  const tokenEvidence = [
    `POST ${tokenPath} (grant_type=${grant}, credenciales en el cuerpo) → ${inBody.status}`,
    `POST ${tokenPath} (grant_type=${grant}, Authorization: Basic) → ${inBasic.status}`,
  ];
  const bearerOk = (token: TokenResult) => token.ok && token.tokenType === 'Bearer';
  if (!tokenPath.includes('/oauth/token')) {
    set('CPDEN-01', 'no_aprobado', 'La ruta del token debe contener /oauth/token.', tokenEvidence);
  } else if (bearerOk(inBody) && bearerOk(inBasic)) {
    set(
      'CPDEN-01',
      'aprobado',
      'Emite un token Bearer con las credenciales en el cuerpo y con Authorization: Basic.',
      tokenEvidence,
    );
  } else {
    set(
      'CPDEN-01',
      'no_aprobado',
      'No emitió un token Bearer con alguno de los dos métodos (credenciales en el cuerpo o Authorization: Basic).',
      tokenEvidence,
    );
  }
  const first = bearerOk(inBody) ? inBody : bearerOk(inBasic) ? inBasic : undefined;
  const token = first?.accessToken;

  // CPDEN-02: de 5 minutos a 1 hora.
  if (first?.expiresIn === undefined) {
    set('CPDEN-02', 'no_evaluado', 'No hubo un token con expires_in.');
  } else {
    const isInRange =
      first.expiresIn >= TOKEN_LIFETIME_RANGE.min && first.expiresIn <= TOKEN_LIFETIME_RANGE.max;
    set(
      'CPDEN-02',
      isInRange ? 'aprobado' : 'no_aprobado',
      isInRange
        ? `expires_in es ${first.expiresIn} s, dentro de 5 minutos a 1 hora.`
        : `expires_in es ${first.expiresIn} s; debe estar entre ${TOKEN_LIFETIME_RANGE.min} y ${TOKEN_LIFETIME_RANGE.max}.`,
    );
  }

  // CPDEN-03: un token nuevo en cada petición.
  if (inBody.accessToken === undefined || inBasic.accessToken === undefined) {
    set('CPDEN-03', 'no_evaluado', 'Hacen falta dos tokens emitidos.');
  } else {
    const isNew = inBody.accessToken !== inBasic.accessToken;
    set(
      'CPDEN-03',
      isNew ? 'aprobado' : 'no_aprobado',
      isNew
        ? 'Cada petición recibió un token distinto.'
        : 'Dos peticiones recibieron el mismo token.',
    );
  }

  const authorized = (value: string | undefined) => ({
    'Content-Type': 'application/json',
    ...(value === undefined ? {} : { Authorization: `Bearer ${value}` }),
  });
  const query = (what: string, body: unknown, bearer = token) =>
    request(what, options.queryUrl, {
      method: 'POST',
      headers: authorized(bearer),
      body: JSON.stringify(body),
    });
  const asPage = (result: HttpResult): PdnStatisticsResponse | null => {
    if (result.status !== 200) return null;
    const parsed = PdnStatisticsResponseSchema.safeParse(result.json);
    return parsed.success ? parsed.data : null;
  };

  // CPDEN-05: renovación (opcional en ValidAPI): duración y un solo uso.
  const refreshToken = first?.refreshToken;
  if (first === undefined || refreshToken === undefined) {
    set('CPDEN-05', 'no_evaluado', 'El nodo no entregó refresh_token (la renovación es opcional).');
  } else {
    const extra =
      first.refreshExpiresIn === undefined || first.expiresIn === undefined
        ? undefined
        : first.refreshExpiresIn - first.expiresIn;
    const renewed = await askToken(
      'Renovación con refresh_token',
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      'basic',
    );
    const reused = await askToken(
      'Segundo uso del mismo refresh_token',
      { grant_type: 'refresh_token', refresh_token: refreshToken },
      'basic',
    );
    const evidence = [
      `refresh_token_expires_in − expires_in = ${extra === undefined ? 'sin dato' : `${extra} s`}`,
      `POST ${tokenPath} (grant_type=refresh_token) → ${renewed.status}`,
      `POST ${tokenPath} (mismo refresh_token otra vez) → ${reused.status}`,
    ];
    const problems: string[] = [];
    if (extra === undefined) problems.push('falta refresh_token_expires_in');
    else if (extra < REFRESH_EXTRA_RANGE.min || extra > REFRESH_EXTRA_RANGE.max) {
      problems.push(`debe durar de 5 a 10 minutos más que expires_in y dura ${extra} s más`);
    }
    if (!renewed.ok) problems.push('no emitió un token nuevo con el refresh_token');
    if (reused.ok || reused.status < 400 || reused.status > 499) {
      problems.push('aceptó el mismo refresh_token dos veces (debe ser de un solo uso)');
    }
    set(
      'CPDEN-05',
      problems.length === 0 ? 'aprobado' : 'no_aprobado',
      problems.length === 0
        ? 'Renueva el token, el refresh_token dura de 5 a 10 minutos más y es de un solo uso.'
        : `El refresh_token ${problems.join('; ')}.`,
      evidence,
    );
  }

  // CPDEN-06: un token inválido responde 401 con resError.
  const invalid = await query('Consulta con un token inválido', {}, 'token-invalido-del-validador');
  set(
    'CPDEN-06',
    invalid.status === 401 && isResError(401, invalid.json) ? 'aprobado' : 'no_aprobado',
    invalid.status === 401
      ? isResError(401, invalid.json)
        ? 'Rechaza el token inválido con 401 y la estructura resError.'
        : 'Rechaza el token inválido con 401, pero sin la estructura resError (code = 401 y message).'
      : `Con un token inválido respondió ${invalid.status}; debe ser 401.`,
    [`POST ${queryPath} (Bearer inválido) → ${invalid.status}`],
  );

  // CPDEN-07: https en productivo.
  const isHttps = [options.tokenUrl, options.queryUrl, authoritiesUrl].every((url) =>
    url.startsWith('https://'),
  );
  if (isHttps) {
    set('CPDEN-07', 'aprobado', 'La ruta del token y la de consulta usan https.');
  } else {
    set(
      'CPDEN-07',
      options.environment === 'productivo' ? 'no_aprobado' : 'advertencia',
      options.environment === 'productivo'
        ? 'En el ambiente productivo, la ruta del token y la de consulta deben usar https.'
        : 'La ruta del token o la de consulta no usa https: se acepta en desarrollo, no en productivo.',
    );
  }

  if (token === undefined) {
    for (const item of PDN_CASES) {
      if (item.category === 'funcional' && !results.has(item.id)) {
        set(item.id, 'no_evaluado', 'Sin token no se pudo consultar.');
      }
    }
  } else {
    // CPDEN-08: un cuerpo `{}` responde con la paginación por omisión.
    const emptyBody = await query('Consulta sin parámetros', {});
    const base = asPage(emptyBody);
    const totalRows = base?.pagination.totalRows ?? 0;
    if (base === null) {
      set(
        'CPDEN-08',
        'no_aprobado',
        `La consulta con {} respondió ${emptyBody.status} o una respuesta que no cumple el esquema.`,
        [`POST ${queryPath} {} → ${emptyBody.status}`],
      );
    } else {
      const isDefault =
        base.pagination.pageSize === DEFAULT_PAGE_SIZE &&
        base.pagination.page === 1 &&
        base.results.length <= DEFAULT_PAGE_SIZE;
      set(
        'CPDEN-08',
        isDefault ? 'aprobado' : 'no_aprobado',
        isDefault
          ? `Responde con page 1 y el tamaño por omisión (${DEFAULT_PAGE_SIZE}); totalRows = ${totalRows}.`
          : `El tamaño de página no coincide con el tamaño por omisión (${DEFAULT_PAGE_SIZE}).`,
        [`POST ${queryPath} {} → ${emptyBody.status}`],
      );
    }

    // CPDEN-09: la página después de la última da results vacío; page 0 es error.
    const pastPage = Math.ceil(totalRows / DEFAULT_PAGE_SIZE) + 1;
    const past = await query('Página después de la última', { page: pastPage });
    const pastData = asPage(past);
    const zero = await query('Página 0', { page: 0 });
    const paginationProblems: string[] = [];
    if (pastData === null) paginationProblems.push(`page ${pastPage} respondió ${past.status}`);
    else {
      if (pastData.results.length > 0) paginationProblems.push(`page ${pastPage} trae filas`);
      if (pastData.pagination.hasNextPage) paginationProblems.push('hasNextPage es true');
      if (pastData.pagination.totalRows !== totalRows) {
        paginationProblems.push('totalRows cambia entre páginas');
      }
    }
    if (base !== null && base.pagination.hasNextPage !== totalRows > DEFAULT_PAGE_SIZE) {
      paginationProblems.push('hasNextPage de la página 1 no coincide con totalRows');
    }
    if (zero.status < 400 || zero.status > 499) {
      paginationProblems.push(
        `page 0 respondió ${zero.status} (debe ser un error: valor fuera de rango)`,
      );
    }
    set(
      'CPDEN-09',
      paginationProblems.length === 0 ? 'aprobado' : 'no_aprobado',
      paginationProblems.length === 0
        ? `La página ${pastPage} responde results vacío con el mismo totalRows y page 0 es un error.`
        : `Paginación: ${paginationProblems.join('; ')}.`,
      [
        `POST ${queryPath} {"page":${pastPage}} → ${past.status}`,
        `POST ${queryPath} {"page":0} → ${zero.status}`,
      ],
    );

    // CPDEN-10: pageSize de 1 a 200; fuera de rango, error.
    const sizes = [0, MAX_PAGE_SIZE + 1, MAX_PAGE_SIZE];
    const sizeResults: HttpResult[] = [];
    for (const pageSize of sizes)
      sizeResults.push(await query(`pageSize ${pageSize}`, { pageSize }));
    const [tooSmall, tooLarge, largest] = sizeResults;
    const largestData = largest === undefined ? null : asPage(largest);
    const sizeOk =
      tooSmall !== undefined &&
      tooLarge !== undefined &&
      tooSmall.status >= 400 &&
      tooSmall.status <= 499 &&
      tooLarge.status >= 400 &&
      tooLarge.status <= 499 &&
      largestData?.pagination.pageSize === MAX_PAGE_SIZE;
    set(
      'CPDEN-10',
      sizeOk ? 'aprobado' : 'no_aprobado',
      sizeOk
        ? `pageSize 0 y ${MAX_PAGE_SIZE + 1} son error y ${MAX_PAGE_SIZE} es válido.`
        : `pageSize debe aceptar de 1 a ${MAX_PAGE_SIZE} y dar error fuera de ese rango.`,
      sizes.map(
        (size, index) =>
          `POST ${queryPath} {"pageSize":${size}} → ${sizeResults[index]?.status ?? 0}`,
      ),
    );

    // CPDEN-11: filtrado por id; un id que no existe da results vacío, nunca un error.
    const missing = await query('id inexistente', {
      query: { id: 'id-inexistente-del-validador' },
    });
    const missingData = asPage(missing);
    const firstId = base?.results[0]?.id;
    const evidence11 = [`POST ${queryPath} {"query":{"id":"<inexistente>"}} → ${missing.status}`];
    if (missingData === null || missingData.results.length > 0) {
      set(
        'CPDEN-11',
        'no_aprobado',
        'Un id que no existe debe responder 200 con results vacío; en ningún caso un error.',
        evidence11,
      );
    } else if (firstId === undefined) {
      set(
        'CPDEN-11',
        'advertencia',
        'Un id inexistente da results vacío, pero el nodo no tiene filas para probar un id existente.',
        evidence11,
      );
    } else {
      const found = await query('id existente', { query: { id: firstId } });
      const foundData = asPage(found);
      evidence11.push(
        `POST ${queryPath} {"query":{"id":"<de la primera fila>"}} → ${found.status}`,
      );
      const isExact =
        foundData !== null &&
        foundData.results.length === 1 &&
        foundData.results[0]?.id === firstId &&
        foundData.pagination.totalRows === 1;
      set(
        'CPDEN-11',
        isExact ? 'aprobado' : 'no_aprobado',
        isExact
          ? 'El filtro por id devuelve solo esa fila y un id inexistente da results vacío.'
          : 'El filtro por id no devolvió exactamente la fila pedida.',
        evidence11,
      );
    }

    // CPDEN-12: una cadena vacía hace que se ignore el filtro.
    const blank = await query('Filtros vacíos', {
      query: Object.fromEntries(EMPTY_FILTERS.map((name) => [name, ''])),
    });
    const blankData = asPage(blank);
    const sameTotal = blankData !== null && blankData.pagination.totalRows === totalRows;
    set(
      'CPDEN-12',
      sameTotal ? 'aprobado' : 'no_aprobado',
      sameTotal
        ? 'Los filtros con cadena vacía se ignoran: el resultado es el mismo que sin filtros.'
        : `Con todos los filtros en cadena vacía respondió ${blank.status}${blankData === null ? '' : ` con totalRows ${blankData.pagination.totalRows} (sin filtros: ${totalRows})`}.`,
      [
        `POST ${queryPath} {"query":{${EMPTY_FILTERS.map((name) => `"${name}":""`).join(',')}}} → ${blank.status}`,
      ],
    );

    // CPDEN-13: orden ascendente y descendente.
    const ordered: Record<'asc' | 'desc', HttpResult> = {
      asc: await query('Orden ascendente por mes', {
        sort: { mes: 'asc' },
        pageSize: MAX_PAGE_SIZE,
      }),
      desc: await query('Orden descendente por mes', {
        sort: { mes: 'desc' },
        pageSize: MAX_PAGE_SIZE,
      }),
    };
    const isSorted = (direction: 'asc' | 'desc'): boolean | null => {
      const data = asPage(ordered[direction]);
      if (data === null) return null;
      const months = data.results.map((row) => row.mes);
      return months.every((month, index) => {
        const previous = months[index - 1];
        if (previous === undefined) return true;
        return direction === 'asc' ? previous <= month : previous >= month;
      });
    };
    const ascending = isSorted('asc');
    const descending = isSorted('desc');
    set(
      'CPDEN-13',
      ascending === true && descending === true ? 'aprobado' : 'no_aprobado',
      ascending === true && descending === true
        ? 'Ordena por mes en forma ascendente y descendente.'
        : 'El orden por mes no se respetó o la consulta falló.',
      [
        `POST ${queryPath} {"sort":{"mes":"asc"}} → ${ordered.asc.status}`,
        `POST ${queryPath} {"sort":{"mes":"desc"}} → ${ordered.desc.status}`,
      ],
    );

    // CPDEN-14: catálogo de autoridades sin repetidas y en orden alfabético por nombre.
    const catalog = await request('Catálogo de autoridades', authoritiesUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const authorities = PdnAuthoritiesSchema.safeParse(catalog.json);
    const evidence14 = [`GET ${pathOf(authoritiesUrl)} → ${catalog.status}`];
    if (catalog.status !== 200 || !authorities.success) {
      set(
        'CPDEN-14',
        'no_aprobado',
        `El catálogo respondió ${catalog.status} o no cumple el esquema.`,
        evidence14,
      );
    } else {
      const names = authorities.data.map((item) => item.nombre);
      const isUnique = new Set(authorities.data.map((item) => item.clave)).size === names.length;
      const isAlphabetical = names.every(
        (name, index) => index === 0 || (names[index - 1] ?? '').localeCompare(name, 'es') <= 0,
      );
      const rowAuthorities = new Set((base?.results ?? []).map((row) => row.autoridad.clave));
      const known = new Set(authorities.data.map((item) => item.clave));
      const isCongruent = [...rowAuthorities].every((clave) => known.has(clave));
      const problems = [
        ...(isUnique ? [] : ['tiene autoridades repetidas']),
        ...(isAlphabetical ? [] : ['no está en orden alfabético por nombre']),
        ...(isCongruent ? [] : ['no incluye autoridades que aparecen en la consulta']),
      ];
      set(
        'CPDEN-14',
        problems.length === 0 ? 'aprobado' : 'no_aprobado',
        problems.length === 0
          ? `${names.length} autoridades sin repetidas, en orden alfabético y congruentes con la consulta.`
          : `El catálogo ${problems.join('; ')}.`,
        evidence14,
      );
    }

    // CPDEN-16: aviso con menos de 50 registros.
    set(
      'CPDEN-16',
      totalRows >= MIN_RECORDS ? 'aprobado' : 'advertencia',
      totalRows >= MIN_RECORDS
        ? `El endpoint trabaja con ${totalRows} registros.`
        : `El endpoint está trabajando con menos de ${MIN_RECORDS} registros (${totalRows}).`,
    );
  }

  // CPDEN-04: el token deja de servir al cumplirse expires_in (solo si se pide esperar).
  if (token === undefined || first?.expiresIn === undefined) {
    set('CPDEN-04', 'no_evaluado', 'No hubo un token con expires_in.');
  } else if (options.waitForExpiry !== true) {
    set(
      'CPDEN-04',
      'no_evaluado',
      `Requiere esperar ${first.expiresIn} s a que venza el token (opción --esperar-vencimiento).`,
    );
  } else {
    await sleep((first.expiresIn + 1) * 1000);
    const expired = await query('Consulta con el token vencido', {});
    const isRejected = expired.status === 401 && isResError(401, expired.json);
    set(
      'CPDEN-04',
      isRejected ? 'aprobado' : 'no_aprobado',
      isRejected
        ? 'Al vencer, el token se rechaza con 401 y la estructura resError.'
        : `Con el token vencido respondió ${expired.status}; debe ser 401 con la estructura resError.`,
      [`POST ${queryPath} (token vencido) → ${expired.status}`],
    );
  }

  // CPDEN-15: cada error visto en la corrida tiene la estructura resError.
  const resourceErrors = errors.filter((item) => item.status >= 400 && item.status <= 499);
  const wrong = resourceErrors.filter((item) => !isResError(item.status, item.body));
  if (resourceErrors.length === 0) {
    set('CPDEN-15', 'no_evaluado', 'La corrida no provocó ningún error que revisar.');
  } else {
    set(
      'CPDEN-15',
      wrong.length === 0 ? 'aprobado' : 'no_aprobado',
      wrong.length === 0
        ? `Los ${resourceErrors.length} errores tienen code (el estatus HTTP 4xx) y message en el primer nivel.`
        : 'El error recibido no cuenta con la estructura especificada (code con el estatus HTTP 4xx y message).',
      wrong.map((item) => `${item.what} → ${item.status} sin resError`),
    );
  }

  set(
    'CPDEN-17',
    'no_evaluado',
    'Las pruebas de estrés de la SESNA (concurrencia y duración) no se publican; esta versión no las reproduce.',
  );

  const cases: PdnCaseResult[] = PDN_CASES.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category,
    ...(results.get(item.id) ?? { status: 'no_evaluado', detail: 'Sin resultado.', evidence: [] }),
  }));
  const summary: Record<PdnCaseStatus, number> = {
    aprobado: 0,
    no_aprobado: 0,
    advertencia: 0,
    no_evaluado: 0,
  };
  for (const item of cases) summary[item.status] += 1;
  return {
    schemaVersion: 1,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    profile: 'conexion-pdn',
    environment: options.environment,
    target: { tokenUrl: options.tokenUrl, queryUrl: options.queryUrl, authoritiesUrl },
    startedAt,
    finishedAt: now().toISOString(),
    summary,
    cases,
  };
}
