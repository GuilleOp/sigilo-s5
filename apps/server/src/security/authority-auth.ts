// Autenticación de la autoridad con sesiones de cuentas individuales y separación de funciones.
import type { Context, MiddlewareHandler } from 'hono';
import { hasAnyFunction } from '@sigilo/contracts';
import type { AuthorityFunction } from '@sigilo/contracts';
import { folioDigest } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { SecurityEventKind } from '../db/security-log-repository.ts';
import { ApiFailure, errorResponse } from '../http/errors.ts';
import type { AuthorityAccount } from './authority-registry.ts';

declare module 'hono' {
  interface ContextVariableMap {
    authorityAccount: AuthorityAccount;
    authoritySessionToken: string;
  }
}

const BEARER_PREFIX = 'Bearer ';

/** Token de `Authorization: Bearer <token>`, o cadena vacía. */
export function bearerToken(c: Context): string {
  const header = c.req.header('Authorization') ?? '';
  return header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : '';
}

/** Minuto UTC del evento de seguridad: suficiente para auditar sin dar la hora exacta. */
function minuteOf(date: Date): string {
  return `${date.toISOString().slice(0, 16)}Z`;
}

/**
 * Registra un evento de seguridad de una cuenta (sin IP, agente de usuario ni datos de la
 * denuncia; de ella solo el digesto del folio).
 */
export function logSecurityEvent(
  ctx: AppContext,
  kind: SecurityEventKind,
  accountId: string | null,
  folio?: string,
): void {
  ctx.securityLog.insert({
    at: minuteOf(ctx.deps.now()),
    kind,
    accountId,
    folioDigest: folio === undefined ? null : folioDigest(folio),
  });
}

/**
 * Exige una sesión vigente (`Authorization: Bearer <token>` de `POST authLogin`) y deja la cuenta
 * en `c.get('authorityAccount')`.
 * Seguridad: todo fallo responde el mismo 401; una sesión vencida queda en el registro de
 * seguridad. El token solo se compara como digesto dentro del almacén de sesiones.
 */
export function requireAuthoritySession(ctx: AppContext): MiddlewareHandler {
  return async (c, next) => {
    const token = bearerToken(c);
    const lookup = ctx.sessions.resolve(token);
    if (lookup.status === 'expired') {
      logSecurityEvent(ctx, 'session_expired', lookup.accountId);
      return errorResponse(c, 'unauthorized');
    }
    const account =
      lookup.status === 'active' ? ctx.authorities.findAccount(lookup.session.accountId) : null;
    if (account === null) return errorResponse(c, 'unauthorized');
    c.set('authorityAccount', account);
    c.set('authoritySessionToken', token);
    await next();
  };
}

/** Cuenta de la sesión vigente. Lanza `unauthorized` si la ruta no pasó por la sesión. */
export function currentAccount(c: Context): AuthorityAccount {
  const account = c.get('authorityAccount') as AuthorityAccount | undefined;
  if (account === undefined) throw new ApiFailure('unauthorized');
  return account;
}

/**
 * Exige que la cuenta tenga alguna función de `allowed`, antes de buscar el folio (así la
 * respuesta no revela si existe). Lanza `forbidden` y lo registra si no.
 */
export function requireFunction(
  ctx: AppContext,
  c: Context,
  allowed: readonly AuthorityFunction[],
): AuthorityAccount {
  const account = currentAccount(c);
  if (!hasAnyFunction(account, allowed)) {
    logSecurityEvent(ctx, 'function_denied', account.accountId);
    throw new ApiFailure('forbidden');
  }
  return account;
}
