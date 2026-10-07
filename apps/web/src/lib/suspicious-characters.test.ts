// Pruebas del resumen de caracteres sospechosos: lo quitable y lo que queda para revisión.
import { describe, expect, it } from 'vitest';
import { summarizeSuspiciousCharacters } from './suspicious-characters.ts';

describe('summarizeSuspiciousCharacters', () => {
  it('cuenta como quitable lo invisible y la letra confundible que la limpieza cambia', () => {
    expect(summarizeSuspiciousCharacters('ca​sa la cаsa')).toEqual({
      count: 2,
      removable: 2,
      remaining: 0,
      stripped: 'casa la casa',
    });
  });

  it('deja para revisión lo que ninguna limpieza cambia', () => {
    // Letra modificadora, saltillo sin rasgos indígenas, «ː» tras una letra y una palabra cirílica.
    for (const text of ['paʼ la casa', 'contrato ꞌ de obra', 'el monto aː fue']) {
      expect(summarizeSuspiciousCharacters(text), text).toMatchObject({
        removable: 0,
        remaining: 1,
        stripped: text,
      });
    }
    const mixed = summarizeSuspiciousCharacters('pago​ a Иван');
    expect(mixed.removable).toBe(1);
    expect(mixed.remaining).toBe(mixed.count - 1);
    expect(mixed.remaining).toBeGreaterThan(0);
  });

  it('no encuentra nada en un texto normal', () => {
    expect(summarizeSuspiciousCharacters('el contrato de la empresa')).toMatchObject({
      count: 0,
      removable: 0,
      remaining: 0,
    });
  });
});
