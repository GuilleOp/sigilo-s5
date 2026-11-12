// Inicio y cierre de sesión de las cuentas individuales de la autoridad, en dos pasos cuando la
// cuenta tiene segundo factor (TOTP o código de recuperación), e inscripción del segundo factor.
import { createHash } from 'node:crypto';
import type {
  AuthoritySessionInfo,
  LoginCodeRequest,
  LoginCodeStep,
  LoginRequest,
  LoginResponse,
  LoginSessionStep,
  MfaConfirmRequest,
  MfaConfirmResponse,
  MfaEnrollment,
} from '@sigilo/contracts';
import {
  LOGIN_CHALLENGE_TIMEOUT_SECONDS,
  MFA_CODE_DIGITS,
  MFA_PERIOD_SECONDS,
  SESSION_ABSOLUTE_TIMEOUT_SECONDS,
  SESSION_IDLE_TIMEOUT_SECONDS,
} from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { logSecurityEvent, minuteOf } from '../security/authority-auth.ts';
import { accountView } from '../security/authority-registry.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import {
  decryptTotpSecret,
  dummyRecoveryCheck,
  encryptTotpSecret,
  generateRecoveryCodes,
  matchRecoveryCode,
} from '../security/mfa-secrets.ts';
import { isMfaRequired } from '../security/mfa-policy.ts';
import { DEFAULT_SCRYPT_LOG_N, hashPassword, verifyPassword } from '../security/passwords.ts';
import type { SessionAssurance } from '../security/sessions.ts';
import {
  generateTotpSecret,
  isTotpCodeFormat,
  otpauthUri,
  toBase32,
  verifyTotp,
} from '../security/totp.ts';

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

function sessionFields(account: AuthorityAccount, token: string) {
  return {
    token,
    idleTimeoutSeconds: SESSION_IDLE_TIMEOUT_SECONDS,
    absoluteTimeoutSeconds: SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    account: accountView(account),
  };
}

function codeStep(ctx: AppContext, key: string, accountId: string | null): LoginCodeStep {
  return {
    step: 'code',
    challenge: ctx.mfa.challenges.issue(key, accountId),
    expiresInSeconds: LOGIN_CHALLENGE_TIMEOUT_SECONDS,
  };
}

/** Abre la sesión completa de una cuenta y lo registra. */
function openSession(
  ctx: AppContext,
  account: AuthorityAccount,
  assurance: SessionAssurance,
): LoginSessionStep {
  const token = ctx.sessions.issue(account.accountId, undefined, assurance);
  logSecurityEvent(ctx, 'login_succeeded', account.accountId);
  return { step: 'session', ...sessionFields(account, token) };
}

/**
 * Primer paso: comprueba usuario y contraseña. Responde la sesión (cuenta sin segundo factor que
 * no lo necesita), `code` (falta el código) o `enroll` (sesión limitada para inscribirlo).
 * Lanza `rate_limited` si el usuario agotó sus intentos (aunque la contraseña sea la correcta).
 * Seguridad (H05): con el usuario bloqueado se rechaza también la contraseña correcta hasta que
 * vence la ventana. La contraseña se verifica de todos modos, así que el costo y el tiempo son los
 * mismos en todos los casos (un scrypt). Un usuario inexistente o una contraseña equivocada
 * reciben un reto señuelo con la misma forma que el real: la respuesta no revela si la contraseña
 * era correcta antes del segundo factor, y el fallo se nota hasta el segundo paso. El precio es
 * que un tercero que conozca el usuario puede bloquear a la dueña durante la ventana; por eso el
 * panel va detrás de VPN o de una lista de IP (ver docs/seguridad-produccion.md). Cada fallo queda
 * en el registro de seguridad con el seudónimo de la cuenta si el usuario existe (nunca el usuario
 * tecleado ni la IP). El límite es por usuario, que no se publica en ningún lado.
 */
export async function login(ctx: AppContext, request: LoginRequest): Promise<LoginResponse> {
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
    return codeStep(ctx, key, null);
  }
  if (ctx.mfa.enrollments.isEnrolled(account.accountId)) {
    return codeStep(ctx, key, account.accountId);
  }
  if (isMfaRequired(ctx.mfa, account)) {
    // Sesión limitada: solo sirve para inscribir el segundo factor (`requireAuthoritySession`).
    const token = ctx.sessions.issue(account.accountId, undefined, 'password');
    logSecurityEvent(ctx, 'mfa_enrollment_required', account.accountId);
    return { step: 'enroll', ...sessionFields(account, token) };
  }
  return openSession(ctx, account, 'password');
}

/**
 * Comprueba el código de un reto real: TOTP de un paso posterior al último aceptado o un código
 * de recuperación sin usar, que se marca como usado. Devuelve cuál coincidió, o `null`.
 */
async function checkCode(
  ctx: AppContext,
  accountId: string,
  code: string,
): Promise<'totp' | 'recovery' | null> {
  const enrollment = ctx.mfa.enrollments.find(accountId);
  if (enrollment === null) {
    // La inscripción se reinició mientras tanto: el mismo costo que un intento real.
    if (!isTotpCodeFormat(code)) await dummyRecoveryCheck(ctx.mfa.recoveryLogN);
    return null;
  }
  if (isTotpCodeFormat(code)) {
    const secret = decryptTotpSecret(ctx.mfa.key, accountId, enrollment.secretSealed);
    try {
      const step = verifyTotp(secret, code, ctx.deps.now().getTime(), enrollment.lastStep);
      return step !== null && ctx.mfa.enrollments.advanceStep(accountId, step) ? 'totp' : null;
    } finally {
      secret.fill(0);
    }
  }
  const index = await matchRecoveryCode(enrollment.recovery, code);
  return index !== null && ctx.mfa.enrollments.consumeRecoveryCode(accountId, index)
    ? 'recovery'
    : null;
}

