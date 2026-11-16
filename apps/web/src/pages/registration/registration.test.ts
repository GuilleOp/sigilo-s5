// Pruebas del formulario de alta: la casilla de delitos nombra el código penal que aplica.
import { describe, expect, it } from 'vitest';
import { penalLawLabel } from './RegistrationPage.tsx';

describe('solicitud de alta', () => {
  it('una institución estatal ve el código penal de su entidad, no el federal', () => {
    expect(penalLawLabel({ governmentLevel: 'estatal', stateCode: '22' })).toBe(
      'Delitos por hechos de corrupción (código penal de Querétaro)',
    );
    expect(penalLawLabel({ governmentLevel: 'municipal', stateCode: '' })).toBe(
      'Delitos por hechos de corrupción (código penal de tu entidad)',
    );
    expect(penalLawLabel({ governmentLevel: 'federal', stateCode: '22' })).toBe(
      'Delitos por hechos de corrupción (Código Penal Federal)',
    );
  });
});
