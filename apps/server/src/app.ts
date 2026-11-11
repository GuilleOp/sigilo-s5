// Composición de la aplicación Hono: middleware de seguridad, rutas de la API, web opcional en el
// mismo origen y manejo uniforme de errores.
import { Hono } from 'hono';
// Catálogo completo de entes reales de la PDN: la validación de los hechos es estricta y
// `findEntity` conoce el orden de gobierno de cualquier ente (equivalencias del S5, ficha PDN).
import '@sigilo/contracts/entes';
import { cors } from 'hono/cors';
import { API_PREFIX, POW_HEADER } from '@sigilo/contracts';
import { createContext } from './context.ts';
import type { AppContext, AppDeps } from './context.ts';
import { ApiFailure, errorResponse } from './http/errors.ts';
import { loadWebAssets } from './http/web-assets.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerAuthorityRoutes } from './routes/authority.ts';
import { registerComplaintRoutes } from './routes/complaints.ts';
import { registerEvidenceRoutes } from './routes/evidence.ts';
import { registerKeysRoutes } from './routes/keys.ts';
import { registerLedgerRoutes } from './routes/ledger.ts';
import { registerNetworkRoutes } from './routes/network.ts';
import { registerOpenDataRoutes } from './routes/open-data.ts';
import { registerPowRoutes } from './routes/pow.ts';
import { registerRegistrationRoutes } from './routes/registration.ts';
import { registerTrackingRoutes } from './routes/tracking.ts';
import { isApiPath, securityHeaders } from './security/headers.ts';

export type { AppContext, AppDeps, RateLimitConfig, RequestLogEntry } from './context.ts';
export type { RequestLogLine } from './http/request-log.ts';

/**
 * Sirve la web construida para las rutas fuera de la API: archivos tal cual y `index.html` para
 * las rutas de la SPA. Las cabeceras de la web las agrega `securityHeaders`.
 */
function registerWebRoutes(app: Hono, distDir: string): void {
  const assets = loadWebAssets(distDir);
  app.get('*', (c, next) => {
    if (isApiPath(c.req.path)) return next();
    const asset = assets.resolve(c.req.path);
    if (asset === null) return c.text('No encontrado.', 404);
    c.header('Content-Type', asset.contentType);
    return c.body(new Uint8Array(asset.body));
  });
}

/**
 * Crea la aplicación con las dependencias inyectadas (base, llaves, almacén, reloj, cuentas de la
 * autoridad, prueba de trabajo y registro).
 */
export function createApp(deps: AppDeps): Hono {
  return createAppFromContext(createContext(deps));
}

/**
 * Crea la aplicación sobre un contexto ya construido, para que las tareas programadas (cierre de
 * la bitácora, reglas de escalamiento) usen los mismos servicios que las rutas.
 */
export function createAppFromContext(ctx: AppContext): Hono {
  const { deps } = ctx;
  const app = new Hono();
  const servesWeb = deps.webDistDir !== undefined;

  if (deps.requestLog) app.use('*', deps.requestLog.middleware);
  app.use('*', securityHeaders({ servesWeb, hstsMaxAgeSeconds: deps.hstsMaxAgeSeconds }));
  if (deps.allowedOrigin) {
    // Solo para desarrollo con otro origen: por omisión la web y la API comparten origen.
    app.use(
      `${API_PREFIX}/*`,
      cors({
        origin: deps.allowedOrigin,
        allowMethods: ['GET', 'POST'],
        allowHeaders: ['Content-Type', 'Authorization', POW_HEADER],
        maxAge: 600,
      }),
    );
  }

  registerKeysRoutes(app, ctx);
  registerPowRoutes(app, ctx);
  registerEvidenceRoutes(app, ctx);
  registerComplaintRoutes(app, ctx);
  registerTrackingRoutes(app, ctx);
  registerAuthRoutes(app, ctx);
  registerAuthorityRoutes(app, ctx);
  registerRegistrationRoutes(app, ctx);
  registerLedgerRoutes(app, ctx);
  registerOpenDataRoutes(app, ctx);
  registerNetworkRoutes(app, ctx);
  if (deps.webDistDir !== undefined) registerWebRoutes(app, deps.webDistDir);

  app.notFound((c) => errorResponse(c, 'not_found'));
  // Seguridad: los errores inesperados se responden como `internal` sin detalles.
  app.onError((error, c) =>
    errorResponse(c, error instanceof ApiFailure ? error.code : 'internal'),
  );
  return app;
}