/**
 * Segundo paso: comprueba el código del reto y abre la sesión completa. Lanza `unauthorized` si
 * el reto no existe, venció o es señuelo, o si el código no coincide o ya se usó (la misma
 * respuesta en todos los casos), y `rate_limited` si el usuario agotó sus intentos.
 * Seguridad: cada código equivocado cuenta en el mismo límite por usuario que la contraseña (H05),
 * también en un reto señuelo, y un reto admite 5 intentos. Un código de recuperación cuesta un
 * scrypt también en un reto señuelo.
 */
export async function loginCode(
  ctx: AppContext,
  request: LoginCodeRequest,
): Promise<LoginSessionStep> {
  const challenge = ctx.mfa.challenges.find(request.challenge);
  const fail = async (accountId: string | null): Promise<never> => {
    if (challenge !== null) {
      ctx.limiters.loginFailures.consume(challenge.limiterKey);
      ctx.mfa.challenges.fail(request.challenge);
    }
    ctx.limiters.loginThrottle.record();
    if (accountId !== null) logSecurityEvent(ctx, 'mfa_failed', accountId);
    await sleep(ctx, ctx.limiters.loginThrottle.delayMs());
    throw new ApiFailure('unauthorized');
  };
  if (challenge === null) return fail(null);
  if (ctx.limiters.loginFailures.isLimited(challenge.limiterKey)) {
    ctx.limiters.loginThrottle.record();
    logSecurityEvent(ctx, 'login_rate_limited', challenge.accountId);
    await sleep(ctx, ctx.limiters.loginThrottle.delayMs());
    throw new ApiFailure('rate_limited');
  }
  const account =
    challenge.accountId === null ? null : ctx.authorities.findAccount(challenge.accountId);
  if (account === null) {
    if (!isTotpCodeFormat(request.code)) await dummyRecoveryCheck(ctx.mfa.recoveryLogN);
    return fail(null);
  }
  const kind = await checkCode(ctx, account.accountId, request.code);
  if (kind === null) return fail(account.accountId);
  ctx.mfa.challenges.remove(request.challenge);
  if (kind === 'recovery') logSecurityEvent(ctx, 'mfa_recovery_used', account.accountId);
  return openSession(ctx, account, 'mfa');
}

/**
 * Secreto TOTP nuevo para la cuenta de la sesión, que queda por confirmar 10 minutos. Lanza
 * `conflict` si la cuenta ya tiene segundo factor.
 * Seguridad: el secreto solo se guarda (cifrado) al confirmarlo con un código; nunca se registra.
 */
export function beginMfaEnrollment(ctx: AppContext, account: AuthorityAccount): MfaEnrollment {
  if (ctx.mfa.enrollments.isEnrolled(account.accountId)) throw new ApiFailure('conflict');
  const secret = generateTotpSecret();
  ctx.mfa.pending.put(account.accountId, secret);
  return {
    secret: toBase32(secret),
    otpauthUri: otpauthUri({ issuer: ctx.mfa.issuer, label: account.username, secret }),
    digits: MFA_CODE_DIGITS,
    periodSeconds: MFA_PERIOD_SECONDS,
  };
}

/**
 * Confirma la inscripción con el primer código: guarda el secreto cifrado, crea los 10 códigos de
 * recuperación (solo sus digestos) y cambia la sesión limitada por una completa con token nuevo.
 * Lanza `conflict` si no hay secreto por confirmar o la cuenta ya está inscrita, `bad_request` si
 * el código no coincide y `rate_limited` si el usuario agotó sus intentos (el mismo límite que la
 * contraseña).
 */
export function confirmMfaEnrollment(
  ctx: AppContext,
  account: AuthorityAccount,
  sessionToken: string,
  request: MfaConfirmRequest,
): MfaConfirmResponse {
  const key = limiterKey(account.username);
  if (ctx.limiters.loginFailures.isLimited(key)) {
    logSecurityEvent(ctx, 'login_rate_limited', account.accountId);
    throw new ApiFailure('rate_limited');
  }
  const secret = ctx.mfa.pending.find(account.accountId);
  if (secret === null || ctx.mfa.enrollments.isEnrolled(account.accountId)) {
    throw new ApiFailure('conflict');
  }
  const step = verifyTotp(secret, request.code, ctx.deps.now().getTime(), null);
  if (step === null) {
    ctx.limiters.loginFailures.consume(key);
    logSecurityEvent(ctx, 'mfa_failed', account.accountId);
    throw new ApiFailure('bad_request');
  }
  const { codes, set } = generateRecoveryCodes(ctx.mfa.recoveryLogN);
  ctx.mfa.enrollments.insert({
    accountId: account.accountId,
    secretSealed: encryptTotpSecret(ctx.mfa.key, account.accountId, secret),
    // El código de la confirmación ya no sirve para entrar.
    lastStep: step,
    recovery: set,
    enrolledAt: minuteOf(ctx.deps.now()),
  });
  ctx.mfa.pending.remove(account.accountId);
  logSecurityEvent(ctx, 'mfa_enrolled', account.accountId);
  // Token nuevo al subir de nivel: el de la sesión limitada deja de valer.
  ctx.sessions.revoke(sessionToken);
  return { recoveryCodes: codes, session: openSession(ctx, account, 'mfa') };
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
