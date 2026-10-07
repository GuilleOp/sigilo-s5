// Autenticación de la autoridad con token bearer.
import type { MiddlewareHandler } from 'hono';
import { errorResponse } from '../http/errors.ts';
import { constantTimeEqual } from './constant-time.ts';

const BEARER_PREFIX = 'Bearer ';

/**
 * Exige `Authorization: Bearer <token>` igual al token configurado.
 * Seguridad: la comparación es en tiempo constante y todo fallo responde el mismo 401.
 */
export function requireAuthority(expectedToken: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header('Authorization') ?? '';
    const provided = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';
    // Se compara siempre, incluso sin token, para que el tiempo no distinga los casos.
    const isValid = constantTimeEqual(provided, expectedToken);
    if (!isValid || provided === '') return errorResponse(c, 'unauthorized');
    await next();
  };
}
