// Pruebas de la frase del recibo: codificación de 11 bits, normalización y autocompletado.
import { describe, expect, it } from 'vitest';
import { wordlist } from '@scure/bip39/wordlists/spanish.js';
import { toHex } from './encoding.ts';
import {
  RECEIPT_WORD_COUNT,
  ReceiptPhraseError,
  completeWord,
  generateReceiptPhrase,
  normalizeWord,
  phraseToEntropy,
} from './receipt-phrase.ts';

const FIXED_ENTROPY = '000102030405060708090a';
const FIXED_WORDS = ['ábaco', 'álbum', 'líquido', 'álbum', 'espuma', 'acudir', 'bolero', 'bosque'];

describe('generateReceiptPhrase', () => {
  it('produce 8 palabras y 11 bytes coherentes entre sí', () => {
    const { words, entropy } = generateReceiptPhrase();
    expect(RECEIPT_WORD_COUNT).toBe(8);
    expect(words).toHaveLength(RECEIPT_WORD_COUNT);
    expect(entropy).toHaveLength(11);
    expect(phraseToEntropy(words)).toEqual(entropy);
    for (const word of words) expect(word).toBe(word.normalize('NFC'));
  });

  it('produce frases distintas', () => {
    expect(generateReceiptPhrase().entropy).not.toEqual(generateReceiptPhrase().entropy);
  });
});

describe('phraseToEntropy', () => {
  it('fija el vector de regresión', () => {
    expect(toHex(phraseToEntropy(FIXED_WORDS))).toBe(FIXED_ENTROPY);
  });

  it('cubre los extremos de la lista', () => {
    expect(toHex(phraseToEntropy(Array<string>(8).fill('ábaco')))).toBe('00'.repeat(11));
    expect(toHex(phraseToEntropy(Array<string>(8).fill('zurdo')))).toBe('ff'.repeat(11));
  });

  it('ignora acentos, mayúsculas, espacios y forma Unicode', () => {
    const variants = [
      'ABACO',
      ' Album ',
      'liquido',
      'Álbum',
      'ESPUMA',
      'acudir',
      'Bolero',
      'bosque',
    ];
    expect(toHex(phraseToEntropy(variants))).toBe(FIXED_ENTROPY);
  });

  it('lanza error claro sin revelar la palabra', () => {
    expect(() => phraseToEntropy(FIXED_WORDS.slice(0, 7))).toThrow('debe tener 8 palabras');
    const wrong = [...FIXED_WORDS];
    wrong[2] = 'secretoinventado';
    expect(() => phraseToEntropy(wrong)).toThrow('La palabra 3 del recibo no está en la lista.');
    try {
      phraseToEntropy(wrong);
    } catch (error) {
      expect(String(error)).not.toContain('secretoinventado');
    }
  });

  it('lanza ReceiptPhraseError con la posición de la palabra o nula si faltan palabras', () => {
    const wrong = [...FIXED_WORDS];
    wrong[5] = 'zzzz';
    const failure = (): unknown => {
      try {
        phraseToEntropy(wrong);
      } catch (error) {
        return error;
      }
      return null;
    };
    const error = failure();
    expect(error).toBeInstanceOf(ReceiptPhraseError);
    expect((error as ReceiptPhraseError).position).toBe(6);
    expect((error as ReceiptPhraseError).name).toBe('ReceiptPhraseError');
    expect(() => phraseToEntropy([])).toThrow(ReceiptPhraseError);
    try {
      phraseToEntropy([]);
    } catch (countError) {
      expect((countError as ReceiptPhraseError).position).toBeNull();
    }
  });
});

describe('normalizeWord', () => {
  it('quita diacríticos, recorta y pasa a minúsculas', () => {
    expect(normalizeWord('  ÁRBOL ')).toBe('arbol');
    expect(normalizeWord('Niño')).toBe('nino');
    expect(normalizeWord('pingüino')).toBe('pinguino');
  });
});

describe('completeWord', () => {
  it('sugiere palabras con acentos a partir del prefijo normalizado', () => {
    expect(completeWord('ABAC')).toEqual(['ábaco']);
    expect(completeWord('liqu')).toEqual(['líquido']);
    expect(completeWord('ab').length).toBeGreaterThan(1);
  });

  it('no sugiere nada con prefijo vacío o inexistente', () => {
    expect(completeWord('')).toEqual([]);
    expect(completeWord('   ')).toEqual([]);
    expect(completeWord('qqqq')).toEqual([]);
  });

  it('cuatro letras bastan para identificar cualquier palabra de 4 letras o más', () => {
    for (const word of wordlist) {
      const normalized = normalizeWord(word);
      if (normalized.length < 4) continue;
      expect(completeWord(normalized.slice(0, 4))).toEqual([word.normalize('NFC')]);
    }
  });
});
