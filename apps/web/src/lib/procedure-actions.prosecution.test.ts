// Pruebas de las acciones del trámite que ofrece el panel: solo la fiscalía avanza la vía penal y
// no ve la investigación administrativa; la investigadora solo ve la administrativa.
import { describe, expect, it } from 'vitest';
import type {
  AuthorityAccountView,
  AuthorityProfile,
  ComplaintDetail,
  ProcedureView,
} from '@sigilo/contracts';
import {
  isProsecutionAccount,
  isReferralCopy,
  referralTargets,
  stageOptions,
} from './procedure-actions.ts';

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

describe('vista al Ministerio Público en la bandeja de la fiscalía', () => {
  const assignedTo = (authorityId: string) =>
    ({ summary: { assignedAuthorityId: authorityId } }) as unknown as ComplaintDetail;

  it('la fiscalía ve como copia de lectura la denuncia que tiene otra autoridad', () => {
    expect(isReferralCopy(PROSECUTION, assignedTo(OIC.authorityId))).toBe(true);
    // Si se la turnaron, es suya: no es copia.
    expect(isReferralCopy(PROSECUTION, assignedTo(PROSECUTION.authorityId))).toBe(false);
    // El OIC nunca tiene copias de lectura.
    expect(isReferralCopy(OIC, assignedTo('authority.otra-prueba'))).toBe(false);
  });

  it('solo se da vista a fiscalías del nodo distintas de la que tiene la denuncia', () => {
    const authorities: AuthorityProfile[] = [
      { authorityId: OIC.authorityId, name: 'OIC', isInbox: false, canReceive: true },
      {
        authorityId: PROSECUTION.authorityId,
        name: 'Fiscalía',
        isInbox: false,
        canReceive: true,
        isProsecution: true,
      },
      { authorityId: 'authority.tribunal', name: 'Tribunal', isInbox: false, canReceive: false },
    ];
    expect(referralTargets(authorities, OIC.authorityId).map((item) => item.authorityId)).toEqual([
      PROSECUTION.authorityId,
    ]);
    expect(referralTargets(authorities, PROSECUTION.authorityId)).toEqual([]);
  });
});
