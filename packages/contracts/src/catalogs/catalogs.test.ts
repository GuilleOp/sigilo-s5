// Pruebas de los catálogos: tamaños, claves únicas, búsquedas y etiquetas de lectura fácil.
import { describe, expect, it } from 'vitest';
import {
  MUNICIPALITIES,
  OFFENSE_SITUATIONS,
  OFFENSES,
  PUBLIC_ENTITIES,
  STATES,
  findEntity,
  findMunicipality,
  findOffense,
  findState,
  isEntityId,
  isMunicipalityOf,
  isOffenseCode,
  isStateCode,
  municipalitiesOf,
  offenseReference,
} from './index.ts';

/** Las 31 claves del catálogo anterior: ninguna se pierde al quitar duplicados. */
const LEGACY_OFFENSE_CODES = [
  ...[49, 50, 52, 53, 54, 55, 57, 58, 59, 60, 61, 62, 63, 64].map((n) => `LGRA-${n}`),
  ...[66, 67, 68, 69, 70, 71, 72].map((n) => `LGRA-${n}`),
  ...[214, 215, 217, 218, 219, 220, 221, 222, 223, 224].map((n) => `CPF-${n}`),
];

describe('entidades y municipios', () => {
  it('incluye las 32 entidades y los 18 municipios de Querétaro con claves únicas', () => {
    expect(STATES).toHaveLength(32);
    expect(new Set(STATES.map((state) => state.code)).size).toBe(32);
    expect(MUNICIPALITIES).toHaveLength(18);
    expect(municipalitiesOf('22')).toHaveLength(18);
    expect(municipalitiesOf('09')).toEqual([]);
  });

  it('busca por clave y valida la pertenencia del municipio a la entidad', () => {
    expect(findState('22')?.name).toBe('Querétaro');
    expect(isStateCode('22')).toBe(true);
    expect(isStateCode('33')).toBe(false);
    expect(isStateCode('Juan Perez es corrupto')).toBe(false);
    expect(findMunicipality('22', '014')?.name).toBe('Querétaro');
    expect(isMunicipalityOf('22', '016')).toBe(true);
    expect(isMunicipalityOf('09', '016')).toBe(false);
    expect(isMunicipalityOf('22', '019')).toBe(false);
  });
});

describe('entes públicos sintéticos', () => {
  it('tiene identificadores únicos y busca por identificador', () => {
    expect(new Set(PUBLIC_ENTITIES.map((entity) => entity.id)).size).toBe(PUBLIC_ENTITIES.length);
    expect(findEntity('VE-OBRAS')?.level).toBe('municipal');
    expect(isEntityId('VE-OBRAS')).toBe(true);
    expect(isEntityId('ente-real')).toBe(false);
  });
});

describe('conductas', () => {
  it('conserva todas las claves anteriores como principales o equivalentes', () => {
    for (const code of LEGACY_OFFENSE_CODES) expect(isOffenseCode(code), code).toBe(true);
    const all = OFFENSES.flatMap((offense) => [offense.code, ...offense.equivalentCodes]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual([...LEGACY_OFFENSE_CODES].sort());
  });

  it('no repite etiquetas visibles y resuelve las equivalentes a su conducta', () => {
    const labels = OFFENSES.map((offense) => offense.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(findOffense('CPF-222')).toBe(findOffense('LGRA-52'));
    expect(findOffense('LGRA-52')?.label).toBe('Pedir o aceptar dinero o regalos (cohecho)');
    expect(findOffense('LGRA-99')).toBeUndefined();
  });

  it('escribe primero lo que pasó y el término legal entre paréntesis', () => {
    for (const offense of OFFENSES) {
      expect(offense.label.endsWith(`(${offense.legalTerm})`), offense.code).toBe(true);
      expect(offense.hint.length).toBeGreaterThan(10);
    }
  });

  it('agrupa por situaciones conocidas y sin grupos vacíos', () => {
    const situations = OFFENSE_SITUATIONS.map((item) => item.situation);
    for (const offense of OFFENSES) expect(situations).toContain(offense.situation);
    for (const situation of situations) {
      expect(OFFENSES.some((offense) => offense.situation === situation)).toBe(true);
    }
  });

  it('extrae ley y artículo solo de claves del catálogo', () => {
    expect(offenseReference('CPF-222')).toEqual({ law: 'CPF', article: '222' });
    expect(offenseReference('LGRA-52')).toEqual({ law: 'LGRA', article: '52' });
    expect(offenseReference('LGRA-1')).toBeUndefined();
  });
});
