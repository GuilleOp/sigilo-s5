// Cliente HTTP de bajo nivel: mismo origen, sin caché, sin referer y con respuestas validadas.
import { API_PREFIX, ApiErrorSchema, ROUTES } from '@sigilo/contracts';
import { markAuthorityActivity, notifySessionExpired } from './session-activity.ts';
import type { ApiErrorCode } from '@sigilo/contracts';

/** Esquema que valida una respuesta; los esquemas zod de contracts lo cumplen. */
export interface ResponseSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Códigos de fallo que ve la interfaz: los de la API más los del propio cliente. */
export type ClientErrorCode = ApiErrorCode | 'network' | 'invalid_response' | 'session_expired';

/** Mensajes en lectura fácil: dicen qué pasó y qué puede hacer la persona. */
const MESSAGES: Readonly<Record<ClientErrorCode, string>> = {
  bad_request: 'El sistema no aceptó los datos. Revisa lo que escribiste e inténtalo de nuevo.',
  not_found: 'No encontramos lo que buscas.',
  unauthorized: 'No tienes permiso para hacer esto. Revisa tus datos de acceso.',
  forbidden: 'Tu función no permite esta acción. Pídesela a quien le corresponde.',
  conflict: 'Esta acción no corresponde al estado actual del trámite. Recarga y revisa.',
  payload_too_large: 'El archivo o el mensaje es demasiado grande. Usa uno más pequeño.',
  unsupported_media_type: 'No podemos recibir este tipo de archivo.',
  rate_limited: 'Hubo demasiados intentos. Espera un rato y vuelve a intentarlo.',
  proof_required:
    'No pudimos completar la protección contra envíos automáticos. Inténtalo de nuevo.',
  storage_full: 'El sistema no tiene espacio para más pruebas por ahora. Inténtalo más tarde.',
  ledger_day_full:
    'El registro público ya no admite más movimientos por hoy. Inténtalo de nuevo mañana.',
  internal: 'El sistema tuvo un problema. Inténtalo más tarde.',
  network: 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.',
  invalid_response: 'Recibimos una respuesta extraña. Por seguridad, nos detuvimos.',
  session_expired:
    'Tu sesión se cerró por inactividad; vuelve a entrar. Lo que escribiste sigue aquí.',
};

/** Error de la API con un mensaje en español listo para mostrarse. */
export class ApiRequestError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;

  constructor(code: ClientErrorCode, status: number) {
    super(MESSAGES[code]);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

/** Función compatible con `fetch`; se inyecta para poder probar sin red. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Opciones de una petición. */
export interface RequestOptions {
  method?: 'GET' | 'POST';
  /** Cuerpo JSON (se serializa) o binario (se envía tal cual con `contentType`). */
  json?: unknown;
  binary?: Blob;
  contentType?: string;
  /** Token bearer de la autoridad. */
  bearer?: string;
  /** Cabeceras adicionales (por ejemplo, la prueba de trabajo). */
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
}

function statusToCode(status: number): ApiErrorCode {
  if (status === 400) return 'bad_request';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 413) return 'payload_too_large';
  if (status === 415) return 'unsupported_media_type';
  if (status === 428) return 'proof_required';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'ledger_day_full';
  if (status === 507) return 'storage_full';
  return 'internal';
}

/**
 * Error de la API a partir del estatus y del cuerpo de error ya leído (por ejemplo, de una respuesta
 * que llegó cifrada por la red). Usa el código del cuerpo si cumple el esquema común.
 */
export function apiErrorFrom(status: number, body: unknown): ApiRequestError {
  const parsed = ApiErrorSchema.safeParse(body);
  return new ApiRequestError(
    parsed.success ? parsed.data.error.code : statusToCode(status),
    status,
  );
}

/**
 * Construye la URL relativa de la API.
 * Seguridad: solo se admiten rutas bajo `/api/v1/` del mismo origen; nunca una URL absoluta.
 */
export function buildApiUrl(path: string, query?: Readonly<Record<string, string>>): string {
  if (!path.startsWith(`${API_PREFIX}/`) || path.includes('//') || path.includes('..')) {
    throw new Error('Ruta de API no permitida.');
  }
  if (query === undefined) return path;
  const search = new URLSearchParams(query).toString();
  return search === '' ? path : `${path}?${search}`;
}

