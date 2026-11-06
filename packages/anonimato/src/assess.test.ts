// Pruebas de la evaluación del grupo de anonimato con fragmentos sintéticos (Villa Ejemplo, IFFE).
import { describe, expect, it } from 'vitest';
import {
  assessAnonymityGroup,
  describeAssessment,
  formatSpanishDate,
  listAreas,
  listEntes,
} from './assess.ts';
import type { AnonymityAssessment } from './assess.ts';
import { DEMO_FEDERAL_FRAGMENT, DEMO_STATE_FRAGMENT } from './demo-fragment.ts';
import { parseAnonymityFragment } from './fragment.ts';
import type { AnonymityData } from './loader.ts';

const state: AnonymityData = {
  kind: 'fragment',
  fragment: parseAnonymityFragment(DEMO_STATE_FRAGMENT),
  cutoffDate: '2026-10-07',
};
const federal: AnonymityData = {
  kind: 'fragment',
  fragment: parseAnonymityFragment(DEMO_FEDERAL_FRAGMENT),
  cutoffDate: '2026-10-07',
};

const ALARMIST = /peligro|grave|urgente|alerta|¡/iu;

function allText(result: AnonymityAssessment): string {
  return describeAssessment(result);
}

describe('assessAnonymityGroup', () => {
  it('encuentra el área con otra escritura (misma normalización que datos/proceso)', () => {
    const result = assessAnonymityGroup(state, {
      ente: 'Ayuntamiento de Villa Ejemplo',
      area: 'Dir. de Obras Publicas',
    });
    expect(result).toMatchObject({
      level: 'area',
      bucket: '50+',
      risk: 'low',
      isContracting: false,
      groupName: 'Dirección de Obras Públicas',
    });
    expect(result.actions.map((action) => action.kind)).toEqual(['generalize-narrative']);
  });

  it('marca el área de contrataciones y da riesgo medio en 10-49', () => {
    const result = assessAnonymityGroup(state, {
      ente: 'H. Ayuntamiento de Villa Ejemplo',
      area: 'Departamento de Compras',
    });
    expect(result).toMatchObject({
      level: 'area',
      bucket: '10-49',
      risk: 'medium',
      isContracting: true,
    });
    expect(result.reasons.join(' ')).toMatch(/contrataciones \(S2\)/u);
    expect(result.actions.map((action) => action.kind)).toEqual([
      'generalize-narrative',
      'defer-submission',
    ]);
  });

  it('sin área usa el ente y avisa que el relato puede reducir el grupo', () => {
    const result = assessAnonymityGroup(state, { ente: 'Secretaría de Finanzas Estatal Ficticia' });
    expect(result).toMatchObject({
      level: 'ente',
      bucket: '50+',
      risk: 'low',
      isAreaUnlisted: false,
    });
    expect(result.reasons.join(' ')).toMatch(/No indicaste tu área/u);
  });

  it('un área que no aparece en un ente mediano da riesgo alto (caso de Marta)', () => {
    const result = assessAnonymityGroup(federal, {
      ente: 'Instituto Federal Ficticio de Equipamiento',
      area: 'Departamento de Compras',
    });
    expect(result).toMatchObject({
      level: 'ente',
      bucket: '10-49',
      risk: 'high',
      isAreaUnlisted: true,
      isContracting: true,
    });
    expect(result.actions.map((action) => action.kind)).toEqual([
      'generalize-narrative',
      'defer-submission',
      'consider-custody',
    ]);
  });

  it('un área que no aparece en un ente grande da riesgo medio', () => {
    const result = assessAnonymityGroup(state, {
      ente: 'H. Ayuntamiento de Villa Ejemplo',
      area: 'Oficina inexistente',
    });
    expect(result).toMatchObject({
      level: 'ente',
      bucket: '50+',
      risk: 'medium',
      isAreaUnlisted: true,
    });
  });

  it('un ente pequeño se generaliza al orden de gobierno y da riesgo alto', () => {
    const result = assessAnonymityGroup(state, { ente: 'Registro Civil de Villa Ejemplo' });
    expect(result).toMatchObject({
      level: 'government-order',
      bucket: '10-49',
      risk: 'high',
      groupName: 'Otros entes municipales de Morelos',
    });
    const unprotected = assessAnonymityGroup(state, {
      ente: 'Instituto de Movilidad Estatal Ficticio',
    });
    expect(unprotected).toMatchObject({ level: 'government-order', risk: 'high' });
    expect(unprotected.reasons.join(' ')).toMatch(/Incluso el grupo/u);
  });

  it('un ente que no está en el fragmento es riesgo desconocido, nunca bajo', () => {
    const result = assessAnonymityGroup(state, { ente: 'Ente Ficticio Inexistente' });
    expect(result).toMatchObject({
      level: 'none',
      bucket: null,
      risk: 'unknown',
      isContracting: null,
    });
    expect(result.reasons.join(' ')).toMatch(/Por precaución/u);
  });

  it('sin datos de la entidad lo dice con honestidad', () => {
    const result = assessAnonymityGroup(
      { kind: 'no-data', stateCode: '22', stateName: 'Querétaro', cutoffDate: '2026-10-07' },
      { ente: 'Secretaría de Finanzas Estatal Ficticia', area: 'Compras' },
    );
    expect(result).toMatchObject({
      level: 'none',
      risk: 'unknown',
      title: 'No sabemos qué tan grande es tu grupo',
    });
    expect(result.reasons[0]).toMatch(/No tenemos datos de declaraciones públicas de Querétaro/u);
    expect(result.reasons[1]).toMatch(/Por precaución/u);
  });

  it('los textos no son alarmistas y citan la fecha de los datos', () => {
    const cases = [
      assessAnonymityGroup(state, { ente: 'Registro Civil de Villa Ejemplo' }),
      assessAnonymityGroup(federal, {
        ente: 'Instituto Federal Ficticio de Equipamiento',
        area: 'Compras',
      }),
      assessAnonymityGroup(state, { ente: 'Nadie' }),
    ];
    for (const result of cases) expect(allText(result)).not.toMatch(ALARMIST);
    expect(allText(cases[0] as AnonymityAssessment)).toMatch(/7 de octubre de 2026/u);
  });
});

describe('listas y fechas', () => {
  it('lista entes y áreas publicadas en orden alfabético', () => {
    const fragment = parseAnonymityFragment(DEMO_STATE_FRAGMENT);
    expect(listEntes(fragment)[0]).toBe('H. Ayuntamiento de Villa Ejemplo');
    expect(listAreas(fragment, 'Ayuntamiento de Villa Ejemplo')).toEqual([
      '070 Departamento de Compras',
      'Dirección de Obras Públicas',
    ]);
    expect(listAreas(fragment, 'Nadie')).toEqual([]);
  });

  it('formatea fechas en español', () => {
    expect(formatSpanishDate('2023-01-31')).toBe('31 de enero de 2023');
    expect(formatSpanishDate('sin fecha')).toBe('sin fecha');
  });
});
