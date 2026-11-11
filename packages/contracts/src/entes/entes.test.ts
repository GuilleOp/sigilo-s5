// Pruebas del catálogo completo de entes reales (como en el servidor): ids únicos y estables,
// validación estricta, orden de gobierno y equivalencias del S5 con oficinas reales.
import { describe, expect, it } from 'vitest';
import { REAL_ENTITIES, REAL_ENTITIES_SOURCE, REAL_ENTITY_CATALOG } from './index.ts';
import { s5ReferencesFor } from '../s5/index.ts';
import { ComplaintFactsSchema } from '../complaint.ts';
import type { ComplaintFacts } from '../complaint.ts';
import {
  EntityFragmentSchema,
  entityFragmentsFrom,
  findEntity,
  isAcceptedEntityId,
  isMunicipalityOf,
  isRealEntityCatalogComplete,
  REAL_ENTITY_ID_PATTERN,
  STATES,
} from '../catalogs/index.ts';

const FACTS: ComplaintFacts = {
  stateCode: '22',
  municipalityCode: '014',
  entityId: 'PDN-22-7258',
  offenseCode: 'LGRA-52',
  occurredPeriod: '2026-08',
  accused: 'Titular ficticio de la unidad de compras',
  description: 'Hechos sintéticos para las pruebas del contrato de la denuncia.',
};

describe('catálogo de entes reales de la PDN', () => {
  it('trae ids únicos con su entidad, orden de gobierno y municipio válidos', () => {
    expect(REAL_ENTITIES.length).toBeGreaterThan(7000);
    expect(REAL_ENTITIES_SOURCE.descargado).toBe('2026-11-11');
    const ids = REAL_ENTITIES.map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
    const pdnIds = REAL_ENTITIES.flatMap((entity) => entity.pdnIds);
    expect(new Set(pdnIds).size).toBe(pdnIds.length);
    for (const entity of REAL_ENTITIES) {
      const match = REAL_ENTITY_ID_PATTERN.exec(entity.id);
      expect(match?.[1]).toBe(entity.stateCode);
      expect(Number(match?.[2])).toBe(Math.min(...entity.pdnIds));
      expect(entity.level === 'federal').toBe(entity.stateCode === '00');
      if (entity.municipalityCode !== undefined) {
        expect(isMunicipalityOf(entity.stateCode ?? '', entity.municipalityCode)).toBe(true);
      }
      // Ningún nombre trae correos ni números largos (teléfonos).
      expect(entity.name).not.toMatch(/@|\d{7,}/u);
    }
  });

  it('cubre las 32 entidades y lo federal', () => {
    const states = new Set(REAL_ENTITIES.map((entity) => entity.stateCode));
    expect(states.size).toBe(33);
    for (const state of STATES) expect(states.has(state.code)).toBe(true);
  });

  it('valida en modo estricto: solo ids del catálogo y de la entidad de los hechos', () => {
    expect(isRealEntityCatalogComplete()).toBe(true);
    expect(isAcceptedEntityId('PDN-22-7258')).toBe(true);
    expect(isAcceptedEntityId('PDN-22-1')).toBe(false);
    expect(isAcceptedEntityId('VE-OBRAS')).toBe(true);
    expect(ComplaintFactsSchema.safeParse(FACTS).success).toBe(true);
    expect(ComplaintFactsSchema.safeParse({ ...FACTS, entityId: 'PDN-22-1' }).success).toBe(false);
    const otherState = ComplaintFactsSchema.safeParse({
      ...FACTS,
      stateCode: '09',
      municipalityCode: '014',
    });
    expect(otherState.success).toBe(false);
    expect(otherState.error?.issues.map((issue) => issue.path)).toEqual([['entityId']]);
    // Un ente federal real vale en cualquier entidad.
    expect(
      ComplaintFactsSchema.safeParse({
        ...FACTS,
        stateCode: '31',
        municipalityCode: undefined,
        entityId: 'PDN-00-196',
      }).success,
    ).toBe(true);
  });

  it('da nombre y orden de gobierno a los entes reales', () => {
    expect(findEntity('PDN-00-196')).toMatchObject({
      name: 'Instituto Mexicano del Seguro Social',
      level: 'federal',
      stateCode: '00',
    });
    expect(findEntity('PDN-22-7074')?.name).toBe(
      'Aeropuerto Intercontinental de Querétaro SA de CV',
    );
    expect(findEntity('PDN-22-7258')).toMatchObject({
      level: 'municipal',
      municipalityCode: '014',
    });
  });

  it('usa la ley federal para una oficina federal real y la local para una estatal', () => {
    const federal = s5ReferencesFor('PDN-00-196', '22', 'LGRA-52');
    const federalByFictitious = s5ReferencesFor('VE-INSTITUTO', '22', 'LGRA-52');
    expect(federal).toEqual(federalByFictitious);
    expect(federal.length).toBeGreaterThan(0);
    const local = s5ReferencesFor('PDN-22-7074', '22', 'LGRA-52');
    expect(local).toEqual(s5ReferencesFor('VE-SALUD', '22', 'LGRA-52'));
    expect(local).not.toEqual(federal);
  });

  it('produce fragmentos por entidad que el navegador acepta', () => {
    const names = Object.fromEntries([
      ['00', 'Federación'],
      ...STATES.map((state) => [state.code, state.name]),
    ]);
    const fragments = entityFragmentsFrom(REAL_ENTITY_CATALOG, names);
    let total = 0;
    for (const fragment of Object.values(fragments)) {
      expect(EntityFragmentSchema.safeParse(fragment).success).toBe(true);
      expect(JSON.stringify(fragment).length).toBeLessThan(200_000);
      total += fragment.entes.length;
    }
    expect(total).toBe(REAL_ENTITIES.length);
  });
});
