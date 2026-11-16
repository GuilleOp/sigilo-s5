// Pruebas de las acciones del trámite que ofrece el panel: solo la fiscalía avanza la vía penal y
// no ve la investigación administrativa; la investigadora solo ve la administrativa.
import { describe, expect, it } from 'vitest';
import type { AuthorityAccountView, ComplaintDetail, ProcedureView } from '@sigilo/contracts';
import { isProsecutionAccount, stageOptions } from './procedure-actions.ts';

function detail(procedure: Partial<ProcedureView> = {}): ComplaintDetail {
  return {
    summary: { managementState: 'accepted' },
    procedure: {
      managementState: 'accepted',
      managementStateName: 'Aceptada',
      explanation: 'Aceptada (sintético).',
      steps: [],
      deadlines: [],
      rules: [],
      ...procedure,
    },
  } as unknown as ComplaintDetail;
}

const OIC: AuthorityAccountView = {
  accountId: 'acct-0000000000000001',
  authorityId: 'authority.oic-prueba',
  functions: ['intake', 'investigation'],
};

const PROSECUTION: AuthorityAccountView = {
  accountId: 'acct-0000000000000002',
  authorityId: 'authority.fiscalia-prueba',
  functions: ['intake', 'investigation'],
  isProsecution: true,
};

describe('vía penal en el panel', () => {
  it('la fiscalía solo ve la vía penal, sin «Iniciar la investigación» administrativa', () => {
    const labels = stageOptions(PROSECUTION, detail()).map((item) => item.label);
    expect(labels).toEqual(['Vía penal: Iniciar la investigación penal']);
    expect(isProsecutionAccount(PROSECUTION)).toBe(true);
  });

  it('la investigadora no avanza la vía penal aunque haya dado vista', () => {
    const labels = stageOptions(OIC, detail({ criminalStage: 'criminal_complaint_filed' })).map(
      (item) => item.label,
    );
    expect(labels).toContain('Iniciar la investigación');
    expect(labels.some((label) => label.startsWith('Vía penal'))).toBe(false);
    expect(isProsecutionAccount(OIC)).toBe(false);
  });

  it('la fiscalía sigue la vía penal después de la vista', () => {
    const labels = stageOptions(
      PROSECUTION,
      detail({ criminalStage: 'criminal_complaint_filed' }),
    ).map((item) => item.label);
    expect(labels).toEqual(['Vía penal: El Ministerio Público inició la investigación']);
  });
});
