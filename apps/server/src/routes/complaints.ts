// Recepción de denuncias.
import type { Hono } from 'hono';
import { ROUTES, SubmitComplaintRequestSchema } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { submitComplaint } from '../services/complaint-service.ts';

/** Registra `POST complaints`. */
export function registerComplaintRoutes(app: Hono, ctx: AppContext): void {
  app.post(ROUTES.complaints, jsonBodyLimit, async (c) => {
    const request = await readJson(c, SubmitComplaintRequestSchema);
    return c.json(submitComplaint(ctx, request), 201);
  });
}
