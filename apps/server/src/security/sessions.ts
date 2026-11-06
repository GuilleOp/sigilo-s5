// Sesiones de la autoridad en memoria: token aleatorio que se guarda solo como digesto, vencimiento
// por inactividad y por duración, e invalidación al cerrar sesión. Reiniciar el servidor las cierra.
import { createHash } from 'node:crypto';
import { SESSION_ABSOLUTE_TIMEOUT_SECONDS, SESSION_IDLE_TIMEOUT_SECONDS } from '@sigilo/contracts';
import { randomBytes, toBase64Url } from '@sigilo/core';

/** Sesión vigente de una cuenta. */
export interface Session {
  accountId: string;
  createdAt: number;
  lastSeenAt: number;
}

/** Resultado de buscar una sesión: vigente, vencida o inexistente. */
export type SessionLookup =
  | { status: 'active'; session: Session }
  | { status: 'expired'; accountId: string }
  | { status: 'missing' };

/** Almacén de sesiones. */
export interface SessionStore {
  /** Abre una sesión y devuelve su token; `token` solo lo fijan las pruebas. */
  issue(accountId: string, token?: string): string;
  /** Busca la sesión del token y, si sigue vigente, renueva su inactividad. */
  resolve(token: string): SessionLookup;
  /** Cierra la sesión del token; devuelve la cuenta si existía. */
  revoke(token: string): string | null;
  /** Sesiones guardadas (para pruebas). */
  size(): number;
}

/** Límites de las sesiones en milisegundos. */
export interface SessionTimeouts {
  idleMs: number;
  absoluteMs: number;
}

/** Vencimientos por omisión: 15 minutos sin actividad u 8 horas en total. */
export const DEFAULT_SESSION_TIMEOUTS: SessionTimeouts = {
  idleMs: SESSION_IDLE_TIMEOUT_SECONDS * 1000,
  absoluteMs: SESSION_ABSOLUTE_TIMEOUT_SECONDS * 1000,
};

/** Tope de sesiones vivas; al llenarse se descartan las más antiguas. */
export const MAX_SESSIONS = 10_000;

const TOKEN_BYTES = 32;

function digestOf(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Crea el almacén con el reloj inyectado.
 * Seguridad: solo se guarda el SHA-256 del token, así que una copia de la memoria no permite
 * suplantar una sesión; cada búsqueda barre las vencidas.
 */
export function createSessionStore(
  now: () => Date,
  timeouts: SessionTimeouts = DEFAULT_SESSION_TIMEOUTS,
): SessionStore {
  const sessions = new Map<string, Session>();

  function isExpired(session: Session, time: number): boolean {
    return (
      time - session.lastSeenAt >= timeouts.idleMs ||
      time - session.createdAt >= timeouts.absoluteMs
    );
  }

  function sweep(time: number): void {
    for (const [digest, session] of sessions) {
      if (isExpired(session, time)) sessions.delete(digest);
    }
  }

  return {
    issue: (accountId, token = toBase64Url(randomBytes(TOKEN_BYTES))) => {
      const time = now().getTime();
      if (sessions.size >= MAX_SESSIONS) sweep(time);
      // El Map conserva el orden de inserción: la primera es la más antigua.
      while (sessions.size >= MAX_SESSIONS) {
        const oldest = sessions.keys().next();
        if (oldest.done === true) break;
        sessions.delete(oldest.value);
      }
      sessions.set(digestOf(token), { accountId, createdAt: time, lastSeenAt: time });
      return token;
    },
    resolve: (token) => {
      if (token === '') return { status: 'missing' };
      const digest = digestOf(token);
      const session = sessions.get(digest);
      if (session === undefined) return { status: 'missing' };
      const time = now().getTime();
      if (isExpired(session, time)) {
        sessions.delete(digest);
        return { status: 'expired', accountId: session.accountId };
      }
      session.lastSeenAt = time;
      return { status: 'active', session };
    },
    revoke: (token) => {
      const digest = digestOf(token);
      const session = sessions.get(digest);
      sessions.delete(digest);
      return session?.accountId ?? null;
    },
    size: () => sessions.size,
  };
}
