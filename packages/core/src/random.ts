// Fuente única de aleatoriedad criptográfica del paquete.

// Límite de bytes por llamada que impone la API Web Crypto.
const MAX_CHUNK = 65536;

/**
 * Devuelve `length` bytes aleatorios de `crypto.getRandomValues`.
 * Lanza error si `length` no es un entero no negativo.
 */
export function randomBytes(length: number): Uint8Array {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new Error('La longitud debe ser un entero no negativo.');
  }
  const output = new Uint8Array(length);
  for (let offset = 0; offset < length; offset += MAX_CHUNK) {
    globalThis.crypto.getRandomValues(
      output.subarray(offset, Math.min(offset + MAX_CHUNK, length)),
    );
  }
  return output;
}

const UINT32_RANGE = 2 ** 32;

/**
 * Entero aleatorio uniforme en `[0, maxExclusive)`, por muestreo con rechazo para no sesgar.
 * Lanza error si `maxExclusive` no es un entero entre 1 y 2^32.
 */
export function randomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new Error('El máximo debe ser un entero entre 1 y 2^32.');
  }
  // Se descartan los valores del último tramo incompleto, que favorecerían a los primeros.
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0] ?? 0;
    if (value < limit) return value % maxExclusive;
  }
}

/**
 * Copia barajada de `items` (Fisher-Yates con `randomInt`).
 * Seguridad: con aleatoriedad criptográfica, el orden resultante no revela el de entrada.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const other = randomInt(index + 1);
    const current = output[index] as T;
    output[index] = output[other] as T;
    output[other] = current;
  }
  return output;
}
