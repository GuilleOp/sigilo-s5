// Pruebas de la ficha de contexto: la fuente del factor «falta grave» nombra el código penal que
// cita el caso (el de la entidad si las equivalencias del S5 son estatales).
import { describe, expect, it } from 'vitest';
import type { ComplaintDetail } from '@sigilo/contracts';
import { offenseSourceLabel } from './ContextSheetPanel.tsx';

function detail(laws: string[]): Pick<ComplaintDetail, 's5References' | 'facts'> {
  return {
    facts: { stateCode: '22' } as ComplaintDetail['facts'],
    s5References: laws.map((law, index) => ({ s5Id: index + 1, law, article: '268, fr. I' })),
  };
}

describe('fuente del factor «falta grave»', () => {
  it('con el código penal de la entidad, lo nombra', () => {
    expect(offenseSourceLabel(detail(['CÓDIGO PENAL PARA EL ESTADO DE QUERÉTARO']))).toBe(
      'Catálogo de conductas (LGRA y Código Penal de Querétaro)',
    );
  });

  it('sin código penal estatal, el federal', () => {
    expect(offenseSourceLabel(detail(['CÓDIGO PENAL FEDERAL']))).toBe(
      'Catálogo de conductas (LGRA y Código Penal Federal)',
    );
    expect(offenseSourceLabel(detail([]))).toBe(
      'Catálogo de conductas (LGRA y Código Penal Federal)',
    );
  });
});
