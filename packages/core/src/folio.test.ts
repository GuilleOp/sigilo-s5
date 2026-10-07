// Pruebas de generación y validación de folios.
import { describe, expect, it } from 'vitest';
import { generateFolio, isFolio } from './folio.ts';

describe('folio', () => {
  it('genera folios válidos y distintos', () => {
    const folios = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const folio = generateFolio();
      expect(folio).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
      expect(isFolio(folio)).toBe(true);
      folios.add(folio);
    }
    expect(folios.size).toBe(1000);
  });

  it('rechaza formatos inválidos', () => {
    for (const invalid of ['0123-4567-89AI', '0123456789AB', '0123-4567-89ab', '', 12, null]) {
      expect(isFolio(invalid)).toBe(false);
    }
    expect(isFolio('0123-4567-89AB')).toBe(true);
  });
});
