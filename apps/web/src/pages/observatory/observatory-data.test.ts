// Pruebas del observatorio: la matriz real del repositorio se resume por entidad, el Estado Ejemplo
// queda sin cobertura y los CSV conservan la línea base del escenario.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authorityIndicatorsCsv,
  DEMO_AUTHORITY_INDICATORS,
  DEMO_OUTCOMES,
  describePeriods,
  outcomesCsv,
  percent,
  summarizeCoverage,
} from './observatory-data.ts';

const MATRIX = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../../../datos/cobertura/matriz.json'), 'utf8'),
) as unknown;

describe('observatorio', () => {
  it('resume la matriz por entidad y agrega el Estado Ejemplo sin cobertura', () => {
    const rows = summarizeCoverage(MATRIX);
    expect(rows[0]?.stateCode).toBe('00');
    expect(rows.length).toBe(34);
    const example = rows.at(-1);
    expect(example?.isSynthetic).toBe(true);
    expect(Object.values(example?.periods ?? {}).every((periods) => periods.length === 0)).toBe(
      true,
    );
    expect(describePeriods([])).toBe('Sin cobertura');
    expect(describePeriods(['2022', '2020', '2021'])).toBe('2020 a 2022');
  });

  it('rechaza una matriz sin filas', () => {
    expect(() => summarizeCoverage({ version: 1 })).toThrow();
  });

  it('conserva la línea base del escenario en los CSV', () => {
    const csv = authorityIndicatorsCsv(DEMO_AUTHORITY_INDICATORS);
    expect(csv).toContain('authority.oic-iffe');
    expect(csv.split('\n')[1]).toContain(',60,45,75,15,31,2,0,1,1');
    expect(outcomesCsv(DEMO_OUTCOMES)).toContain('insufficient-evidence');
    expect(DEMO_OUTCOMES.reduce((total, row) => total + row.count, 0)).toBe(210);
    expect(percent(1, 0)).toBe(0);
  });
});
