// Reto de prueba de trabajo para los envíos de la persona denunciante.
import type { Hono } from 'hono';
import { PowPurposeSchema, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';

/** Registra `GET powChallenge?purpose=complaint|evidence`. */
export function registerPowRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.powChallenge, (c) => {
    const purpose = PowPurposeSchema.safeParse(c.req.query('purpose'));
    if (!purpose.success) throw new ApiFailure('bad_request');
    return c.json(ctx.pow.issue(purpose.data));
  });
}
