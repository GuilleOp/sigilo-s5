// Inicio y cierre de sesión de las cuentas individuales de la autoridad.
import { createHash } from 'node:crypto';
import type { AuthoritySession, AuthoritySessionInfo, LoginRequest } from '@sigilo/contracts';
import { SESSION_ABSOLUTE_TIMEOUT_SECONDS, SESSION_IDLE_TIMEOUT_SECONDS } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { logSecurityEvent } from '../security/authority-auth.ts';
import { accountView } from '../security/authority-registry.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import { DEFAULT_SCRYPT_LOG_N, hashPassword, verifyPassword } from '../security/passwords.ts';

/** Digesto de comparación para usuarios inexistentes, calculado una sola vez y por proceso. */
let dummyHash: string | null = null;

function dummyPasswordHash(): string {
  // Seguridad: con el mismo costo que las cuentas reales, un usuario inexistente tarda lo mismo
  // que una contraseña equivocada.
  dummyHash ??= hashPassword('contraseña-de-comparación-sin-cuenta', DEFAULT_SCRYPT_LOG_N);
  return dummyHash;
}

function limiterKey(username: string): string {
  return createHash('sha256').update(`sigilo/login:${username}`, 'utf8').digest('hex');
}

function sleep(ctx: AppContext, ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return ctx.deps.sleep === undefined
    ? new Promise((resolve) => setTimeout(resolve, ms))
    : ctx.deps.sleep(ms);
}

/**
 * Comprueba usuario y contraseña y abre una sesión.
 * Lanza `rate_limited` si el usuario agotó sus intentos (aunque la contraseña sea la correcta) y
 * `unauthorized` si el usuario no existe o la contraseña no coincide (la misma respuesta, sin decir
 * cuál).
 * Seguridad (H05): con el usuario bloqueado se rechaza también la contraseña correcta hasta que
 * vence la ventana: antes, el tope solo cambiaba el código de error y no frenaba la adivinanza. La
 * contraseña se verifica de todos modos, así que el costo y el tiempo son los mismos en todos los
 * casos (un scrypt) y la respuesta no revela si se acertó. El precio es que un tercero que conozca
 * el usuario puede bloquear a la dueña durante la ventana; por eso el panel va detrás de VPN o de
 * una lista de IP (ver docs/seguridad-produccion.md). Cada fallo queda en el registro de seguridad
 * con el seudónimo de la cuenta si el usuario existe (nunca el usuario tecleado ni la IP); un
 * usuario inexistente compara contra un digesto de igual costo. El límite es por usuario, que no
 * se publica en ningún lado.
 */
export async function login(ctx: AppContext, request: LoginRequest): Promise<AuthoritySession> {
  const key = limiterKey(request.username);
  const account = ctx.authorities.findByUsername(request.username);
  const isValid = await verifyPassword(
    request.password,
    account?.passwordHash ?? dummyPasswordHash(),
  );
  if (ctx.limiters.loginFailures.isLimited(key)) {
    ctx.limiters.loginThrottle.record();
    logSecurityEvent(ctx, 'login_rate_limited', account?.accountId ?? null);
    await sleep(ctx, ctx.limiters.loginThrottle.delayMs());
    throw new ApiFailure('rate_limited');
  }
  if (account === null || !isValid) {
    ctx.limiters.loginFailures.consume(key);
    ctx.limiters.loginThrottle.record();
    logSecurityEvent(ctx, 'login_failed', account?.accountId ?? null);
    await sleep(ctx, ctx.limiters.loginThrottle.delayMs());
    throw new ApiFailure('unauthorized');
  }
  const token = ctx.sessions.issue(account.accountId);
  logSecurityEvent(ctx, 'login_succeeded', account.accountId);
  return {
    token,
    idleTimeoutSeconds: SESSION_IDLE_TIMEOUT_SECONDS,
    absoluteTimeoutSeconds: SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    account: accountView(account),
  };
}

/** Cierra la sesión en el servidor y lo registra. */
export function logout(ctx: AppContext, token: string): void {
  const accountId = ctx.sessions.revoke(token);
  if (accountId !== null) logSecurityEvent(ctx, 'logout', accountId);
}

/** Cuenta y autoridad de la sesión vigente. */
export function sessionInfo(ctx: AppContext, account: AuthorityAccount): AuthoritySessionInfo {
  const authority = ctx.authorities.authority(account.authorityId);
  if (authority === null) throw new ApiFailure('unauthorized');
  return {
    account: accountView(account),
    authority,
    idleTimeoutSeconds: SESSION_IDLE_TIMEOUT_SECONDS,
    absoluteTimeoutSeconds: SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  };
}
