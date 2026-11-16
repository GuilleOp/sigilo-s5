// Pruebas de la competencia por dependencia: quién investiga a cada ente según la tabla de su
// nodo (formato 2), el distintivo, la cobertura por estado, la agrupación de los entes y el CSV.
import { describe, expect, it } from 'vitest';
import type { FunctionTable } from '@sigilo/contracts';
import {
  badgeOf,
  competenceCoverage,
  entityCompetence,
  entityGroupOf,
  isLawfulGeneralHolder,
  oicCandidates,
  oicCoverageRows,
} from './competence.ts';
import { csvToEntities, entitiesToCsv, parseCsv } from './competence-csv.ts';
import { QUERETARO_NAMES } from './demo-queretaro.ts';
import { functionTableFor } from './function-table.ts';
import { FIXTURE_DAY, createNetworkFixture } from './test-fixtures.ts';

const { directory } = createNetworkFixture().signed;

function tableOf(stateCode: string | null): FunctionTable {
  const table = functionTableFor(directory, stateCode);
  if (table === undefined) throw new Error('sin tabla');
  return table;
}

describe('competencia de cada ente', () => {
  const queretaro = tableOf('22');
  const of = (id: string, level: 'estatal' | 'municipal') =>
    entityCompetence(directory, queretaro, { id, level }, FIXTURE_DAY);

  it('OIC con llaves, nombrado sin alta, pendiente y «sin OIC designado»', () => {
    expect(of('PDN-22-7283', 'municipal')).toMatchObject({
      source: 'entity',
      status: 'assigned',
      holderName: QUERETARO_NAMES.oicMunicipioQueretaro,
      badge: 'keys',
    });
    expect(of('PDN-22-7206', 'estatal')).toMatchObject({
      status: 'assigned',
      holderName: QUERETARO_NAMES.oicUaq,
      badge: 'named',
    });
    expect(of('PDN-22-7232', 'estatal')).toMatchObject({
      status: 'pending',
      holder: null,
      badge: 'pending',
    });
    expect(of('PDN-22-7176', 'estatal')).toMatchObject({
      status: 'without_oic',
      holderName: QUERETARO_NAMES.contraloria,
      badge: 'keys',
    });
  });

  it('una regla general cubre al ente estatal, nunca al municipal (CPEUM art. 109 fr. III)', () => {
    expect(of('VE-FINANZAS', 'estatal')).toMatchObject({ source: 'general', badge: 'keys' });
    expect(of('VE-OBRAS', 'municipal')).toMatchObject({ source: 'none', status: 'pending' });
    expect(
      isLawfulGeneralHolder(
        directory,
        { kind: 'authority', authorityId: 'authority.comptroller-queretaro' },
        'municipal',
      ),
    ).toBe(false);
    expect(
      isLawfulGeneralHolder(
        directory,
        { kind: 'authority', authorityId: 'authority.oic-el-marques' },
        'municipal',
      ),
    ).toBe(true);
  });

  it('llaves vencidas: el OIC pasa a «nombrado, falta alta»', () => {
    const holder = { kind: 'authority', authorityId: 'authority.oic-cea-queretaro' } as const;
    expect(badgeOf(directory, holder, FIXTURE_DAY)).toBe('keys');
    expect(badgeOf(directory, holder, '2026-01-01')).toBe('named');
    expect(badgeOf(directory, null, FIXTURE_DAY)).toBe('pending');
  });

  it('solo las investigadoras del nodo y la entidad pueden ser OIC', () => {
    const ids = oicCandidates(directory, queretaro).map((item) => item.id);
    expect(ids).toContain('authority.oic-municipio-queretaro');
    expect(ids).toContain('authority.comptroller-queretaro');
    expect(ids).not.toContain('authority.buzon-queretaro');
    expect(ids).not.toContain('authority.comptroller-oaxaca');
    expect(oicCandidates(directory, tableOf(null)).map((item) => item.id)).toContain(
      'authority.oic-iffe',
    );
  });
});

