// Errores con el formato común del estándar, lectura de JSON validado y cabeceras de seguridad del
// enrutador, que son las mismas para toda respuesta sin importar el destino.
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';
import { API_ERROR_HTTP_STATUS, API_ERROR_MESSAGES } from '@sigilo/contracts';
import type { ApiErrorCode } from '@sigilo/contracts';

/** Error de la API que se traduce a una respuesta con su código y estatus. */
export class ApiFailure extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode) {
    super(API_ERROR_MESSAGES[code]);
    this.name = 'ApiFailure';
    this.code = code;
  }
}

/** Responde con el error uniforme del código. */
export function errorResponse(c: Context, code: ApiErrorCode): Response {
  return c.json(
    { error: { code, message: API_ERROR_MESSAGES[code] } },
    API_ERROR_HTTP_STATUS[code] as ContentfulStatusCode,
  );
}

/**
 * Lee el cuerpo como JSON sin validarlo. Lanza `unsupported_media_type` si no es JSON y
 * `bad_request` si no se puede leer.
 */
export async function readRawJson(c: Context): Promise<unknown> {
  const mediaType = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new ApiFailure('unsupported_media_type');
  try {
    return (await c.req.json()) as unknown;
  } catch {
    throw new ApiFailure('bad_request');
  }
}

/**
 * Lee el cuerpo como JSON y lo valida. Lanza `unsupported_media_type` si no es JSON y
 * `bad_request` si no es válido, sin propagar los detalles de zod.
 */
export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const parsed = schema.safeParse(await readRawJson(c));
  if (!parsed.success) throw new ApiFailure('bad_request');
  return parsed.data;
}

const HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
};

/**
 * Cabeceras fijas de toda respuesta.
 * Seguridad: no hay cabeceras que dependan del destino ni de quien pide (sin `Server`, sin
 * identificadores de petición ni de nodo).
 */
export function securityHeaders(hstsMaxAgeSeconds: number | null): MiddlewareHandler {
  const hsts =
    hstsMaxAgeSeconds === null ? null : `max-age=${hstsMaxAgeSeconds}; includeSubDomains`;
  return async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(HEADERS)) c.res.headers.set(name, value);
    if (hsts !== null) c.res.headers.set('Strict-Transport-Security', hsts);
  };
}
