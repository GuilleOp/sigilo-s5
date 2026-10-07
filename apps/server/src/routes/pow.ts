// Reto de prueba de trabajo para los envíos de la persona denunciante.
import type { Hono } from 'hono';
import { PowPurposeSchema, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { purgeExpiredChallengeUploads } from '../services/evidence-service.ts';

/** Registra `GET powChallenge?purpose=complaint|message`. */
export function registerPowRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.powChallenge, (c) => {
    const purpose = PowPurposeSchema.safeParse(c.req.query('purpose'));
    if (!purpose.success) throw new ApiFailure('bad_request');
    // Barrido amortizado (a lo más uno por minuto) de las pendientes de retos vencidos.
    purgeExpiredChallengeUploads(ctx);
    return c.json(ctx.pow.issue(purpose.data));
  });
}
