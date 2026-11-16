// Pistas de la competencia por dependencia: S1 por ente en cubeta, marca de contratación (S2) y la
// nota de que el S3 no está por ente; sin fragmento del S1, todo es «sin datos».
import { describe, expect, it } from 'vitest';
import { competenceHintsFor } from './competence-hints.ts';
import type { CoverageMatrixRow } from './competence-hints.ts';
import { parseAnonymityFragment } from './fragment.ts';

const FRAGMENT = parseAnonymityFragment({
  version: 1,
  entidad: { clave: '14', nombre: 'Jalisco' },
  k: 10,
  cubetas: ['1-4', '5-9', '10-49', '50+'],
  ventanas: [{ proveedor: 'Jalisco', desde: '2024-09-27', hasta: '2026-09-27' }],
  cubetaEntidad: 3,
  formato: {},
  grupos: [],
  entes: [
    ['AGENCIA DE ENERGÍA DEL ESTADO DE JALISCO', 2, 'E', 1, -1, []],
    ['Agencia de Energia del Estado de Jalisco', 1, 'E', 0, -1, []],
    ['SECRETARIA DE CULTURA', 3, 'E', 0, -1, []],
  ],
});

const COVERAGE: CoverageMatrixRow[] = [
  {
    entidadClave: '14',
    sistema: 'S3S',
    periodo: 'total',
    hayDatos: true,
    registros: null,
    registrosRango: '3546-3549',
  },
  {
    entidadClave: '22',
    sistema: 'S2',
    periodo: 'total',
    hayDatos: true,
    registros: null,
    registrosRango: '282-285',
  },
];

describe('pistas de la competencia por dependencia', () => {
  it('encuentra el ente por su nombre normalizado y toma la cubeta menor', () => {
    const hints = competenceHintsFor(
      '14',
      [
        { id: 'PDN-14-2980', name: 'Agencia de Energía del Estado de Jalisco' },
        {
          id: 'PDN-14-9',
          name: 'Secretaría de Cultura del Estado',
          sourceName: 'SECRETARÍA DE CULTURA',
        },
        { id: 'PDN-14-10', name: 'Ente que no aparece' },
      ],
      FRAGMENT,
      '2026-10-07',
      COVERAGE,
    );
    expect(hints.entes).toEqual({ 'PDN-14-2980': ['5-9', 0], 'PDN-14-9': ['50+', 0] });
    expect(hints.fuentes.s1).toEqual({ disponible: true, fechaCorte: '2026-10-07' });
    expect(hints.fuentes.s3.porEnte).toBe(false);
    expect(hints.fuentes.s3.nota).toContain('3546-3549 registros');
  });

  it('sin fragmento del S1 no hay pistas por ente y lo dice', () => {
    const hints = competenceHintsFor('22', [{ id: 'PDN-22-1', name: 'X' }], null, null, COVERAGE);
    expect(hints.entes).toEqual({});
    expect(hints.fuentes.s1.disponible).toBe(false);
    expect(hints.fuentes.s2.nota).toContain('282-285 registros');
    expect(hints.fuentes.s3.nota).toContain('no tiene datos');
  });
});
