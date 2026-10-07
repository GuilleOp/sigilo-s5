// Recepción de denuncias.
import type { Hono } from 'hono';
import { ROUTES, SubmitComplaintRequestSchema } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { requireProofOfWork } from '../security/proof-of-work.ts';
import { submitComplaint } from '../services/complaint-service.ts';

/** Registra `POST complaints`, que exige la prueba de trabajo de propósito `complaint`. */
export function registerComplaintRoutes(app: Hono, ctx: AppContext): void {
  app.post(
    ROUTES.complaints,
    requireProofOfWork(ctx.pow, 'complaint'),
    jsonBodyLimit,
    async (c) => {
      const request = await readJson(c, SubmitComplaintRequestSchema);
      return c.json(submitComplaint(ctx, request), 201);
    },
  );
}
