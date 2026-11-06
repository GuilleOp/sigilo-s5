// Seguimiento de la persona denunciante: consulta y respuesta por el buzón.
import type { Hono } from 'hono';
import {
  AppealRequestSchema,
  POW_HEADER,
  ReporterMessageRequestSchema,
  ROUTES,
  TrackingCredentialsSchema,
} from '@sigilo/contracts';
import { folioDigest } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { requireProofOfWork } from '../security/proof-of-work.ts';
import { recordMessage } from '../services/mailbox-service.ts';
import { fileAppeal } from '../services/qualification-service.ts';
import { buildTrackingView } from '../services/views.ts';

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

  // Inconformidad contra la calificación de no grave (LGRA, arts. 102 a 110). Exige la prueba de
  // trabajo de mensajes: es una escritura de la persona denunciante.
  app.post(
    ROUTES.trackingAppeal,
    requireProofOfWork(ctx.pow, 'message'),
    jsonBodyLimit,
    async (c) => {
      const { folio, authKey, reasons } = await readJson(c, AppealRequestSchema);
      ctx.pow.verify(c.req.header(POW_HEADER), 'message');
      const complaint = await ctx.reporterAuth.authenticate({ folio, authKey });
      return c.json(fileAppeal(ctx, complaint, { reasons }), 201);
    },
  );

  app.post(
    ROUTES.trackingMessages,
    requireProofOfWork(ctx.pow, 'message'),
    jsonBodyLimit,
    async (c) => {
      const { folio, authKey, sequence, envelope, signature } = await readJson(
        c,
        ReporterMessageRequestSchema,
      );
      // Seguridad: el reto se gasta solo con un cuerpo válido.
      ctx.pow.verify(c.req.header(POW_HEADER), 'message');
      const complaint = await ctx.reporterAuth.authenticate({ folio, authKey });
      // El límite de mensajes es aparte del de autenticación: escribir no gasta intentos de
      // acceso. Es por folio y se descuenta solo cuando el mensaje queda guardado; no hay tope
      // global (la carga solo sube la dificultad de la prueba de trabajo).
      const folioKey = folioDigest(folio);
      const { reporterMessages } = ctx.limiters;
      if (reporterMessages.isLimited(folioKey)) throw new ApiFailure('rate_limited');
      const message = recordMessage(ctx, complaint, {
        from: 'reporter',
        sequence,
        envelope,
        signature,
      });
      reporterMessages.consume(folioKey);
      return c.json(message, 201);
    },
  );
}
