// Prueba de trabajo tipo hashcash con SHA-256: el cliente busca un contador cuyo digesto con el
// reto empiece con `bits` bits en cero; el servidor lo comprueba con un solo hash.
import { sha256 } from '@noble/hashes/sha2.js';
import { MAX_POW_BITS } from '@sigilo/contracts';
import { utf8Encode } from './encoding.ts';

/** Patrón del contador: entero decimal sin ceros a la izquierda, de a lo más 15 cifras. */
const COUNTER_PATTERN = /^(0|[1-9]\d{0,14})$/;

/** Opciones de `solvePow`. */
export interface SolvePowOptions {
  /** Primer contador a probar (por omisión, 0). */
  startAt?: number;
  /** Máximo de intentos antes de rendirse (por omisión, sin límite práctico). */
  maxAttempts?: number;
  /** Se llama cada `progressEvery` intentos con el total probado. */
  onProgress?: (attempts: number) => void;
  progressEvery?: number;
}

function assertBits(bits: number): void {
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_POW_BITS) {
    throw new Error(`La dificultad debe ser un entero entre 0 y ${MAX_POW_BITS}.`);
  }
}

/** Número de bits en cero al inicio de `bytes`. */
export function leadingZeroBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    return count + Math.clz32(byte) - 24;
  }
  return count;
}

/** SHA-256 de `token + ":" + counter` en UTF-8. */
export function powDigest(token: string, counter: string): Uint8Array {
  return sha256(utf8Encode(`${token}:${counter}`));
}

/**
 * Indica si `counter` resuelve el reto `token` con `bits` de dificultad. Con `bits = 0` cualquier
 * contador válido sirve. Nunca lanza: un contador mal formado no es solución.
 */
export function isPowSolution(token: string, counter: string, bits: number): boolean {
  if (!COUNTER_PATTERN.test(counter) || !Number.isInteger(bits) || bits < 0) return false;
  if (bits > MAX_POW_BITS) return false;
  return leadingZeroBits(powDigest(token, counter)) >= bits;
}

/**
 * Busca el primer contador desde `startAt` que resuelve el reto. Devuelve `null` si se agotan
 * `maxAttempts`. Es síncrona: en el navegador se ejecuta en un Web Worker para no bloquear la
 * página. En promedio prueba 2^bits contadores.
 * Lanza error si `bits` no es válido.
 */
export function solvePow(
  token: string,
  bits: number,
  options: SolvePowOptions = {},
): string | null {
  assertBits(bits);
  const start = options.startAt ?? 0;
  const maxAttempts = options.maxAttempts ?? Number.MAX_SAFE_INTEGER;
  const progressEvery = options.progressEvery ?? 65_536;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const counter = String(start + attempt);
    if (leadingZeroBits(powDigest(token, counter)) >= bits) return counter;
    if (options.onProgress !== undefined && (attempt + 1) % progressEvery === 0) {
      options.onProgress(attempt + 1);
    }
  }
  return null;
}

/** Valor de la cabecera `POW_HEADER`: `<token>:<contador>`. */
export function formatPowHeader(token: string, counter: string): string {
  return `${token}:${counter}`;
}

/** Separa la cabecera `POW_HEADER`; `null` si no tiene la forma `<token>:<contador>`. */
export function parsePowHeader(value: string): { token: string; counter: string } | null {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return null;
  const token = value.slice(0, separator);
  const counter = value.slice(separator + 1);
  return COUNTER_PATTERN.test(counter) ? { token, counter } : null;
}
