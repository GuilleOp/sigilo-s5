// Confirmación del recibo: la persona escribe dos palabras elegidas al azar.
import { normalizeWord } from '@sigilo/core';
import { resolvedWord } from './receipt-words.ts';

/**
 * Elige dos posiciones distintas al azar con `crypto.getRandomValues` (sin sesgo por módulo).
 * `random` se inyecta en pruebas.
 */
export function pickConfirmationPositions(
  wordCount: number,
  random: (buffer: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer> = (buffer) =>
    crypto.getRandomValues(buffer),
): [number, number] {
  if (wordCount < 2) throw new Error('Se necesitan al menos dos palabras.');
  const pick = (bound: number): number => {
    const limit = Math.floor(0x1_0000_0000 / bound) * bound;
    const buffer = new Uint32Array(new ArrayBuffer(4));
    for (;;) {
      const value = random(buffer)[0] ?? 0;
      if (value < limit) return value % bound;
    }
  };
  const first = pick(wordCount);
  let second = pick(wordCount - 1);
  if (second >= first) second += 1;
  return first < second ? [first, second] : [second, first];
}

/** Compara lo escrito con la palabra esperada, ignorando acentos, mayúsculas y espacios. */
export function matchesWord(typed: string, expected: string): boolean {
  return normalizeWord(typed) !== '' && normalizeWord(typed) === normalizeWord(expected);
}

/**
 * Como `matchesWord`, pero acepta también el prefijo que reconoce el seguimiento (basta con las
 * primeras 4 letras), para que confirmar y dar seguimiento funcionen igual.
 */
export function matchesReceiptWord(typed: string, expected: string): boolean {
  if (matchesWord(typed, expected)) return true;
  const resolved = resolvedWord(typed);
  return resolved !== null && matchesWord(resolved, expected);
}
