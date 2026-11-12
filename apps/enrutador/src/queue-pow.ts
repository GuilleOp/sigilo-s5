// Prueba de trabajo propia del enrutador para la cola de entrega: si el nodo destino está caído no
// puede emitir su reto, así que el enrutador cobra el suyo antes de guardar un sobre. Retos firmados
// con HMAC, con vencimiento y de un solo uso; el formato es el mismo que resuelve la web.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { MAX_POW_BITS } from '@sigilo/contracts';
import type { PowChallenge } from '@sigilo/contracts';
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

/** Vigencia de un reto de la cola: margen para resolverlo en un celular lento. */
export const QUEUE_POW_TTL_MS = 10 * 60 * 1000;

/** Dificultad por omisión: la misma base que el reto `complaint` de un nodo. */
export const DEFAULT_QUEUE_POW_BITS = 18;

/** Retos usados que se recuerdan a la vez (hasta que vencen). */
const MAX_SPENT = 100_000;

const PayloadSchema = z.object({
  v: z.literal(1),
  purpose: z.literal('queue'),
  nonce: z.string().regex(/^[0-9a-f]{32}$/u),
  expiresAt: z.number().int().nonnegative(),
  bits: z.number().int().min(0).max(MAX_POW_BITS),
});

/** Emisión y verificación de los retos de la cola. */
export interface QueuePow {
  issue(): PowChallenge;
  /** Comprueba la solución y la gasta; devuelve `false` si falta, no vale, venció o ya se usó. */
  spend(proof: string): boolean;
}

/** Crea el guardián de la cola. Con `bits = 0` toda solución bien formada vale (pruebas). */
export function createQueuePow(options: {
  bits: number;
  now: () => Date;
  secret?: Uint8Array;
}): QueuePow {
  const { bits, now } = options;
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_POW_BITS) {
    throw new Error(`La dificultad de la cola debe ser un entero entre 0 y ${MAX_POW_BITS}.`);
  }
  const secret = options.secret ?? randomBytes(32);
  const spent = new Map<string, number>();
  const mac = (body: string): Uint8Array =>
    new Uint8Array(createHmac('sha256', secret).update(body, 'utf8').digest());

  const sweep = (time: number): void => {
    for (const [nonce, expiresAt] of spent) if (expiresAt <= time) spent.delete(nonce);
  };

  const readPayload = (token: string): z.infer<typeof PayloadSchema> | null => {
    const [body, signature, ...rest] = token.split('.');
    if (body === undefined || signature === undefined || rest.length > 0) return null;
    try {
      const expected = mac(body);
      const provided = fromBase64Url(signature);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
      const parsed = PayloadSchema.safeParse(JSON.parse(utf8Decode(fromBase64Url(body))));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  return {
    issue() {
      const payload = {
        v: 1 as const,
        purpose: 'queue' as const,
        nonce: toHex(randomBytes(16)),
        expiresAt: now().getTime() + QUEUE_POW_TTL_MS,
        bits,
      };
      const body = toBase64Url(utf8Encode(JSON.stringify(payload)));
      return { token: `${body}.${toBase64Url(mac(body))}`, bits };
    },
    spend(proof) {
      const solution = parsePowHeader(proof);
      const payload = solution === null ? null : readPayload(solution.token);
      const time = now().getTime();
      if (
        solution === null ||
        payload === null ||
        payload.expiresAt <= time ||
        payload.bits < bits ||
        spent.has(payload.nonce) ||
        !isPowSolution(solution.token, solution.counter, payload.bits)
      ) {
        return false;
      }
      if (spent.size >= MAX_SPENT) sweep(time);
      // Seguridad: con la lista llena de retos vigentes se rechaza en lugar de olvidar uno usado.
      if (spent.size >= MAX_SPENT) return false;
      spent.set(payload.nonce, payload.expiresAt);
      return true;
    },
  };
}
