// Errores con el formato común del estándar, lectura de JSON validado, límite de cuerpo y
// cabeceras de seguridad fijas, compartidos por el evaluador y el índice.
import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
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
 * Lee el cuerpo como JSON y lo valida. Lanza `unsupported_media_type` si no es JSON y
 * `bad_request` si no es válido, sin propagar los detalles de zod.
 */
export async function readJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
  const mediaType = (c.req.header('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new ApiFailure('unsupported_media_type');
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiFailure('bad_request');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiFailure('bad_request');
  return parsed.data;
}

/** Limita el cuerpo de la petición y responde `payload_too_large` si lo excede. */
export function limitBody(maxSize: number): MiddlewareHandler {
  return bodyLimit({ maxSize, onError: (c) => errorResponse(c, 'payload_too_large') });
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
 * Seguridad: no hay cabeceras que dependan de la petición (sin `Server` ni identificadores).
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

/** Cabeceras CORS del evaluador, al que llama el navegador desde la web de cualquier nodo. */
export function evaluatorCors(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type, X-Sigilo-Pow',
        'Access-Control-Max-Age': '600',
      });
    }
    await next();
    // Seguridad: sin credenciales ni cookies; el origen comodín no expone nada privado.
    c.res.headers.set('Access-Control-Allow-Origin', '*');
    return undefined;
  };
}
