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
  offenseActor,
  UNCLASSIFIED_OFFENSE_CODE,
  offenseReference,
  offenseSeverity,
  primaryOffenseCode,
} from './index.ts';

/** Las 31 claves del catálogo anterior: ninguna se pierde al quitar duplicados. */
const LEGACY_OFFENSE_CODES = [
  ...[49, 50, 52, 53, 54, 55, 57, 58, 59, 60, 61, 62, 63, 64].map((n) => `LGRA-${n}`),
  ...[66, 67, 68, 69, 70, 71, 72].map((n) => `LGRA-${n}`),
  ...[214, 215, 217, 218, 219, 220, 221, 222, 223, 224].map((n) => `CPF-${n}`),
];

/** Claves agregadas para alinear la lista federal con el catálogo de faltas del S5. */
const ADDED_OFFENSE_CODES = [
  'LGRA-60-BIS',
  'LGRA-63-BIS',
  'CPF-216',
  'CPF-217-BIS',
  'CPF-217-TER',
  'CPF-222-BIS',
  'LGRA-64-BIS',
  'LGRA-64-TER',
  'LGRA-64-QUATER',
  'LGRA-73',
  'CPF-225',
  'SIN-CLASIFICAR',
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
    expect(all.sort()).toEqual([...LEGACY_OFFENSE_CODES, ...ADDED_OFFENSE_CODES].sort());
  });

  it('no repite etiquetas visibles y resuelve las equivalentes a su conducta', () => {
    const labels = OFFENSES.map((offense) => offense.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(findOffense('CPF-222')).toBe(findOffense('LGRA-52'));
    expect(findOffense('LGRA-52')?.label).toBe('Pedir o aceptar dinero o regalos (cohecho)');
    expect(findOffense('LGRA-99')).toBeUndefined();
    expect(findOffense('CPF-217-BIS')).toBe(findOffense('CPF-217'));
    expect(offenseReference('LGRA-63-BIS')).toEqual({ law: 'LGRA', article: '63 Bis' });
    expect(offenseSeverity('LGRA-63-BIS')).toBe('serious');
    expect(offenseActor('LGRA-66')).toBe('private-party');
    expect(offenseActor('CPF-222-BIS')).toBe('private-party');
    expect(offenseActor('CPF-222')).toBe('public-servant');
    expect(offenseActor('LGRA-99')).toBeUndefined();
    expect(offenseActor('LGRA-73')).toBe('private-party');
    expect(offenseActor('SIN-CLASIFICAR')).toBeUndefined();
    expect(offenseReference('SIN-CLASIFICAR')).toBeUndefined();
    expect(offenseReference('LGRA-64-QUATER')).toEqual({ law: 'LGRA', article: '64 Quáter' });
    expect(offenseSeverity('LGRA-64-QUATER')).toBe('serious');
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

describe('primaryOffenseCode', () => {
  it('lleva cada clave equivalente a su principal y deja igual la principal', () => {
    expect(primaryOffenseCode('CPF-222')).toBe('LGRA-52');
    expect(primaryOffenseCode('LGRA-52')).toBe('LGRA-52');
    expect(primaryOffenseCode('CPF-218')).toBe('CPF-218');
    expect(primaryOffenseCode('LGRA-1')).toBeUndefined();
    for (const offense of OFFENSES) {
      for (const code of offense.equivalentCodes)
        expect(primaryOffenseCode(code)).toBe(offense.code);
    }
  });
});

describe('gravedad de las conductas', () => {
  it('distingue faltas no graves, graves, de particulares y delitos', () => {
    expect(offenseSeverity('LGRA-49')).toBe('non_serious');
    expect(offenseSeverity('LGRA-50')).toBe('non_serious');
    expect(offenseSeverity('LGRA-52')).toBe('serious');
    expect(offenseSeverity('LGRA-59')).toBe('serious');
    expect(offenseSeverity('LGRA-64')).toBe('serious');
    expect(offenseSeverity('LGRA-66')).toBe('private_party');
    expect(offenseSeverity('LGRA-72')).toBe('private_party');
    expect(offenseSeverity('CPF-218')).toBe('crime');
    // Una equivalente del CPF toma la gravedad de su clave principal de la LGRA.
    expect(offenseSeverity('CPF-222')).toBe('serious');
    expect(offenseSeverity('LGRA-999')).toBeUndefined();
  });

  it('toda conducta del catálogo tiene gravedad, salvo «sin clasificar»', () => {
    for (const offense of OFFENSES) {
      if (offense.code === UNCLASSIFIED_OFFENSE_CODE) continue;
      expect(offenseSeverity(offense.code)).toBeDefined();
    }
    // Sin gravedad, el trámite usa los plazos de una falta grave (lo más protector).
    expect(offenseSeverity(UNCLASSIFIED_OFFENSE_CODE)).toBeUndefined();
  });
});
