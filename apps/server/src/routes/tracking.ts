// Seguimiento de la persona denunciante: consulta y respuesta por el buzón.
import type { Hono } from 'hono';
import { ReporterMessageRequestSchema, ROUTES, TrackingCredentialsSchema } from '@sigilo/contracts';
import { folioDigest } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { requireProofOfWork } from '../security/proof-of-work.ts';
import { recordMessage } from '../services/mailbox-service.ts';
import { buildTrackingView } from '../services/views.ts';

const MESSAGES_KEY = 'global';

/**
 * Registra `POST tracking` y `POST trackingMessages`; este último exige la prueba de trabajo de
 * propósito `message`, con la misma dificultad adaptativa que los envíos.
 */
export function registerTrackingRoutes(app: Hono, ctx: AppContext): void {
  app.post(ROUTES.tracking, jsonBodyLimit, async (c) => {
    const credentials = await readJson(c, TrackingCredentialsSchema);
    const complaint = await ctx.reporterAuth.authenticate(credentials);
    return c.json(buildTrackingView(ctx, complaint));
  });

  app.post(
    ROUTES.trackingMessages,
    requireProofOfWork(ctx.pow, 'message'),
    jsonBodyLimit,
    async (c) => {
      const { folio, authKey, sequence, envelope, signature } = await readJson(
        c,
        ReporterMessageRequestSchema,
      );
      const complaint = await ctx.reporterAuth.authenticate({ folio, authKey });
      // El límite de mensajes es aparte del de autenticación: escribir no gasta intentos de
      // acceso. Los límites se descuentan solo cuando el mensaje queda guardado.
      const folioKey = folioDigest(folio);
      const { reporterMessages, reporterMessagesGlobal } = ctx.limiters;
      if (reporterMessages.isLimited(folioKey) || reporterMessagesGlobal.isLimited(MESSAGES_KEY)) {
        throw new ApiFailure('rate_limited');
      }
      const message = recordMessage(ctx, complaint, {
        from: 'reporter',
        sequence,
        envelope,
        signature,
      });
      reporterMessages.consume(folioKey);
      reporterMessagesGlobal.consume(MESSAGES_KEY);
      return c.json(message, 201);
    },
  );
}
