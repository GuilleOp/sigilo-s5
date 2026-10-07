// Cabeceras de seguridad de toda respuesta: unas para la API (incluidos los errores) y otras para
// la web cuando el servidor la sirve en el mismo origen.
import type { MiddlewareHandler } from 'hono';
import { API_PREFIX } from '@sigilo/contracts';

const COMMON_HEADERS: Readonly<Record<string, string>> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Seguridad: nada se guarda en cachés intermedias ni del navegador.
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** CSP de la API: no sirve documentos; ningún recurso puede cargarse ni enmarcarse. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/**
 * CSP de la web: la de `apps/web/index.html` más `frame-ancestors 'none'`, que solo funciona
 * como cabecera. Todo se sirve desde el propio origen, sin terceros.
 */
export const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** Indica si la ruta pertenece a la API (y no a la web). */
export function isApiPath(path: string): boolean {
  return path === API_PREFIX || path.startsWith(`${API_PREFIX}/`);
}

/** Opciones de las cabeceras. */
export interface SecurityHeaderOptions {
  /** Si la web se sirve desde este servidor (las rutas fuera de la API son de la web). */
  servesWeb: boolean;
  /** `max-age` de `Strict-Transport-Security`; `undefined` no envía la cabecera. */
  hstsMaxAgeSeconds?: number | undefined;
}

/** Crea el middleware que aplica las cabeceras después de que responde el manejador. */
export function securityHeaders(options: SecurityHeaderOptions): MiddlewareHandler {
  const hsts =
    options.hstsMaxAgeSeconds === undefined
      ? null
      : `max-age=${options.hstsMaxAgeSeconds}; includeSubDomains`;
  return async (c, next) => {
    await next();
    const isWeb = options.servesWeb && !isApiPath(c.req.path);
    for (const [name, value] of Object.entries(COMMON_HEADERS)) c.res.headers.set(name, value);
    c.res.headers.set('Content-Security-Policy', isWeb ? WEB_CSP : API_CSP);
    if (hsts !== null) c.res.headers.set('Strict-Transport-Security', hsts);
  };
}
