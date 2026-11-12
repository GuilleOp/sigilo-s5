// Pruebas del fundamento de apertura en la vía penal: forma del texto, lectura de vuelta y rechazo
// de lo incompleto (sin fundamento de la lista, sin número de resolución o sin motivo).
import { describe, expect, it } from 'vitest';
import { LegalBasisTextSchema } from '../procedure-view.ts';
import {
  CRIMINAL_OPENING_GROUNDS,
  criminalOpeningBasisError,
  criminalOpeningBasisProblem,
  formatCriminalOpeningBasis,
  isCriminalStage,
  parseCriminalOpeningBasis,
} from './criminal-opening.ts';
import type { CriminalOpeningBasis } from './criminal-opening.ts';

const BASIS: CriminalOpeningBasis = {
  ground: 'cnpp_109_xxvi',
  resolutionReference: 'Causa penal 45/2026',
  reason: 'El juez ordenó dar a conocer la identidad a la defensa (caso sintético).',
};

describe('fundamento de apertura en la vía penal', () => {
  it('distingue las etapas del proceso penal de las administrativas', () => {
    expect(isCriminalStage('criminal_investigation')).toBe(true);
    expect(isCriminalStage('trial')).toBe(true);
    expect(isCriminalStage('investigation')).toBe(false);
    expect(isCriminalStage('qualification')).toBe(false);
    expect(isCriminalStage(null)).toBe(false);
    expect(isCriminalStage(undefined)).toBe(false);
  });

  it('el primer fundamento es el que señaló la SESNA: CNPP art. 109 fr. XXVI', () => {
    expect(CRIMINAL_OPENING_GROUNDS[0].label).toBe(
      'CNPP art. 109 fr. XXVI / resolución del Órgano jurisdiccional',
    );
  });

  it('arma un texto que la persona puede leer y que se lee de vuelta igual', () => {
    const text = formatCriminalOpeningBasis(BASIS);
    expect(text).toBe(
      'Vía penal. Fundamento: CNPP art. 109 fr. XXVI / resolución del Órgano jurisdiccional. Resolución: Causa penal 45/2026. Motivo: El juez ordenó dar a conocer la identidad a la defensa (caso sintético).',
    );
    expect(parseCriminalOpeningBasis(text)).toEqual(BASIS);
    expect(LegalBasisTextSchema.safeParse(text).success).toBe(true);
  });

  it('cada fundamento de la lista cabe en el límite del fundamento con el motivo más largo', () => {
    for (const ground of CRIMINAL_OPENING_GROUNDS) {
      const text = formatCriminalOpeningBasis({
        ground: ground.key,
        resolutionReference: 'X'.repeat(80),
        reason: 'm'.repeat(700),
      });
      expect(LegalBasisTextSchema.safeParse(text).success).toBe(true);
      expect(parseCriminalOpeningBasis(text)?.ground).toBe(ground.key);
    }
  });

  it('rechaza un texto libre, un fundamento ajeno a la lista o partes incompletas', () => {
    expect(parseCriminalOpeningBasis('Artículo 64 de la LGRA: citar como testigo.')).toBeNull();
    expect(
      parseCriminalOpeningBasis(
        'Vía penal. Fundamento: Costumbre de la oficina. Resolución: 1/2026. Motivo: porque sí, sin más fundamento.',
      ),
    ).toBeNull();
    const withoutReference = formatCriminalOpeningBasis(BASIS).replace('Causa penal 45/2026', '');
    expect(parseCriminalOpeningBasis(withoutReference)).toBeNull();
    const shortReason = formatCriminalOpeningBasis(BASIS).replace(/Motivo: .*$/u, 'Motivo: corto');
    expect(parseCriminalOpeningBasis(shortReason)).toBeNull();
  });

  it('explica qué falta antes de enviar', () => {
    expect(criminalOpeningBasisError(BASIS)).toBeNull();
    expect(criminalOpeningBasisError({ ...BASIS, ground: 'otro' as never })).toMatch(
      'Elige el fundamento',
    );
    expect(criminalOpeningBasisError({ ...BASIS, resolutionReference: ' ' })).toMatch(
      'número de la resolución',
    );
    expect(criminalOpeningBasisError({ ...BASIS, resolutionReference: 'Causa: 45' })).toMatch(
      'número de la resolución',
    );
    expect(criminalOpeningBasisError({ ...BASIS, reason: 'corto' })).toMatch('motivo');
    expect(() => formatCriminalOpeningBasis({ ...BASIS, reason: '' })).toThrow('motivo');
    expect(criminalOpeningBasisProblem({ ...BASIS, reason: '' })?.field).toBe('reason');
    expect(criminalOpeningBasisProblem({ ...BASIS, resolutionReference: '' })?.field).toBe(
      'resolutionReference',
    );
  });
});
