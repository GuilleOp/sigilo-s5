// Pruebas de la lista compartida de meses.
import { describe, expect, it } from 'vitest';
import { SPANISH_MONTHS } from './months.ts';

describe('SPANISH_MONTHS', () => {
  it('tiene los doce meses en orden y en minúsculas', () => {
    expect(SPANISH_MONTHS).toHaveLength(12);
    expect(SPANISH_MONTHS[0]).toBe('enero');
    expect(SPANISH_MONTHS[8]).toBe('septiembre');
    expect(SPANISH_MONTHS[11]).toBe('diciembre');
    for (const month of SPANISH_MONTHS) expect(month).toBe(month.toLowerCase());
  });
});
