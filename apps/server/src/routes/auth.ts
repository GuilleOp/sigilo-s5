// Inicio de sesión, cierre y consulta de la sesión de las cuentas de la autoridad.
import type { Hono } from 'hono';
import { LoginRequestSchema, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import {
  bearerToken,
  currentAccount,
  requireAuthoritySession,
} from '../security/authority-auth.ts';
import { login, logout, sessionInfo } from '../services/auth-service.ts';

/**
 * Registra `POST authLogin`, `POST authLogout` y `GET authSession`. Cerrar sesión responde 204
 * aunque el token ya no exista, para no confirmar nada.
 */
export function registerAuthRoutes(app: Hono, ctx: AppContext): void {
  app.post(ROUTES.authLogin, jsonBodyLimit, async (c) => {
    const request = await readJson(c, LoginRequestSchema);
    return c.json(await login(ctx, request));
  });

  app.post(ROUTES.authLogout, (c) => {
    logout(ctx, bearerToken(c));
    return c.body(null, 204);
  });

  app.get(ROUTES.authSession, requireAuthoritySession(ctx), (c) =>
    c.json(sessionInfo(ctx, currentAccount(c))),
  );
}
