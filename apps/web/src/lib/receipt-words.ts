// Ayudas para escribir las 8 palabras del recibo sin guardar nada: autocompletado y pegado.
import { completeWord, normalizeWord, RECEIPT_WORD_COUNT } from '@sigilo/core';

/** Estado de una casilla de palabra. */
export type WordStatus =
  | { kind: 'empty' }
  | { kind: 'exact'; word: string }
  | { kind: 'unique'; word: string }
  | { kind: 'several'; options: string[] }
  | { kind: 'unknown' };

const MAX_OPTIONS = 6;

/**
 * Clasifica lo escrito: palabra exacta, prefijo con una sola coincidencia (con 4 letras siempre
 * hay una), varias opciones o ninguna. Ignora acentos y mayúsculas.
 */
export function wordStatus(typed: string): WordStatus {
  const normalized = normalizeWord(typed);
  if (normalized === '') return { kind: 'empty' };
  const matches = completeWord(normalized);
  const exact = matches.find((word) => normalizeWord(word) === normalized);
  if (exact !== undefined) return { kind: 'exact', word: exact };
  if (matches.length === 1 && matches[0] !== undefined) return { kind: 'unique', word: matches[0] };
  if (matches.length === 0) return { kind: 'unknown' };
  return { kind: 'several', options: matches.slice(0, MAX_OPTIONS) };
}

/** Palabra resuelta para enviar, o `null` si todavía no se reconoce. */
export function resolvedWord(typed: string): string | null {
  const status = wordStatus(typed);
  return status.kind === 'exact' || status.kind === 'unique' ? status.word : null;
}

/**
 * Si la persona pega varias palabras en una casilla, las reparte desde esa posición.
 * Devuelve `null` si lo pegado es una sola palabra.
 */
export function distributePastedWords(
  current: readonly string[],
  position: number,
  pasted: string,
): string[] | null {
  const parts = pasted
    .split(/[\s,.;:]+/u)
    .map((part) => part.replace(/^\d+[).-]?/u, ''))
    .filter(Boolean);
  if (parts.length < 2) return null;
  const next = [...current];
  while (next.length < RECEIPT_WORD_COUNT) next.push('');
  parts.slice(0, RECEIPT_WORD_COUNT - position).forEach((part, offset) => {
    next[position + offset] = part;
  });
  return next;
}
