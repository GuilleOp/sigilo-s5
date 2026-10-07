// Prueba de trabajo autoalojada: retos firmados con HMAC, con vencimiento y de uso acotado, que se
// exigen antes de aceptar denuncias, pruebas y respuestas del buzón. La dificultad es adaptativa.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { MAX_EVIDENCE_ITEMS, MAX_POW_BITS, POW_HEADER, PowPurposeSchema } from '@sigilo/contracts';
import type { PowChallenge, PowPurpose } from '@sigilo/contracts';
import {
  fromBase64Url,
  isPowSolution,
  parsePowHeader,
  powSolveSeconds,
  randomBytes,
  toBase64Url,
  toHex,
  utf8Decode,
  utf8Encode,
} from '@sigilo/core';
import { z } from 'zod';
import { ApiFailure } from '../http/errors.ts';

/**
 * Escritura que presenta una solución. Una subida de pruebas (`evidence`) usa el reto `complaint`
 * de su denuncia: así una denuncia con sus pruebas resuelve un solo reto.
 */
export type PowUse = PowPurpose | 'evidence';

/**
 * Margen fijo de la vigencia con poca presión sobre la lista de gastados: cubre la red y la
 * subida de hasta `MAX_EVIDENCE_ITEMS` pruebas con una conexión lenta.
 */
export const POW_TTL_MS = 5 * 60 * 1000;

/** Margen mínimo: la lista de gastados llena lo acorta hasta aquí, nunca menos. */
export const MIN_POW_TTL_MS = 60 * 1000;

/** Veces el percentil 95 de un celular lento que se suman a la vigencia de cada reto. */
export const POW_TTL_SOLVE_FACTOR = 4;

/** Máximo de retos usados que se recuerdan a la vez (hasta que vencen). */
export const MAX_SPENT_CHALLENGES = 200_000;

/**
 * Dificultad máxima por omisión de la dificultad adaptativa: 20 bits, un millón de hashes en
 * promedio; un celular básico (50 mil hashes por segundo) lo resuelve en unos 21 s y en menos de
 * 63 s el 95 % de las veces.
 */
export const DEFAULT_POW_MAX_BITS = 20;

/** Ventana de la carga reciente que mueve la dificultad. */
export const POW_LOAD_WINDOW_MS = 60 * 60 * 1000;

/**
 * Retos usados por ventana a partir de los cuales cada duplicación de la carga suma un bit (el
 * doble de trabajo esperado por envío). Un reto `complaint` cuenta una vez aunque cubra pruebas.
 */
export const DEFAULT_POW_LOAD_THRESHOLDS: Readonly<Record<PowPurpose, number>> = {
  complaint: 60,
  message: 300,
};

/**
 * Vigencia de un reto de `bits`: el margen más `POW_TTL_SOLVE_FACTOR` veces el percentil 95 de
 * un celular lento (`powSolveSeconds`, 50 mil hashes por segundo). Es proporcional a 2^bits y
 * nunca menor que ese percentil: a 18 bits, unos 63 s más el margen; a 20, unos 4.2 min más el
 * margen.
 */
export function powTtlMs(bits: number, marginMs: number = POW_TTL_MS): number {
  return marginMs + Math.ceil(POW_TTL_SOLVE_FACTOR * powSolveSeconds(bits) * 1000);
}

/** Emisión y verificación de retos. */
export interface PowGuard {
  /** Dificultad base; 0 desactiva la exigencia. */
  readonly bits: number;
  /** Dificultad vigente para el propósito: la base más lo que suma la carga reciente. */
  currentBits(purpose: PowPurpose): number;
  issue(purpose: PowPurpose): PowChallenge;
  /**
   * Comprueba la cabecera `POW_HEADER` para la escritura, registra el uso y, en el primero, lo
   * cuenta como carga. Un reto `message` sirve una vez; uno `complaint`, para hasta
   * `MAX_EVIDENCE_ITEMS` subidas de pruebas y después para una denuncia, que lo cierra.
   * Lanza `proof_required` si falta, no es válida, es de otro propósito, venció, ya agotó sus usos
   * o su dificultad quedó más de un bit por debajo de la vigente. Con `bits = 0` no exige nada.
   */
  verify(header: string | undefined, use: PowUse): void;
}

