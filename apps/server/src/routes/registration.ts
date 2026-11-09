// Alta de autoridades: la solicitud pública (con prueba de trabajo) y la bandeja de la cuenta de
// operación del nodo.
import type { Hono } from 'hono';
import {
  API_PREFIX,
  POW_HEADER,
  RegistrationDecisionSchema,
  RegistrationIdSchema,
  RegistrationRequestSchema,
  ROUTES,
} from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { requireAuthoritySession, requireFunction } from '../security/authority-auth.ts';
import { requireProofOfWork } from '../security/proof-of-work.ts';
import {
  decideRegistration,
  registrationView,
  submitRegistration,
} from '../services/registration-service.ts';

/**
 * Registra `POST registrationRequests` (público) y las rutas de operación.
 * Seguridad: la operación del nodo solo entra a `/operation/*`; ninguna otra función entra ahí.
 */
export function registerRegistrationRoutes(app: Hono, ctx: AppContext): void {
  app.post(
    ROUTES.registrationRequests,
    requireProofOfWork(ctx.pow, 'registration'),
    jsonBodyLimit,
    async (c) => {
      const request = await readJson(c, RegistrationRequestSchema);
      // Seguridad: el reto se gasta solo con un cuerpo válido.
      ctx.pow.verify(c.req.header(POW_HEADER), 'registration');
      return c.json(submitRegistration(ctx, request), 201);
    },
  );

  app.use(`${API_PREFIX}/operation/*`, requireAuthoritySession(ctx));

  app.get(ROUTES.operationRegistrations, (c) => {
    requireFunction(ctx, c, ['operation']);
    return c.json({
      nodeId: ctx.deps.network?.nodeId ?? null,
      registrations: ctx.registrations.list().map((record) => registrationView(ctx, record)),
    });
  });

  app.post(ROUTES.operationRegistrationDecision(':requestId'), jsonBodyLimit, async (c) => {
    const account = requireFunction(ctx, c, ['operation']);
    const requestId = RegistrationIdSchema.safeParse(c.req.param('requestId'));
    if (!requestId.success) throw new ApiFailure('not_found');
    const decision = await readJson(c, RegistrationDecisionSchema);
    return c.json(decideRegistration(ctx, account, requestId.data, decision));
  });
}
