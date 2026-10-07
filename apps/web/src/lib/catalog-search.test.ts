// Pruebas de la búsqueda local sobre los catálogos de contracts.
import { describe, expect, it } from 'vitest';
import { OFFENSES, STATES } from '@sigilo/contracts';
import { filterByQuery, foldForSearch } from './catalog-search.ts';

describe('filterByQuery', () => {
  it('ignora acentos, mayúsculas y orden de las palabras', () => {
    expect(foldForSearch('  Querétaro   Arteaga ')).toBe('queretaro arteaga');
    const found = filterByQuery(STATES, 'leon NUEVO', (state) => state.name);
    expect(found.map((state) => state.code)).toEqual(['19']);
  });

  it('devuelve todo con una consulta vacía', () => {
    expect(filterByQuery(STATES, '   ', (state) => state.name)).toHaveLength(32);
  });

  it('encuentra conductas por lo que pasó y por el término legal', () => {
    const textOf = (offense: (typeof OFFENSES)[number]) => `${offense.label} ${offense.hint}`;
    expect(filterByQuery(OFFENSES, 'cohecho', textOf).map((offense) => offense.code)).toContain(
      'LGRA-52',
    );
    expect(filterByQuery(OFFENSES, 'REGALOS dinero', textOf).length).toBeGreaterThan(0);
  });
});