/** Opciones del guardián. */
export interface PowGuardOptions {
  bits: number;
  now: () => Date;
  /** Dificultad máxima adaptativa (`DEFAULT_POW_MAX_BITS`, o `bits` si es mayor). */
  maxBits?: number;
  /** Llave HMAC; por omisión, 32 bytes aleatorios por proceso (reiniciar invalida los retos). */
  secret?: Uint8Array;
  /** Margen fijo de la vigencia (`POW_TTL_MS`); ver `powTtlMs`. */
  ttlMs?: number;
  maxSpent?: number;
  /** Ventana de la carga reciente (`POW_LOAD_WINDOW_MS`). */
  loadWindowMs?: number;
  /** Umbrales de carga por propósito (`DEFAULT_POW_LOAD_THRESHOLDS`). */
  loadThresholds?: Partial<Record<PowPurpose, number>>;
}

/** Contador de eventos en una ventana deslizante, por ranuras. */
export interface SlidingCounter {
  record(): void;
  /** Eventos registrados dentro de la ventana vigente. */
  count(): number;
}

const COUNTER_SLOTS = 12;

/**
 * Crea un contador deslizante de `windowMs` dividido en 12 ranuras: la carga cae de forma gradual
 * a medida que las ranuras viejas salen de la ventana, sin guardar la hora de cada evento.
 */
export function createSlidingCounter(windowMs: number, now: () => Date): SlidingCounter {
  const slotMs = Math.max(1, Math.floor(windowMs / COUNTER_SLOTS));
  const slots = new Map<number, number>();

  function currentSlot(): number {
    const slot = Math.floor(now().getTime() / slotMs);
    for (const key of slots.keys()) {
      if (key <= slot - COUNTER_SLOTS) slots.delete(key);
    }
    return slot;
  }

  return {
    record: () => {
      const slot = currentSlot();
      slots.set(slot, (slots.get(slot) ?? 0) + 1);
    },
    count: () => {
      currentSlot();
      let total = 0;
      for (const value of slots.values()) total += value;
      return total;
    },
  };
}

/** Bits que suma una carga: uno por cada duplicación sobre el umbral (0 si no lo supera). */
export function loadExtraBits(load: number, threshold: number): number {
  let extra = 0;
  let limit = Math.max(1, threshold);
  while (load > limit) {
    extra += 1;
    limit *= 2;
  }
  return extra;
}

/** Bits extra y margen de vigencia de los retos nuevos según qué tan llena está la lista de gastados. */
export function spentPressure(
  size: number,
  maxSpent: number,
  ttlMs: number,
): { extraBits: number; ttlMs: number } {
  const fill = maxSpent <= 0 ? 1 : size / maxSpent;
  const extraBits = (fill >= 0.5 ? 1 : 0) + (fill >= 0.75 ? 1 : 0) + (fill >= 0.9 ? 1 : 0);
  if (fill < 0.5) return { extraBits, ttlMs };
  const shortened = Math.round(ttlMs * 2 * Math.max(0, 1 - fill));
  return { extraBits, ttlMs: Math.max(Math.min(MIN_POW_TTL_MS, ttlMs), shortened) };
}

const ChallengePayloadSchema = z.object({
  v: z.literal(1),
  purpose: PowPurposeSchema,
  nonce: z.string().regex(/^[0-9a-f]{32}$/),
  expiresAt: z.number().int().nonnegative(),
  bits: z.number().int().min(0).max(MAX_POW_BITS),
});

/** Usos registrados de un reto resuelto, hasta que vence. */
interface SpentChallenge {
  expiresAt: number;
  evidenceUses: number;
  isClosed: boolean;
}

function canUse(entry: SpentChallenge | undefined, use: PowUse): boolean {
  if (entry === undefined) return true;
  if (entry.isClosed) return false;
  return use !== 'evidence' || entry.evidenceUses < MAX_EVIDENCE_ITEMS;
}

/**
 * Crea el guardián de la prueba de trabajo.
 * Seguridad: en lugar de rechazar a todos cuando hay abuso, la dificultad de cada propósito sube
 * un bit por cada duplicación de los retos usados en la última hora sobre su umbral (hasta
 * `maxBits`) y vuelve a bajar cuando la carga sale de la ventana: el costo de un ataque crece más
 * rápido que su volumen y una persona legítima solo espera más. Un reto solo se acepta si su
 * dificultad es a lo más un bit menor que la vigente al usarlo: los retos acaparados con poca
 * carga dejan de servir en cuanto la carga sube. El servidor no guarda los retos emitidos (van
 * firmados), solo los usados y hasta que vencen. Si esa lista se acerca a su tope, los retos
 * nuevos son más difíciles y su margen de vigencia se acorta; si aun así se llena, se olvidan
 * primero los usados más antiguos (los más próximos a vencer) en vez de rechazar.
 */
