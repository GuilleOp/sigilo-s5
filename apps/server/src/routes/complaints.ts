// Recepción de denuncias.
import type { Hono } from 'hono';
import { POW_HEADER, ROUTES, SubmitComplaintRequestSchema } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { requireProofOfWork } from '../security/proof-of-work.ts';
import { submitComplaint } from '../services/complaint-service.ts';
import { routedSubmissionOf, routedTargetOf } from './network.ts';
import type { RoutedSubmission } from './network.ts';

declare module 'hono' {
  interface ContextVariableMap {
    routedTo: string | undefined;
    routedSubmission: RoutedSubmission | undefined;
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
      c.set('routedSubmission', routedSubmissionOf(c.req.raw));
      await next();
    },
    // Seguridad: una entrega diferida pagó el reto de la cola del enrutador (el nodo estaba
    // caído y no podía emitir el suyo); solo el buzón de red con la etiqueta del enrutador la marca.
    async (c, next) => {
      if (c.get('routedSubmission')?.deferred === true) return next();
      return requireProofOfWork(ctx.pow, 'complaint')(c, next);
    },
    jsonBodyLimit,
    async (c) => {
      const request = await readJson(c, SubmitComplaintRequestSchema);
      const routed = c.get('routedSubmission');
      // Seguridad: el reto se gasta solo con un cuerpo válido.
      if (routed?.deferred !== true) ctx.pow.verify(c.req.header(POW_HEADER), 'complaint');
      const routedTo = c.get('routedTo');
      return c.json(
        submitComplaint(ctx, request, {
          ...(routedTo === undefined ? {} : { routedTo }),
          ...(routed === undefined ? {} : { folio: routed.folio }),
        }),
        201,
      );
    },
  );
}
