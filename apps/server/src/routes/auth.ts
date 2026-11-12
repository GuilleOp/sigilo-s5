// Inicio de sesión (en dos pasos con segundo factor), inscripción del segundo factor, cierre y
// consulta de la sesión de las cuentas de la autoridad.
import type { Hono } from 'hono';
import {
  LoginCodeRequestSchema,
  LoginRequestSchema,
  MfaConfirmRequestSchema,
  ROUTES,
} from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import {
  bearerToken,
  currentAccount,
  requireAuthoritySession,
} from '../security/authority-auth.ts';
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  login,
  loginCode,
  logout,
  sessionInfo,
} from '../services/auth-service.ts';

/**
 * Registra `POST authLogin`, `POST authLoginCode`, `POST authMfaEnroll`, `POST authMfaConfirm`,
 * `POST authLogout` y `GET authSession`. Cerrar sesión responde 204 aunque el token ya no exista,
 * para no confirmar nada. La inscripción solo acepta la sesión de solo contraseña de una cuenta
 * que todavía no tiene segundo factor.
 */
export function registerAuthRoutes(app: Hono, ctx: AppContext): void {
  app.post(ROUTES.authLogin, jsonBodyLimit, async (c) => {
    const request = await readJson(c, LoginRequestSchema);
    return c.json(await login(ctx, request));
  });

  app.post(ROUTES.authLoginCode, jsonBodyLimit, async (c) => {
    const request = await readJson(c, LoginCodeRequestSchema);
    return c.json(await loginCode(ctx, request));
  });

  const enrollment = requireAuthoritySession(ctx, { forEnrollment: true });

  app.post(ROUTES.authMfaEnroll, enrollment, (c) =>
    c.json(beginMfaEnrollment(ctx, currentAccount(c))),
  );

  app.post(ROUTES.authMfaConfirm, enrollment, jsonBodyLimit, async (c) => {
    const request = await readJson(c, MfaConfirmRequestSchema);
    return c.json(confirmMfaEnrollment(ctx, currentAccount(c), bearerToken(c), request));
  });

  app.post(ROUTES.authLogout, (c) => {
    logout(ctx, bearerToken(c));
    return c.body(null, 204);
  });

  app.get(ROUTES.authSession, requireAuthoritySession(ctx), (c) =>
    c.json(sessionInfo(ctx, currentAccount(c))),
  );
}
