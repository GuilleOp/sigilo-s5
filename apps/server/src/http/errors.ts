// Errores de la API con formato uniforme (`ApiErrorSchema`) y mensajes fijos.
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { API_ERROR_HTTP_STATUS, API_ERROR_MESSAGES } from '@sigilo/contracts';
import type { ApiError, ApiErrorCode } from '@sigilo/contracts';

// El estatus y el mensaje de cada código vienen del contrato, que también los publica en el
// estándar. Seguridad: los mensajes son fijos; nunca incluyen detalles internos ni datos de la
// solicitud.
const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, ContentfulStatusCode>> = API_ERROR_HTTP_STATUS;
const MESSAGE_BY_CODE = API_ERROR_MESSAGES;

/** Error de la API que se traduce a una respuesta con su código y estatus HTTP. */
export class ApiFailure extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    super(MESSAGE_BY_CODE[code]);
    this.name = 'ApiFailure';
    this.code = code;
  }
}

/** Cuerpo de error con el formato del contrato. */
export function errorBody(code: ApiErrorCode): ApiError {
  return { error: { code, message: MESSAGE_BY_CODE[code] } };
}

/** Responde con el error uniforme del código dado. */
export function errorResponse(c: Context, code: ApiErrorCode): Response {
  if (code === 'unauthorized') c.header('WWW-Authenticate', 'Bearer');
  return c.json(errorBody(code), STATUS_BY_CODE[code]);
}
