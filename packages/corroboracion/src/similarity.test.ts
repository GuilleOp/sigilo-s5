// Pruebas del resumen difuso: estimación de similitud, relatos cortos y dependencia de la llave.
import { describe, expect, it } from 'vitest';
import { demoCase } from './demo-scenario.ts';
import { MIN_SHINGLES, estimateSimilarity, similarityDigest, textShingles } from './similarity.ts';

const KEY = new Uint8Array(32).fill(3);
const OTHER_KEY = new Uint8Array(32).fill(4);

function jaccard(left: string, right: string): number {
  const a = textShingles(left);
  const b = textShingles(right);
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function digest(text: string, key = KEY): Uint8Array {
  const result = similarityDigest(text, key);
  if (result === null) throw new Error('Relato demasiado corto.');
  return result;
}

describe('resumen difuso del relato', () => {
  const attack1 = demoCase('case.attack-1').narrative;
  const attack2 = demoCase('case.attack-2').narrative;
  const attack3 = demoCase('case.attack-3').narrative;
  const marta = demoCase('case.marta').narrative;
  const luis = demoCase('case.luis').narrative;

  it('mide 64 bytes y es determinista con la misma llave', () => {
    expect(digest(attack1)).toHaveLength(64);
    expect(digest(attack1)).toEqual(digest(attack1));
    expect(estimateSimilarity(digest(attack1), digest(attack1))).toBe(1);
  });

  it('estima la similitud de Jaccard de los fragmentos con error pequeño', () => {
    for (const [left, right] of [
      [attack1, attack2],
      [attack1, attack3],
      [marta, luis],
    ] as const) {
      const estimate = estimateSimilarity(digest(left), digest(right));
      expect(Math.abs(estimate - jaccard(left, right))).toBeLessThan(0.15);
    }
    expect(estimateSimilarity(digest(attack1), digest(attack2))).toBeGreaterThan(0.6);
    expect(estimateSimilarity(digest(marta), digest(luis))).toBeLessThan(0.4);
  });

  it('no compara resúmenes hechos con llaves distintas (otra etiqueta)', () => {
    expect(estimateSimilarity(digest(attack1), digest(attack1, OTHER_KEY))).toBeLessThan(0.3);
  });

  it('no manda resumen de un relato corto y valida tamaños', () => {
    expect(similarityDigest('Cobra comisiones.', KEY)).toBeNull();
    expect(textShingles('Cobra comisiones.').size).toBeLessThan(MIN_SHINGLES);
    expect(() => similarityDigest(attack1, new Uint8Array(8))).toThrow('32 bytes');
    expect(() => estimateSimilarity(new Uint8Array(8), new Uint8Array(64))).toThrow('64 bytes');
  });

  it('ignora acentos, mayúsculas y signos como @sigilo/anonimato', () => {
    const plain = attack1
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toUpperCase()
      .replace(/[.,]/gu, '');
    expect(digest(plain)).toEqual(digest(attack1));
  });
});
