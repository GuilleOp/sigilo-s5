// Frase del recibo: 88 bits aleatorios como 8 palabras de la lista BIP39 en español (11 bits cada una).
import { wordlist } from '@scure/bip39/wordlists/spanish.js';
import { randomBytes } from './random.ts';

/** Número de palabras de la frase del recibo. */
export const RECEIPT_WORD_COUNT = 8;

const BITS_PER_WORD = 11;
const ENTROPY_BYTES = (RECEIPT_WORD_COUNT * BITS_PER_WORD) / 8;

/** Palabras en forma NFC para mostrarlas; la lista original está en NFD. */
const DISPLAY_WORDS: readonly string[] = wordlist.map((word) => word.normalize('NFC'));

/**
 * Normaliza una palabra para compararla: NFD, sin diacríticos, minúsculas y sin espacios
 * alrededor. En la lista española la forma normalizada sigue siendo única.
 */
export function normalizeWord(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const NORMALIZED_WORDS: readonly string[] = wordlist.map(normalizeWord);
const WORD_INDEX: ReadonlyMap<string, number> = new Map(
  NORMALIZED_WORDS.map((word, index) => [word, index]),
);

function entropyToWords(entropy: Uint8Array): string[] {
  const words: string[] = [];
  let buffer = 0;
  let bits = 0;
  for (const byte of entropy) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    if (bits >= BITS_PER_WORD) {
      bits -= BITS_PER_WORD;
      words.push(DISPLAY_WORDS[(buffer >> bits) & 0x7ff] ?? '');
      buffer &= (1 << bits) - 1;
    }
  }
  return words;
}

/**
 * Genera una frase de recibo nueva con su entropía (11 bytes).
 * Seguridad: la entropía es el único secreto del que derivan todas las llaves de la persona denunciante.
 */
export function generateReceiptPhrase(): { words: string[]; entropy: Uint8Array } {
  const entropy = randomBytes(ENTROPY_BYTES);
  return { words: entropyToWords(entropy), entropy };
}

/**
 * Recupera la entropía (11 bytes) a partir de las 8 palabras, ignorando acentos y mayúsculas.
 * Lanza error si el número de palabras es incorrecto o alguna palabra no está en la lista.
 */
export function phraseToEntropy(words: readonly string[]): Uint8Array {
  if (words.length !== RECEIPT_WORD_COUNT) {
    throw new Error(`La frase del recibo debe tener ${RECEIPT_WORD_COUNT} palabras.`);
  }
  const entropy = new Uint8Array(ENTROPY_BYTES);
  let buffer = 0;
  let bits = 0;
  let position = 0;
  words.forEach((word, wordPosition) => {
    const index = WORD_INDEX.get(normalizeWord(word));
    if (index === undefined) {
      // Seguridad: el mensaje indica la posición, nunca la palabra, porque forma parte del secreto.
      throw new Error(`La palabra ${wordPosition + 1} del recibo no está en la lista.`);
    }
    buffer = (buffer << BITS_PER_WORD) | index;
    bits += BITS_PER_WORD;
    while (bits >= 8) {
      bits -= 8;
      entropy[position] = (buffer >> bits) & 0xff;
      position += 1;
    }
    buffer &= (1 << bits) - 1;
  });
  return entropy;
}

/**
 * Devuelve las palabras de la lista (con acentos) que empiezan con el prefijo normalizado.
 * Con un prefijo vacío no sugiere nada; con 4 letras la coincidencia es única.
 */
export function completeWord(prefix: string): string[] {
  const normalized = normalizeWord(prefix);
  if (normalized === '') return [];
  const matches: string[] = [];
  NORMALIZED_WORDS.forEach((word, index) => {
    if (word.startsWith(normalized)) matches.push(DISPLAY_WORDS[index] ?? '');
  });
  return matches;
}
