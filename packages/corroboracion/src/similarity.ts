// Resumen difuso del relato para la señal «textos muy parecidos» (ADR 0010): MinHash de un bit
// sobre fragmentos de 5 caracteres, con llave derivada de la salida VOPRF. Lo calcula el navegador;
// solo viaja el resumen de 64 bytes, nunca el texto. Análisis de privacidad en docs/criptografia.md.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { textKey } from '@sigilo/anonimato/normalize';
import { SIMILARITY_DIGEST_BYTES } from '@sigilo/contracts';
import { utf8Encode } from '@sigilo/core';

/** Largo de cada fragmento (en caracteres del texto normalizado). */
export const SHINGLE_LENGTH = 5;
/** Fragmentos distintos mínimos: con menos, la estimación es ruido y no se manda resumen. */
export const MIN_SHINGLES = 30;
/** Permutaciones (y bits) del resumen. */
export const SIMILARITY_BITS = SIMILARITY_DIGEST_BYTES * 8;

/** Mezclador final de MurmurHash3: biyección de 32 bits con buena avalancha. */
function mix32(value: number): number {
  let h = value >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Fragmentos de 5 caracteres del relato normalizado como en `@sigilo/anonimato` (`textKey`). */
export function textShingles(text: string): Set<string> {
  const normalized = textKey(text).replaceAll(' ', '_');
  const shingles = new Set<string>();
  for (let index = 0; index + SHINGLE_LENGTH <= normalized.length; index += 1) {
    shingles.add(normalized.slice(index, index + SHINGLE_LENGTH));
  }
  return shingles;
}

/**
 * Resumen difuso de 64 bytes del relato, o `null` si el relato tiene menos de `MIN_SHINGLES`
 * fragmentos. Bit i = bit menos significativo del mínimo de la permutación i sobre los fragmentos.
 * Seguridad: cada fragmento se resume con HMAC-SHA256 bajo `similarityKey`, que conoce solo quien
 * conoce el identificador y obtuvo su salida del evaluador; el índice, que solo ve la etiqueta, no
 * puede probar frases candidatas. 512 bits no alcanzan para reconstruir un relato. Lanza error si
 * la llave no mide 32 bytes.
 */
export function similarityDigest(text: string, similarityKey: Uint8Array): Uint8Array | null {
  if (similarityKey.length !== 32) throw new Error('La llave de similitud debe medir 32 bytes.');
  const shingles = textShingles(text);
  if (shingles.size < MIN_SHINGLES) return null;
  const minimums = new Uint32Array(SIMILARITY_BITS).fill(0xffffffff);
  for (const shingle of shingles) {
    const mac = hmac(sha256, similarityKey, utf8Encode(shingle));
    const view = new DataView(mac.buffer, mac.byteOffset, mac.byteLength);
    const first = view.getUint32(0);
    // Segundo resumen impar para que la secuencia first + i·second recorra valores distintos.
    const second = view.getUint32(4) | 1;
    for (let index = 0; index < SIMILARITY_BITS; index += 1) {
      const value = mix32((first + Math.imul(index, second)) >>> 0);
      if (value < (minimums[index] ?? 0xffffffff)) minimums[index] = value;
    }
  }
  const digest = new Uint8Array(SIMILARITY_DIGEST_BYTES);
  for (let index = 0; index < SIMILARITY_BITS; index += 1) {
    if (((minimums[index] ?? 0) & 1) === 1) {
      const byte = index >> 3;
      digest[byte] = (digest[byte] ?? 0) | (1 << (index & 7));
    }
  }
  return digest;
}

/**
 * Estimación de la similitud de Jaccard entre dos relatos a partir de sus resúmenes. Con MinHash
 * de un bit, P(bit igual) = J + (1 − J)/2, así que J ≈ 2·(iguales/512) − 1, acotado a [0, 1].
 * Lanza error si los resúmenes no miden 64 bytes.
 */
export function estimateSimilarity(left: Uint8Array, right: Uint8Array): number {
  if (left.length !== SIMILARITY_DIGEST_BYTES || right.length !== SIMILARITY_DIGEST_BYTES) {
    throw new Error('Los resúmenes deben medir 64 bytes.');
  }
  let equal = 0;
  for (let index = 0; index < SIMILARITY_DIGEST_BYTES; index += 1) {
    let differing = ((left[index] ?? 0) ^ (right[index] ?? 0)) & 0xff;
    let ones = 0;
    while (differing !== 0) {
      differing &= differing - 1;
      ones += 1;
    }
    equal += 8 - ones;
  }
  return Math.max(0, Math.min(1, (2 * equal) / SIMILARITY_BITS - 1));
}
