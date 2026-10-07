// Seguimiento de la persona denunciante: consulta y respuesta por el buzón.
import type { Hono } from 'hono';
import { ReporterMessageRequestSchema, ROUTES, TrackingCredentialsSchema } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { recordMessage } from '../services/mailbox-service.ts';
import { buildTrackingView } from '../services/views.ts';

/** Registra `POST tracking` y `POST trackingMessages`. */
export function registerTrackingRoutes(app: Hono, ctx: AppContext): void {
  app.post(ROUTES.tracking, jsonBodyLimit, async (c) => {
    const credentials = await readJson(c, TrackingCredentialsSchema);
    const complaint = ctx.reporterAuth.authenticate(credentials);
    return c.json(buildTrackingView(ctx, complaint));
  });

  app.post(ROUTES.trackingMessages, jsonBodyLimit, async (c) => {
    const { folio, authKey, envelope, signature } = await readJson(c, ReporterMessageRequestSchema);
    const complaint = ctx.reporterAuth.authenticate({ folio, authKey });
    return c.json(recordMessage(ctx, complaint, { from: 'reporter', envelope, signature }), 201);
  });
}
