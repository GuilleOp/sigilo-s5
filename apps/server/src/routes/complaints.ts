// Recepción de denuncias.
import type { Hono } from 'hono';
import { POW_HEADER, ROUTES, SubmitComplaintRequestSchema } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { requireProofOfWork } from '../security/proof-of-work.ts';
import { submitComplaint } from '../services/complaint-service.ts';
import { routedTargetOf } from './network.ts';

declare module 'hono' {
  interface ContextVariableMap {
    routedTo: string | undefined;
  }
}

/** Registra `POST complaints`, que exige la prueba de trabajo de propósito `complaint`. */
export function registerComplaintRoutes(app: Hono, ctx: AppContext): void {
  app.post(
    ROUTES.complaints,
    // Antes de cualquier middleware que pueda envolver la petición: si llegó por el buzón de red,
    // se recuerda su autoridad destino.
    async (c, next) => {
      c.set('routedTo', routedTargetOf(c.req.raw));
      await next();
    },
    requireProofOfWork(ctx.pow, 'complaint'),
    jsonBodyLimit,
    async (c) => {
      const request = await readJson(c, SubmitComplaintRequestSchema);
      // Seguridad: el reto se gasta solo con un cuerpo válido.
      ctx.pow.verify(c.req.header(POW_HEADER), 'complaint');
      const routedTo = c.get('routedTo');
      return c.json(submitComplaint(ctx, request, routedTo === undefined ? {} : { routedTo }), 201);
    },
  );
}
