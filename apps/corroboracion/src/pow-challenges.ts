// Retos de prueba de trabajo del evaluador: opacos, firmados con HMAC-SHA256, de un solo uso y con
// vencimiento. Se verifican con `isPowSolution` de @sigilo/core, igual que en el nodo.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { DatabaseSync } from 'node:sqlite';
import type { PowChallenge } from '@sigilo/contracts';
import {
  equalBytes,
  fromBase64Url,
  isPowSolution,
  parsePowHeader,
  randomBytes,
  toBase64Url,
  toHex,
  utf8Decode,
  utf8Encode,
} from '@sigilo/core';

/** Vigencia de un reto. */
export const CHALLENGE_TTL_MS = 10 * 60_000;
const TEN_MINUTES_MS = 10 * 60_000;
const PAYLOAD_PATTERN = /^(\d{1,15})\.([0-9a-f]{32})\.(\d{1,2})$/u;

/** Emisor y verificador de retos. */
export interface ChallengeIssuer {
  issue(): PowChallenge;
  /**
   * Gasta el reto si la cabecera lo resuelve. Devuelve `false` ante cualquier fallo (firma,
   * vencimiento, dificultad, solución o reto ya usado), sin decir cuál.
   */
  spend(header: string | undefined): boolean;
}

/** Crea el emisor con un secreto propio del proceso: al reiniciar, los retos anteriores vencen. */
export function createChallengeIssuer(deps: {
  db: DatabaseSync;
  bits: number;
  now: () => Date;
  secret?: Uint8Array;
}): ChallengeIssuer {
  const secret = deps.secret ?? randomBytes(32);
  const mac = (payload: string): Uint8Array => hmac(sha256, secret, utf8Encode(payload));
  const insert = deps.db.prepare(
    'INSERT INTO spent_challenges (nonce, expires_at) VALUES (?, ?) ON CONFLICT DO NOTHING',
  );
  const purge = deps.db.prepare('DELETE FROM spent_challenges WHERE expires_at < ?');
  return {
    issue() {
      const expires = deps.now().getTime() + CHALLENGE_TTL_MS;
      const payload = `${expires}.${toHex(randomBytes(16))}.${deps.bits}`;
      return {
        token: `${toBase64Url(utf8Encode(payload))}.${toBase64Url(mac(payload))}`,
        bits: deps.bits,
      };
    },
    spend(header) {
      const parsed = header === undefined ? null : parsePowHeader(header);
      if (parsed === null) return false;
      const [encodedPayload, encodedMac, ...rest] = parsed.token.split('.');
      if (encodedPayload === undefined || encodedMac === undefined || rest.length > 0) return false;
      let payload: string;
      let givenMac: Uint8Array;
      try {
        payload = utf8Decode(fromBase64Url(encodedPayload));
        givenMac = fromBase64Url(encodedMac);
      } catch {
        return false;
      }
      // Seguridad: comparación en tiempo constante de la firma del reto.
      if (!equalBytes(givenMac, mac(payload))) return false;
      const match = PAYLOAD_PATTERN.exec(payload);
      if (match === null) return false;
      const expires = Number(match[1]);
      const bits = Number(match[3]);
      const now = deps.now().getTime();
      if (expires < now || bits < deps.bits) return false;
      if (!isPowSolution(parsed.token, parsed.counter, bits)) return false;
      purge.run(now);
      // El vencimiento se guarda redondeado hacia arriba a 10 minutos: no fecha cada evaluación.
      const roundedExpiry = Math.ceil(expires / TEN_MINUTES_MS) * TEN_MINUTES_MS;
      return Number(insert.run(match[2] ?? '', roundedExpiry).changes) === 1;
    },
  };
}
