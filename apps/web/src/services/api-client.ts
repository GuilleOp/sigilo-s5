// Cliente HTTP de bajo nivel: mismo origen, sin caché, sin referer y con respuestas validadas.
import { API_PREFIX, ApiErrorSchema } from '@sigilo/contracts';
import type { ApiErrorCode } from '@sigilo/contracts';

/** Esquema que valida una respuesta; los esquemas zod de contracts lo cumplen. */
export interface ResponseSchema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** Códigos de fallo que ve la interfaz: los de la API más los del propio cliente. */
export type ClientErrorCode = ApiErrorCode | 'network' | 'invalid_response';

/** Mensajes en lectura fácil: dicen qué pasó y qué puede hacer la persona. */
const MESSAGES: Readonly<Record<ClientErrorCode, string>> = {
  bad_request: 'El sistema no aceptó los datos. Revisa lo que escribiste e inténtalo de nuevo.',
  not_found: 'No encontramos lo que buscas.',
  unauthorized: 'No tienes permiso para hacer esto. Revisa tus datos de acceso.',
  payload_too_large: 'El archivo o el mensaje es demasiado grande. Usa uno más pequeño.',
  unsupported_media_type: 'No podemos recibir este tipo de archivo.',
  rate_limited: 'Hubo demasiados intentos. Espera un rato y vuelve a intentarlo.',
  proof_required:
    'No pudimos completar la protección contra envíos automáticos. Inténtalo de nuevo.',
  storage_full: 'El sistema no tiene espacio para más pruebas por ahora. Inténtalo más tarde.',
  internal: 'El sistema tuvo un problema. Inténtalo más tarde.',
  network: 'No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.',
  invalid_response: 'Recibimos una respuesta extraña. Por seguridad, nos detuvimos.',
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
  if (status === 507) return 'storage_full';
  return 'internal';
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
export function createApiClient(
  fetchImpl: FetchLike = (input, init) => fetch(input, init),
): ApiClient {
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
      response = await fetchImpl(buildApiUrl(path, options.query), {
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
      throw new ApiRequestError(code, response.status);
    }
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
