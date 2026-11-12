// Middleware que exige un token de acceso del servidor de autorización del nodo (RFC 6750) con un
// permiso dado. Lo usan el buzón de red (`sesna:entregas`) y la estadística (`sesna:estadisticas`).
import type { Context, MiddlewareHandler } from 'hono';
import type { PdnScope } from '@sigilo/contracts';
import type { NodeOAuthServer } from './oauth-server.ts';

/** Valor de `WWW-Authenticate` para un rechazo (RFC 6750, sección 3). */
export function bearerChallenge(
  error: 'invalid_token' | 'insufficient_scope',
  scope: PdnScope,
): string {
  return `Bearer realm="sigilo", error="${error}", scope="${scope}"`;
}

/**
 * Exige `Authorization: Bearer` con el permiso `scope`. Si falta o no vale, responde con
 * `reject` (`401` o `403`) y la cabecera `WWW-Authenticate`, sin decir más.
 * Seguridad: el token no se registra ni se devuelve; la comparación de la firma es en tiempo
 * constante dentro de `NodeOAuthServer.verify`.
 */
export function requireBearer(
  oauth: NodeOAuthServer,
  scope: PdnScope,
  reject: (c: Context, status: 401 | 403) => Response,
): MiddlewareHandler {
  return async (c, next) => {
    const check = oauth.verify(c.req.header('Authorization'), scope);
    if (!check.ok) {
      c.header('WWW-Authenticate', bearerChallenge(check.error, scope));
      return reject(c, check.error === 'insufficient_scope' ? 403 : 401);
    }
    await next();
  };
}
