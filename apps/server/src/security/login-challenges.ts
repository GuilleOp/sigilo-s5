// Retos del segundo paso del inicio de sesión y secretos TOTP por confirmar, en memoria. El reto
// se guarda solo como digesto, vence a los 5 minutos y admite pocos intentos; reiniciar el
// servidor los descarta.
import { createHash } from 'node:crypto';
import { LOGIN_CHALLENGE_TIMEOUT_SECONDS } from '@sigilo/contracts';
import { randomBytes, toBase64Url } from '@sigilo/core';

/** Intentos de código por reto; al agotarse hay que volver a escribir la contraseña. */
export const MAX_CODE_ATTEMPTS_PER_CHALLENGE = 5;

/** Tope de retos vivos; al llenarse se descartan los más antiguos. */
export const MAX_LOGIN_CHALLENGES = 10_000;

/** Vigencia de un secreto por confirmar: 10 minutos. */
export const PENDING_ENROLLMENT_MS = 10 * 60 * 1000;

const CHALLENGE_BYTES = 32;

/** Reto del segundo paso. */
export interface LoginChallenge {
  /** Llave del limitador por usuario (la misma de la contraseña, H05). */
  limiterKey: string;
  /** Cuenta, o `null` en un reto señuelo (usuario inexistente o contraseña equivocada). */
  accountId: string | null;
  expiresAt: number;
  attempts: number;
}

/** Almacén de retos. */
export interface LoginChallengeStore {
  /** Abre un reto y devuelve su token. */
  issue(limiterKey: string, accountId: string | null): string;
  /** Reto vigente del token, o `null`. */
  find(token: string): LoginChallenge | null;
  /** Suma un intento fallido; al llegar al máximo, el reto se descarta. */
  fail(token: string): void;
  /** Descarta el reto. */
  remove(token: string): void;
  size(): number;
}

function digestOf(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Crea el almacén con el reloj inyectado.
 * Seguridad: un reto señuelo y uno real tienen la misma forma y vigencia; solo se guarda el
 * SHA-256 del token.
 */
export function createLoginChallengeStore(now: () => Date): LoginChallengeStore {
  const challenges = new Map<string, LoginChallenge>();
  const ttlMs = LOGIN_CHALLENGE_TIMEOUT_SECONDS * 1000;

  function sweep(time: number): void {
    for (const [digest, challenge] of challenges) {
      if (challenge.expiresAt <= time) challenges.delete(digest);
    }
  }

  return {
    issue: (limiterKey, accountId) => {
      const time = now().getTime();
      if (challenges.size >= MAX_LOGIN_CHALLENGES) sweep(time);
      while (challenges.size >= MAX_LOGIN_CHALLENGES) {
        const oldest = challenges.keys().next();
        if (oldest.done === true) break;
        challenges.delete(oldest.value);
      }
      const token = toBase64Url(randomBytes(CHALLENGE_BYTES));
      challenges.set(digestOf(token), {
        limiterKey,
        accountId,
        expiresAt: time + ttlMs,
        attempts: 0,
      });
      return token;
    },
    find: (token) => {
      if (token === '') return null;
      const digest = digestOf(token);
      const challenge = challenges.get(digest);
      if (challenge === undefined) return null;
      if (challenge.expiresAt <= now().getTime()) {
        challenges.delete(digest);
        return null;
      }
      return challenge;
    },
    fail: (token) => {
      const digest = digestOf(token);
      const challenge = challenges.get(digest);
      if (challenge === undefined) return;
      challenge.attempts += 1;
      if (challenge.attempts >= MAX_CODE_ATTEMPTS_PER_CHALLENGE) challenges.delete(digest);
    },
    remove: (token) => {
      challenges.delete(digestOf(token));
    },
    size: () => challenges.size,
  };
}

/** Secretos TOTP por confirmar, uno por cuenta. */
export interface PendingEnrollments {
  put(accountId: string, secret: Uint8Array): void;
  find(accountId: string): Uint8Array | null;
  remove(accountId: string): void;
}

/** Crea el almacén de secretos por confirmar (se borran con ceros al descartarse). */
export function createPendingEnrollments(now: () => Date): PendingEnrollments {
  const pending = new Map<string, { secret: Uint8Array; expiresAt: number }>();
  const remove = (accountId: string): void => {
    pending.get(accountId)?.secret.fill(0);
    pending.delete(accountId);
  };
  return {
    put: (accountId, secret) => {
      remove(accountId);
      pending.set(accountId, { secret, expiresAt: now().getTime() + PENDING_ENROLLMENT_MS });
    },
    find: (accountId) => {
      const entry = pending.get(accountId);
      if (entry === undefined) return null;
      if (entry.expiresAt <= now().getTime()) {
        remove(accountId);
        return null;
      }
      return entry.secret;
    },
    remove,
  };
}
