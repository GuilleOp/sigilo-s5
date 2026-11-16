// Errores de la API con formato uniforme (`ApiErrorSchema`) y mensajes fijos.
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { API_ERROR_HTTP_STATUS, API_ERROR_MESSAGES } from '@sigilo/contracts';
import type { ApiError, ApiErrorCode } from '@sigilo/contracts';

// El estatus y el mensaje de cada código vienen del contrato, que también los publica en el
// estándar. Seguridad: los mensajes son fijos; nunca incluyen detalles internos ni datos de la
// solicitud. La única excepción es un `conflict` por un plazo legal abierto, que dice hasta qué día
// corre (un dato del propio trámite que la autoridad ya ve en su panel).
const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, ContentfulStatusCode>> = API_ERROR_HTTP_STATUS;
const MESSAGE_BY_CODE = API_ERROR_MESSAGES;

/** Error de la API que se traduce a una respuesta con su código y estatus HTTP. */
export class ApiFailure extends Error {
  readonly code: ApiErrorCode;

  /**
   * `message` solo se usa en un `conflict` por un plazo legal abierto («La sentencia todavía puede
   * apelarse hasta el …»); nunca lleva datos de la solicitud.
   */
  constructor(code: ApiErrorCode, message?: string) {
    super(code === 'conflict' && message !== undefined ? message : MESSAGE_BY_CODE[code]);
    this.name = 'ApiFailure';
    this.code = code;
  }
}

/** Cuerpo de error con el formato del contrato. */
export function errorBody(code: ApiErrorCode, message: string = MESSAGE_BY_CODE[code]): ApiError {
  return { error: { code, message } };
}

/** Responde con el error uniforme del código dado. */
export function errorResponse(c: Context, code: ApiErrorCode, message?: string): Response {
  if (code === 'unauthorized') c.header('WWW-Authenticate', 'Bearer');
  return c.json(errorBody(code, message), STATUS_BY_CODE[code]);
}
