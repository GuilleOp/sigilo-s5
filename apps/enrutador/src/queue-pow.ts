// Prueba de trabajo propia del enrutador para la cola de entrega: si el nodo destino está caído no
// puede emitir su reto, así que el enrutador cobra el suyo antes de guardar un sobre. Retos firmados
// con HMAC, con vencimiento y de un solo uso; el formato es el mismo que resuelve la web. La
// dificultad es adaptativa, como la del nodo: sube con la ocupación de la cola y con los retos
// gastados en la última hora.
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

/** Bits que la dificultad adaptativa puede sumar a la base por omisión. */
export const DEFAULT_QUEUE_POW_SPAN_BITS = 4;

/** Retos gastados por hora a partir de los cuales cada duplicación suma un bit. */
export const DEFAULT_QUEUE_POW_LOAD_THRESHOLD = 60;

const LOAD_WINDOW_MS = 60 * 60 * 1000;
const LOAD_SLOTS = 12;

/** Bits que suma la ocupación de la cola (0 a 1): uno a partir de 25 %, 50 % y 75 %. */
export function occupancyExtraBits(fill: number): number {
  return (fill >= 0.25 ? 1 : 0) + (fill >= 0.5 ? 1 : 0) + (fill >= 0.75 ? 1 : 0);
}

/** Bits que suma la carga: uno por cada duplicación sobre el umbral (0 si no lo supera). */
export function queueLoadExtraBits(load: number, threshold: number): number {
  let extra = 0;
  let limit = Math.max(1, threshold);
  while (load > limit) {
    extra += 1;
    limit *= 2;
  }
  return extra;
}

const PayloadSchema = z.object({
  v: z.literal(1),
  purpose: z.literal('queue'),
  nonce: z.string().regex(/^[0-9a-f]{32}$/u),
  expiresAt: z.number().int().nonnegative(),
  bits: z.number().int().min(0).max(MAX_POW_BITS),
});

/** Emisión y verificación de los retos de la cola. */
export interface QueuePow {
  /** Dificultad vigente: la base más lo que suman la ocupación y la carga. */
  currentBits(): number;
  issue(): PowChallenge;
  /** Comprueba la solución y la gasta; devuelve `false` si falta, no vale, venció o ya se usó. */
  spend(proof: string): boolean;
}

/**
 * Crea el guardián de la cola. Con `bits = 0` toda solución bien formada vale (pruebas).
 * Seguridad (H07): la dificultad sube un bit con cada cuarto de ocupación de la cola (`occupancy`)
 * y con cada duplicación de los retos gastados en la última hora sobre `loadThreshold`, hasta
 * `bits + spanBits`. Un reto se acepta si su dificultad es al menos la base y a lo más un bit menor
 * que la vigente: acaparar retos con la cola vacía deja de servir cuando la cola se llena.
 */
export function createQueuePow(options: {
  bits: number;
  now: () => Date;
  secret?: Uint8Array;
  /** Ocupación de la cola entre 0 y 1 (`RelayQueue.occupancy`); sin ella, 0. */
  occupancy?: () => number;
  spanBits?: number;
  loadThreshold?: number;
}): QueuePow {
  const { bits, now } = options;
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_POW_BITS) {
    throw new Error(`La dificultad de la cola debe ser un entero entre 0 y ${MAX_POW_BITS}.`);
  }
  const maxBits = Math.min(MAX_POW_BITS, bits + (options.spanBits ?? DEFAULT_QUEUE_POW_SPAN_BITS));
  const threshold = options.loadThreshold ?? DEFAULT_QUEUE_POW_LOAD_THRESHOLD;
  const slotMs = LOAD_WINDOW_MS / LOAD_SLOTS;
  const slots = new Map<number, number>();
  const load = (record: boolean): number => {
    const slot = Math.floor(now().getTime() / slotMs);
    for (const key of slots.keys()) if (key <= slot - LOAD_SLOTS) slots.delete(key);
    if (record) slots.set(slot, (slots.get(slot) ?? 0) + 1);
    let total = 0;
    for (const value of slots.values()) total += value;
    return total;
  };
  const currentBits = (): number => {
    if (bits === 0) return 0;
    const fill = options.occupancy?.() ?? 0;
    const extra = occupancyExtraBits(fill) + queueLoadExtraBits(load(false), threshold);
    return Math.min(maxBits, bits + extra);
  };
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
    currentBits,
    issue() {
      const challengeBits = currentBits();
      const payload = {
        v: 1 as const,
        purpose: 'queue' as const,
        nonce: toHex(randomBytes(16)),
        expiresAt: now().getTime() + QUEUE_POW_TTL_MS,
        bits: challengeBits,
      };
      const body = toBase64Url(utf8Encode(JSON.stringify(payload)));
      return { token: `${body}.${toBase64Url(mac(body))}`, bits: challengeBits };
    },
    spend(proof) {
      const solution = parsePowHeader(proof);
      const payload = solution === null ? null : readPayload(solution.token);
      const time = now().getTime();
      if (
        solution === null ||
        payload === null ||
        payload.expiresAt <= time ||
        payload.bits < Math.max(bits, currentBits() - 1) ||
        spent.has(payload.nonce) ||
        !isPowSolution(solution.token, solution.counter, payload.bits)
      ) {
        return false;
      }
      if (spent.size >= MAX_SPENT) sweep(time);
      // Seguridad: con la lista llena de retos vigentes se rechaza en lugar de olvidar uno usado.
      if (spent.size >= MAX_SPENT) return false;
      spent.set(payload.nonce, payload.expiresAt);
      load(true);
      return true;
    },
  };
}
