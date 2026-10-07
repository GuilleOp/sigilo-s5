// Composición de la aplicación Hono: middleware de seguridad, rutas y manejo uniforme de errores.
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { routePath } from 'hono/route';
import { API_PREFIX } from '@sigilo/contracts';
import { createContext } from './context.ts';
import type { AppDeps, RequestLogEntry } from './context.ts';
import { ApiFailure, errorResponse } from './http/errors.ts';
import { registerAuthorityRoutes } from './routes/authority.ts';
import { registerComplaintRoutes } from './routes/complaints.ts';
import { registerEvidenceRoutes } from './routes/evidence.ts';
import { registerKeysRoutes } from './routes/keys.ts';
import { registerLedgerRoutes } from './routes/ledger.ts';
import { registerOpenDataRoutes } from './routes/open-data.ts';
import { registerTrackingRoutes } from './routes/tracking.ts';
import { securityHeaders } from './security/headers.ts';

export type { AppDeps, RateLimitConfig, RequestLogEntry } from './context.ts';

/**
 * Registro de peticiones.
 * Seguridad: solo método, ruta normalizada (el patrón, sin folio ni identificadores), estatus y
 * duración. Nunca IP, agente de usuario, cabeceras ni cuerpos.
 */
function requestLogger(log: (entry: RequestLogEntry) => void): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = performance.now();
    await next();
    log({
      method: c.req.method,
      route: routePath(c),
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    });
  };
}

/** Crea la aplicación con las dependencias inyectadas (base, llaves, almacén, reloj y token). */
export function createApp(deps: AppDeps): Hono {
  const ctx = createContext(deps);
  const app = new Hono();

  if (deps.logger) app.use('*', requestLogger(deps.logger));
  app.use('*', securityHeaders);
  if (deps.allowedOrigin) {
    // Solo para desarrollo: en despliegue la web y la API comparten origen.
    app.use(
      `${API_PREFIX}/*`,
      cors({
        origin: deps.allowedOrigin,
        allowMethods: ['GET', 'POST'],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: 600,
      }),
    );
  }

  registerKeysRoutes(app, ctx);
  registerEvidenceRoutes(app, ctx);
  registerComplaintRoutes(app, ctx);
  registerTrackingRoutes(app, ctx);
  registerAuthorityRoutes(app, ctx);
  registerLedgerRoutes(app, ctx);
  registerOpenDataRoutes(app, ctx);

  app.notFound((c) => errorResponse(c, 'not_found'));
  // Seguridad: los errores inesperados se responden como `internal` sin detalles.
  app.onError((error, c) =>
    errorResponse(c, error instanceof ApiFailure ? error.code : 'internal'),
  );
  return app;
}
