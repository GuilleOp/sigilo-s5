// Prueba de trabajo autoalojada: retos firmados con HMAC, con vencimiento y de un solo uso, que se
// exigen antes de aceptar denuncias y pruebas.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { MAX_POW_BITS, POW_HEADER, PowPurposeSchema } from '@sigilo/contracts';
import type { PowChallenge, PowPurpose } from '@sigilo/contracts';
import {
  fromBase64Url,
  isPowSolution,
  parsePowHeader,
  randomBytes,
  toBase64Url,
  toHex,
  utf8Decode,
  utf8Encode,
} from '@sigilo/core';
import { z } from 'zod';
import { ApiFailure } from '../http/errors.ts';

/** Vigencia de un reto. */
export const POW_TTL_MS = 10 * 60 * 1000;

/** Máximo de retos usados que se recuerdan a la vez (hasta que vencen). */
export const MAX_SPENT_CHALLENGES = 200_000;

/** Emisión y verificación de retos. */
export interface PowGuard {
  /** Dificultad vigente; 0 desactiva la exigencia. */
  readonly bits: number;
  issue(purpose: PowPurpose): PowChallenge;
  /**
   * Comprueba la cabecera `POW_HEADER` para el propósito y gasta el reto.
   * Lanza `proof_required` si falta, no es válida, es de otro propósito, venció o ya se usó.
   * Con `bits = 0` no exige nada.
   */
  verify(header: string | undefined, purpose: PowPurpose): void;
}

/** Opciones del guardián. */
export interface PowGuardOptions {
  bits: number;
  now: () => Date;
  /** Llave HMAC; por omisión, 32 bytes aleatorios por proceso (reiniciar invalida los retos). */
  secret?: Uint8Array;
  ttlMs?: number;
  maxSpent?: number;
}

const ChallengePayloadSchema = z.object({
  v: z.literal(1),
  purpose: PowPurposeSchema,
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  expiresAt: z.number().int().nonnegative(),
  bits: z.number().int().min(0).max(MAX_POW_BITS),
});

/**
 * Crea el guardián de la prueba de trabajo.
 * Seguridad: el servidor no guarda los retos emitidos (van firmados), solo los ya gastados y hasta
 * que vencen; si esa lista se llena, rechaza en lugar de olvidar, para seguir siendo de un solo
 * uso. Cada reto sirve para un propósito, así uno pedido para una prueba no sirve para denunciar.
 */
export function createPowGuard(options: PowGuardOptions): PowGuard {
  const { bits, now } = options;
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_POW_BITS) {
    throw new Error(`La dificultad debe ser un entero entre 0 y ${MAX_POW_BITS}.`);
  }
  const secret = options.secret ?? randomBytes(32);
  const ttlMs = options.ttlMs ?? POW_TTL_MS;
  const maxSpent = options.maxSpent ?? MAX_SPENT_CHALLENGES;
  const spent = new Map<string, number>();
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  function mac(body: string): Uint8Array {
    return new Uint8Array(createHmac('sha256', secret).update(body, 'utf8').digest());
  }

  function sweep(time: number): void {
    // Amortizado: a lo más un barrido por minuto.
    if (time - lastSweepAt < 60_000 && spent.size < maxSpent) return;
    lastSweepAt = time;
    for (const [nonce, expiresAt] of spent) {
      if (expiresAt <= time) spent.delete(nonce);
    }
  }

  function readPayload(token: string): z.infer<typeof ChallengePayloadSchema> | null {
    const [body, signature, ...rest] = token.split('.');
    if (body === undefined || signature === undefined || rest.length > 0) return null;
    try {
      const expected = mac(body);
      const provided = fromBase64Url(signature);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
      const parsed = ChallengePayloadSchema.safeParse(JSON.parse(utf8Decode(fromBase64Url(body))));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  return {
    bits,
    issue: (purpose) => {
      const payload = {
        v: 1 as const,
        purpose,
        nonce: toHex(randomBytes(16)),
        expiresAt: now().getTime() + ttlMs,
        bits,
      };
      const body = toBase64Url(utf8Encode(JSON.stringify(payload)));
      return { token: `${body}.${toBase64Url(mac(body))}`, bits };
    },
    verify: (header, purpose) => {
      if (bits === 0) return;
      const solution = header === undefined ? null : parsePowHeader(header);
      const payload = solution === null ? null : readPayload(solution.token);
      const time = now().getTime();
      const isValid =
        solution !== null &&
        payload !== null &&
        payload.purpose === purpose &&
        payload.expiresAt > time &&
        payload.bits >= bits &&
        isPowSolution(solution.token, solution.counter, payload.bits);
      if (!isValid) throw new ApiFailure('proof_required');
      sweep(time);
      if (spent.has(payload.nonce) || spent.size >= maxSpent) {
        throw new ApiFailure('proof_required');
      }
      spent.set(payload.nonce, payload.expiresAt);
    },
  };
}

/** Middleware que exige la prueba de trabajo del propósito antes de leer el cuerpo. */
export function requireProofOfWork(guard: PowGuard, purpose: PowPurpose): MiddlewareHandler {
  return async (c, next) => {
    guard.verify(c.req.header(POW_HEADER), purpose);
    await next();
  };
}
