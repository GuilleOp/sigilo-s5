// Seguimiento de la persona denunciante: consulta y respuesta por el buzón.
import type { Hono } from 'hono';
import { ReporterMessageRequestSchema, ROUTES, TrackingCredentialsSchema } from '@sigilo/contracts';
import { folioDigest } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { recordMessage } from '../services/mailbox-service.ts';
import { buildTrackingView } from '../services/views.ts';

/** Registra `POST tracking` y `POST trackingMessages`. */
export function registerTrackingRoutes(app: Hono, ctx: AppContext): void {
  app.post(ROUTES.tracking, jsonBodyLimit, async (c) => {
    const credentials = await readJson(c, TrackingCredentialsSchema);
    const complaint = await ctx.reporterAuth.authenticate(credentials);
    ctx.complaints.markTracked(complaint.folio);
    return c.json(buildTrackingView(ctx, complaint));
  });

  app.post(ROUTES.trackingMessages, jsonBodyLimit, async (c) => {
    const { folio, authKey, sequence, envelope, signature } = await readJson(
      c,
      ReporterMessageRequestSchema,
    );
    const complaint = await ctx.reporterAuth.authenticate({ folio, authKey });
    ctx.complaints.markTracked(complaint.folio);
    // El límite de mensajes es aparte del de autenticación: escribir no gasta intentos de acceso.
    if (!ctx.limiters.reporterMessages.consume(folioDigest(folio))) {
      throw new ApiFailure('rate_limited');
    }
    const message = recordMessage(ctx, complaint, {
      from: 'reporter',
      sequence,
      envelope,
      signature,
    });
    return c.json(message, 201);
  });
}