describe('cobertura por estado', () => {
  it('cuenta cada dependencia una sola vez y saca el porcentaje', () => {
    const entities = [
      { id: 'PDN-22-7283', level: 'municipal' },
      { id: 'PDN-22-7206', level: 'estatal' },
      { id: 'PDN-22-7232', level: 'estatal' },
      { id: 'PDN-22-7176', level: 'estatal' },
    ] as const;
    const coverage = competenceCoverage(directory, tableOf('22'), entities, FIXTURE_DAY);
    expect(coverage).toEqual({
      stateCode: '22',
      tableVersion: 1,
      total: 4,
      withOic: 2,
      withoutOic: 1,
      general: 0,
      withKeys: 2,
      pending: 1,
    });
    const rows = oicCoverageRows(directory, (code) => (code === '22' ? entities : []), FIXTURE_DAY);
    expect(rows.map((row) => row.nodeId)).toEqual([
      'node.queretaro',
      'node.federal',
      'node.oaxaca',
    ]);
    expect(rows[0]).toMatchObject({ percentWithOic: 50, percentWithKeys: 50, percentPending: 25 });
    expect(rows[1]).toMatchObject({ stateCode: null, total: 0, percentWithOic: 0 });
  });
});

describe('grupos de la pantalla', () => {
  it('centralizada, paraestatal, autónomos y cada municipio, en estados y en la federación', () => {
    const group = (name: string, level: 'federal' | 'estatal' | 'municipal', town?: string) =>
      entityGroupOf(
        { name, level, ...(town === undefined ? {} : { municipalityCode: town }) },
        (code) => (code === '014' ? 'Querétaro' : undefined),
      ).key;
    expect(group('Secretaría de Finanzas', 'estatal')).toBe('centralizada');
    expect(group('Secretaría Ejecutiva del Sistema Estatal Anticorrupción', 'estatal')).toBe(
      'paraestatal',
    );
    expect(group('Comisión Estatal de Aguas', 'estatal')).toBe('paraestatal');
    expect(group('Tribunal Superior de Justicia', 'estatal')).toBe('autonomo');
    expect(group('Universidad Autonoma de Querétaro', 'estatal')).toBe('autonomo');
    expect(group('Banco de México', 'federal')).toBe('autonomo');
    expect(group('Instituto Mexicano del Seguro Social', 'federal')).toBe('paraestatal');
    expect(group('Secretaría Anticorrupción y Buen Gobierno', 'federal')).toBe('centralizada');
    expect(
      entityGroupOf(
        { name: 'Instituto Municipal', level: 'municipal', municipalityCode: '014' },
        () => 'Querétaro',
      ),
    ).toEqual({ key: 'municipio:014', label: 'Municipio de Querétaro' });
    expect(group('DIF', 'municipal')).toBe('municipal');
  });
});

describe('CSV de la competencia por dependencia', () => {
  it('va y vuelve sin cambios, y protege las celdas que parecen fórmulas', () => {
    const entities = tableOf('22').entities ?? [];
    const text = entitiesToCsv(entities, (id) => (id === 'PDN-22-7232' ? '=Fiscalía' : ''));
    expect(text.split('\n')[0]).toBe('ente,nombre,estado,quien,fundamento,solo_identificada');
    expect(text).toContain("'=Fiscalía");
    const back = csvToEntities(text);
    expect(back.problems).toEqual([]);
    expect(back.entities).toEqual(entities);
  });

  it('dice la línea de cada problema', () => {
    const header = 'ente,nombre,estado,quien,fundamento,solo_identificada';
    const { entities, problems } = csvToEntities(
      [
        header,
        'PDN-22-1,,asignado,,,',
        'PDN-22-2,,sin_oic,institucion:Contraloría Ficticia,,',
        'PDN-22-3,,otro,,,',
        'PDN-22-4,,pendiente,,,',
        'PDN-22-4,,pendiente,,,',
      ].join('\n'),
    );
    expect(entities).toBeNull();
    expect(problems).toEqual([
      'Línea 2: Falta quién atiende al ente.',
      'Línea 3: «Sin OIC designado» exige su fundamento.',
      'Línea 4: el estado debe ser asignado, sin_oic o pendiente.',
      'Línea 6: el ente PDN-22-4 ya está en otra línea.',
    ]);
    expect(csvToEntities('a,b\n').problems[0]).toContain('La primera línea debe ser');
    expect(parseCsv('"a,""b""",c\r\n')).toEqual([['a,"b"', 'c']]);
  });
});
