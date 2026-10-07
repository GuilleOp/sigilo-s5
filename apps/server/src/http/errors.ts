// Errores de la API con formato uniforme (`ApiErrorSchema`) y mensajes fijos.
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError, ApiErrorCode } from '@sigilo/contracts';

const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal: 500,
};

// Seguridad: los mensajes son fijos; nunca incluyen detalles internos ni datos de la solicitud.
const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  bad_request: 'La solicitud no es válida.',
  unauthorized: 'No autorizado.',
  not_found: 'No encontrado.',
  payload_too_large: 'El contenido excede el tamaño permitido.',
  unsupported_media_type: 'Tipo de contenido no admitido.',
  rate_limited: 'Demasiados intentos. Intenta más tarde.',
  internal: 'Error interno del servidor.',
};

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
