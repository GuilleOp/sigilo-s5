// Recepción de denuncias.
import type { Hono } from 'hono';
import { FolioSchema, POW_HEADER, ROUTES, SubmitComplaintRequestSchema } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
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

/**
 * Folio que eligió el navegador para un envío directo (`?folio=`), o `undefined`. Las pruebas se
 * cifran con el folio en el AAD antes de enviar la denuncia, así que el navegador lo elige al azar
 * (como por la red). Lanza `bad_request` si no tiene el formato.
 */
function directFolioOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const parsed = FolioSchema.safeParse(value);
  if (!parsed.success) throw new ApiFailure('bad_request');
  return parsed.data;
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
      const folio = routed?.folio ?? directFolioOf(c.req.query('folio'));
      // Seguridad: el reto se gasta solo con un cuerpo válido.
      if (routed?.deferred !== true) ctx.pow.verify(c.req.header(POW_HEADER), 'complaint');
      const routedTo = c.get('routedTo');
      return c.json(
        submitComplaint(ctx, request, {
          ...(routedTo === undefined ? {} : { routedTo }),
          ...(folio === undefined ? {} : { folio }),
        }),
        201,
      );
    },
  );
}
