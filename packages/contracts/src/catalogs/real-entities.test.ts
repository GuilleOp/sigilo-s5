// Pruebas de los entes reales SIN el catálogo completo (como en la web): ids con formato válido,
// pertenencia a la entidad, fragmentos y registro de los que se descargan.
import { describe, expect, it } from 'vitest';
import { ComplaintFactsSchema } from '../complaint.ts';
import type { ComplaintFacts } from '../complaint.ts';
import {
  EntityFragmentSchema,
  entityFragmentsFrom,
  entityFromRow,
  entityLabel,
  entityStateCode,
  findEntity,
  isAcceptedEntityId,
  isEntityId,
  isEntityOfState,
  isRealEntityCatalogComplete,
  registerRealEntities,
} from './index.ts';
import type { RealEntityCatalogFile } from './index.ts';

const FACTS: ComplaintFacts = {
  stateCode: '22',
  entityId: 'PDN-22-7074',
  offenseCode: 'LGRA-52',
  occurredPeriod: '2026-08',
  accused: 'Titular ficticio de la unidad de compras',
  description: 'Hechos sintéticos para las pruebas del contrato de la denuncia.',
};

/** Catálogo mínimo con nombres de instituciones de ejemplo. */
const CATALOG: RealEntityCatalogFile = {
  version: 1,
  fuente: {
    nombre: 'Directorio de prueba',
    url: 'https://ejemplo.invalid',
    descargado: '2026-11-11',
    sha256: 'x',
  },
  entidades: {
    '00': [
      [
        'PDN-00-196',
        'Instituto Mexicano del Seguro Social',
        'F',
        null,
        [196, 10707],
        'INSTITUTO MEXICANO DEL SEGURO SOCIAL',
      ],
    ],
    '22': [
      [
        'PDN-22-7258',
        'Instituto Municipal de Planeación del Municipio de Querétaro',
        'M',
        '014',
        [7258],
      ],
      ['PDN-22-9', 'Comisión de Prueba', 'E', null, [9], 'COMISION DE PRUEBA (CP)'],
    ],
  },
};

describe('entes reales sin el catálogo completo', () => {
  it('acepta ids con formato y entidad válidos, aunque no estén descargados', () => {
    expect(isRealEntityCatalogComplete()).toBe(false);
    expect(isAcceptedEntityId('PDN-22-7074')).toBe(true);
    expect(isAcceptedEntityId('PDN-00-196')).toBe(true);
    expect(isAcceptedEntityId('PDN-33-1')).toBe(false);
    expect(isAcceptedEntityId('PDN-22-x')).toBe(false);
    expect(isAcceptedEntityId('Juan Perez es corrupto')).toBe(false);
    expect(isAcceptedEntityId('VE-OBRAS')).toBe(true);
    // Sin descargar, no es un ente conocido: findEntity no inventa nombre ni orden.
    expect(isEntityId('PDN-22-7074')).toBe(false);
    expect(findEntity('PDN-22-7074')).toBeUndefined();
  });

  it('exige que un ente estatal o municipal sea de la entidad de los hechos', () => {
    expect(entityStateCode('PDN-22-7074')).toBe('22');
    expect(entityStateCode('VE-OBRAS')).toBeUndefined();
    expect(isEntityOfState('PDN-22-7074', '22')).toBe(true);
    expect(isEntityOfState('PDN-22-7074', '09')).toBe(false);
    expect(isEntityOfState('PDN-00-196', '09')).toBe(true);
    expect(isEntityOfState('VE-OBRAS', '31')).toBe(true);
    expect(ComplaintFactsSchema.safeParse(FACTS).success).toBe(true);
    const otherState = ComplaintFactsSchema.safeParse({ ...FACTS, stateCode: '09' });
    expect(otherState.success).toBe(false);
    expect(otherState.error?.issues[0]?.path).toEqual(['entityId']);
    expect(
      ComplaintFactsSchema.safeParse({ ...FACTS, stateCode: '09', entityId: 'PDN-00-196' }).success,
    ).toBe(true);
  });

  it('parte el catálogo en fragmentos válidos, uno por entidad, sin ids de la PDN', () => {
    const fragments = entityFragmentsFrom(CATALOG, {
      '00': 'Federación',
      '22': 'Querétaro',
      '01': 'Aguascalientes',
    });
    expect(Object.keys(fragments).sort()).toEqual(['00', '01', '22']);
    for (const fragment of Object.values(fragments)) {
      expect(EntityFragmentSchema.parse(fragment)).toEqual(fragment);
    }
    expect(fragments['01']?.entes).toEqual([]);
    // El nombre de la PDN solo viaja si se busca distinto del que se muestra.
    expect(fragments['00']?.entes[0]).toEqual([
      'PDN-00-196',
      'Instituto Mexicano del Seguro Social',
      'F',
      null,
    ]);
    expect(fragments['22']?.entes[1]).toEqual([
      'PDN-22-9',
      'Comisión de Prueba',
      'E',
      null,
      'COMISION DE PRUEBA (CP)',
    ]);
    expect(
      EntityFragmentSchema.safeParse({
        ...fragments['22'],
        entes: [['Juan Perez', 'x', 'E', null]],
      }).success,
    ).toBe(false);
  });

  it('registra los entes de un fragmento descargado para buscarlos por id', () => {
    const fragment = entityFragmentsFrom(CATALOG, { '22': 'Querétaro' })['22'];
    registerRealEntities((fragment?.entes ?? []).map((row) => entityFromRow('22', row)));
    expect(isRealEntityCatalogComplete()).toBe(false);
    const entity = findEntity('PDN-22-7258');
    expect(entity).toMatchObject({ level: 'municipal', stateCode: '22', municipalityCode: '014' });
    expect(entity && entityLabel(entity)).toBe(
      'Instituto Municipal de Planeación del Municipio de Querétaro',
    );
    expect(isEntityId('PDN-22-7258')).toBe(true);
  });

  it('marca como ficticios los entes de la demostración, salvo «Otro ente público»', () => {
    const demo = findEntity('VE-INSTITUTO');
    expect(demo && entityLabel(demo)).toBe('Instituto Federal Ficticio de Equipamiento (ficticia)');
    const other = findEntity('VE-OTRO');
    expect(other && entityLabel(other)).toBe('Otro ente público (lo describo en los hechos)');
  });
});