export function createPowGuard(options: PowGuardOptions): PowGuard {
  const { bits, now } = options;
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_POW_BITS) {
    throw new Error(`La dificultad debe ser un entero entre 0 y ${MAX_POW_BITS}.`);
  }
  const maxBits = Math.max(bits, options.maxBits ?? DEFAULT_POW_MAX_BITS);
  if (!Number.isInteger(maxBits) || maxBits > MAX_POW_BITS) {
    throw new Error(`La dificultad máxima debe ser un entero de hasta ${MAX_POW_BITS}.`);
  }
  const secret = options.secret ?? randomBytes(32);
  const ttlMs = options.ttlMs ?? POW_TTL_MS;
  const maxSpent = options.maxSpent ?? MAX_SPENT_CHALLENGES;
  const loadWindowMs = options.loadWindowMs ?? POW_LOAD_WINDOW_MS;
  const thresholds = { ...DEFAULT_POW_LOAD_THRESHOLDS, ...options.loadThresholds };
  const load: Record<PowPurpose, SlidingCounter> = {
    complaint: createSlidingCounter(loadWindowMs, now),
    message: createSlidingCounter(loadWindowMs, now),
  };
  const spent = new Map<string, SpentChallenge>();
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  function mac(body: string): Uint8Array {
    return new Uint8Array(createHmac('sha256', secret).update(body, 'utf8').digest());
  }

  function sweep(time: number): void {
    // Amortizado: a lo más un barrido por minuto, salvo que la lista esté llena.
    if (time - lastSweepAt < 60_000 && spent.size < maxSpent) return;
    lastSweepAt = time;
    for (const [nonce, entry] of spent) {
      if (entry.expiresAt <= time) spent.delete(nonce);
    }
  }

  // El mapa conserva el orden de inserción, que sigue de cerca al de vencimiento.
  function forgetOldest(): void {
    const target = Math.floor(maxSpent * 0.9);
    for (const nonce of spent.keys()) {
      if (spent.size <= target) break;
      spent.delete(nonce);
    }
  }

  function currentBits(purpose: PowPurpose): number {
    if (bits === 0) return 0;
    const pressure = spentPressure(spent.size, maxSpent, ttlMs);
    const extra = loadExtraBits(load[purpose].count(), thresholds[purpose]) + pressure.extraBits;
    return Math.min(maxBits, bits + extra);
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
    currentBits,
    issue: (purpose) => {
      const challengeBits = currentBits(purpose);
      const pressure = spentPressure(spent.size, maxSpent, ttlMs);
      const payload = {
        v: 1 as const,
        purpose,
        nonce: toHex(randomBytes(16)),
        expiresAt: now().getTime() + powTtlMs(challengeBits, pressure.ttlMs),
        bits: challengeBits,
      };
      const body = toBase64Url(utf8Encode(JSON.stringify(payload)));
      return { token: `${body}.${toBase64Url(mac(body))}`, bits: challengeBits };
    },
    verify: (header, use) => {
      if (bits === 0) return;
      const purpose: PowPurpose = use === 'message' ? 'message' : 'complaint';
      const solution = header === undefined ? null : parsePowHeader(header);
      const payload = solution === null ? null : readPayload(solution.token);
      const time = now().getTime();
      const isValid =
        solution !== null &&
        payload !== null &&
        payload.purpose === purpose &&
        payload.expiresAt > time &&
        payload.bits >= Math.max(bits, currentBits(purpose) - 1) &&
        isPowSolution(solution.token, solution.counter, payload.bits);
      if (!isValid) throw new ApiFailure('proof_required');
      const existing = spent.get(payload.nonce);
      if (!canUse(existing, use)) throw new ApiFailure('proof_required');
      let entry = existing;
      if (entry === undefined) {
        sweep(time);
        if (spent.size >= maxSpent) forgetOldest();
        entry = { expiresAt: payload.expiresAt, evidenceUses: 0, isClosed: false };
        spent.set(payload.nonce, entry);
        load[purpose].record();
      }
      if (use === 'evidence') entry.evidenceUses += 1;
      else entry.isClosed = true;
    },
  };
}

/** Middleware que exige la prueba de trabajo de la escritura antes de leer el cuerpo. */
export function requireProofOfWork(guard: PowGuard, use: PowUse): MiddlewareHandler {
  return async (c, next) => {
    guard.verify(c.req.header(POW_HEADER), use);
    await next();
  };
}