/** Cliente con `fetch` inyectable. */
export interface ApiClient {
  /** Petición cuya respuesta JSON se valida con `schema`. */
  json<T>(path: string, schema: ResponseSchema<T>, options?: RequestOptions): Promise<T>;
  /** Petición cuya respuesta se devuelve como texto. */
  text(path: string, options?: RequestOptions): Promise<string>;
  /** Petición cuya respuesta se devuelve como `Blob`. */
  blob(path: string, options?: RequestOptions): Promise<Blob>;
}

/** Crea un cliente de API. Por omisión usa el `fetch` del navegador. */
/** Reintentos ante fallos de conexión (modo de poca conexión). */
export interface RetryOptions {
  /**
   * Reintentos de las consultas `GET` (los envíos nunca se repiten solos). Puede ser una función:
   * se consulta en cada petición (por ejemplo, el modo de poca conexión).
   */
  retries?: number | (() => number);
  /** Espera antes de cada reintento, en milisegundos. */
  delayMs?: (attempt: number) => number;
  /** Aviso a la persona antes de reintentar. */
  onRetry?: (attempt: number, retries: number) => void;
}

/** Reintentos por omisión: dos, tras 1 y 3 segundos. */
export const DEFAULT_GET_RETRIES = 2;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createApiClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
  retry: RetryOptions = {},
): ApiClient {
  const retriesFor = (): number =>
    typeof retry.retries === 'function' ? retry.retries() : (retry.retries ?? DEFAULT_GET_RETRIES);
  const delayMs = retry.delayMs ?? ((attempt: number) => (attempt === 1 ? 1000 : 3000));
  /**
   * Seguridad: solo se repiten las consultas `GET`, que no cambian nada; un envío repetido podría
   * duplicar una denuncia o un mensaje, así que en ese caso la persona decide si reintenta.
   */
  async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    const isIdempotent = (init.method ?? 'GET') === 'GET';
    const retries = retriesFor();
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fetchImpl(url, init);
      } catch (error) {
        if (!isIdempotent || attempt >= retries) throw error;
        retry.onRetry?.(attempt + 1, retries);
        await wait(delayMs(attempt + 1));
      }
    }
  }

  async function send(path: string, options: RequestOptions): Promise<Response> {
    const headers = new Headers();
    let body: BodyInit | undefined;
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.json);
    } else if (options.binary !== undefined) {
      headers.set('Content-Type', options.contentType ?? options.binary.type);
      body = options.binary;
    }
    if (options.bearer !== undefined) headers.set('Authorization', `Bearer ${options.bearer}`);
    for (const [name, value] of Object.entries(options.headers ?? {})) headers.set(name, value);

    let response: Response;
    try {
      response = await fetchWithRetry(buildApiUrl(path, options.query), {
        method: options.method ?? (body === undefined ? 'GET' : 'POST'),
        headers,
        ...(body === undefined ? {} : { body }),
        // Seguridad: sin cookies, sin caché, sin referer y sin seguir redirecciones a otro sitio.
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        mode: 'same-origin',
      });
    } catch {
      throw new ApiRequestError('network', 0);
    }
    if (!response.ok) {
      let code = statusToCode(response.status);
      try {
        const parsed = ApiErrorSchema.safeParse(await response.json());
        if (parsed.success) code = parsed.data.error.code;
      } catch {
        // Cuerpo no JSON: basta el código de estado.
      }
      // H2: con token, un 401 es una sesión vencida (por inactividad o duración), no falta de
      // permiso: la pantalla lo dice así y pide volver a entrar sin perder lo escrito.
      const isLogout = path === ROUTES.authLogout;
      if (response.status === 401 && options.bearer !== undefined && !isLogout) {
        notifySessionExpired();
        throw new ApiRequestError('session_expired', response.status);
      }
      throw new ApiRequestError(code, response.status);
    }
    if (options.bearer !== undefined) markAuthorityActivity();
    return response;
  }

  return {
    async json(path, schema, options = {}) {
      const response = await send(path, options);
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new ApiRequestError('invalid_response', response.status);
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new ApiRequestError('invalid_response', response.status);
      return parsed.data;
    },
    async text(path, options = {}) {
      return (await send(path, options)).text();
    },
    async blob(path, options = {}) {
      return (await send(path, options)).blob();
    },
  };
}

/** Texto de error para mostrar a partir de cualquier excepción, sin filtrar detalles internos. */
export function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) return error.message;
  return fallback;
}
