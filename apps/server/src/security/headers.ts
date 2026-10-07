// Cabeceras de seguridad que acompañan a toda respuesta de la API, incluidos los errores.
import type { MiddlewareHandler } from 'hono';

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  // Seguridad: la API no sirve documentos; ningún recurso puede cargarse ni enmarcarse.
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  // Seguridad: nada se guarda en cachés intermedias ni del navegador.
  'Cache-Control': 'no-store',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

/** Aplica las cabeceras de seguridad después de que responde el manejador. */
export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    c.res.headers.set(name, value);
  }
};
