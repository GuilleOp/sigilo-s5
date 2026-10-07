// Pruebas de la búsqueda local y de la integridad de los catálogos.
import { describe, expect, it } from 'vitest';
import {
  filterByQuery,
  findOffense,
  foldForSearch,
  municipalitiesOf,
  municipalityName,
  stateName,
} from './catalog-search.ts';
import { OFFENSES } from './offenses.ts';
import { PUBLIC_ENTITIES } from './public-entities.ts';
import { STATES } from './states.ts';

describe('catálogos', () => {
  it('tiene las 32 entidades con claves únicas de 01 a 32', () => {
    expect(STATES.map((state) => state.code)).toEqual(
      Array.from({ length: 32 }, (_, index) => String(index + 1).padStart(2, '0')),
    );
  });

  it('tiene los 18 municipios de Querétaro y ninguno para otras entidades', () => {
    const queretaro = municipalitiesOf('22');
    expect(queretaro).toHaveLength(18);
    expect(new Set(queretaro.map((item) => item.code)).size).toBe(18);
    expect(municipalitiesOf('09')).toEqual([]);
    expect(municipalityName('22', '014')).toBe('Querétaro');
  });

  it('usa claves únicas en conductas y entes, y solo entes de Villa Ejemplo o ficticios', () => {
    expect(new Set(OFFENSES.map((item) => item.code)).size).toBe(OFFENSES.length);
    expect(new Set(PUBLIC_ENTITIES.map((item) => item.id)).size).toBe(PUBLIC_ENTITIES.length);
    for (const entity of PUBLIC_ENTITIES) {
      expect(entity.name).toMatch(/Villa Ejemplo|Fictici|Otro ente/u);
    }
    expect(findOffense('LGRA-52')?.name).toBe('Cohecho');
    expect(stateName('22')).toBe('Querétaro');
  });
});

describe('filterByQuery', () => {
  it('ignora acentos, mayúsculas y orden de las palabras', () => {
    expect(foldForSearch('  Querétaro   Arteaga ')).toBe('queretaro arteaga');
    const found = filterByQuery(STATES, 'leon NUEVO', (state) => state.name);
    expect(found.map((state) => state.code)).toEqual(['19']);
  });

  it('devuelve todo con una consulta vacía', () => {
    expect(filterByQuery(STATES, '   ', (state) => state.name)).toHaveLength(32);
  });
});
