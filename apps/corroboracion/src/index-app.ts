// Aplicación Hono del índice de coincidencias: registro, confirmación y baja de etiquetas, y
// avisos, solo para nodos que firman con su llave del directorio. Sin registro de peticiones.
import { Hono } from 'hono';
import {
  CORROBORATION_ROUTES,
  IndexConfirmationSchema,
  IndexNoticesRequestSchema,
  IndexRegistrationSchema,
  IndexWithdrawalSchema,
} from '@sigilo/contracts';
import { ApiFailure, errorResponse, limitBody, readJson, securityHeaders } from './http.ts';
import type { IndexService } from './index-service.ts';

const MAX_BODY_BYTES = 4096;

/** Crea la aplicación del índice. */
export function createIndexApp(deps: {
  index: IndexService;
  hstsMaxAgeSeconds?: number | null;
}): Hono {
  const app = new Hono();
  app.use('*', securityHeaders(deps.hstsMaxAgeSeconds ?? null));

  app.post(CORROBORATION_ROUTES.indexRegistrations, limitBody(MAX_BODY_BYTES), async (c) => {
    const registration = await readJson(c, IndexRegistrationSchema);
    return c.json(deps.index.register(registration));
  });

  app.post(CORROBORATION_ROUTES.indexConfirmations, limitBody(MAX_BODY_BYTES), async (c) => {
    const confirmation = await readJson(c, IndexConfirmationSchema);
    return c.json(deps.index.confirm(confirmation));
  });

  app.post(CORROBORATION_ROUTES.indexWithdrawals, limitBody(MAX_BODY_BYTES), async (c) => {
    const withdrawal = await readJson(c, IndexWithdrawalSchema);
    return c.json(deps.index.withdraw(withdrawal));
  });

  app.post(CORROBORATION_ROUTES.indexNotices, limitBody(MAX_BODY_BYTES), async (c) => {
    const request = await readJson(c, IndexNoticesRequestSchema);
    return c.json(deps.index.notices(request));
  });

  app.notFound((c) => errorResponse(c, 'not_found'));
  // Seguridad: firma inválida y nodo desconocido responden el mismo `401`.
  app.onError((error, c) =>
    errorResponse(c, error instanceof ApiFailure ? error.code : 'internal'),
  );
  return app;
}
