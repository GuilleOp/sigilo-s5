// Pruebas del aviso por recursos federales en el panel: dice a qué autoridades se avisó (hallazgo 14d).
import { describe, expect, it } from 'vitest';
import type { ComplaintDetail, ProcedureStep } from '@sigilo/contracts';
import { noticeRecipients } from './FederalFundsPanel.tsx';

function withNotice(recipients: ('asf' | 'sabg' | 'fgr')[]): Pick<ComplaintDetail, 'procedure'> {
  const step: ProcedureStep = {
    on: '2026-11-16',
    legalOn: '2026-11-16',
    action: 'federal_notice_sent',
    managementState: 'accepted',
    title: 'Se dio aviso a las autoridades federales',
    explanation: '',
    record: { recipients },
  };
  return {
    procedure: { steps: [step] } as unknown as ComplaintDetail['procedure'],
  };
}

describe('aviso por recursos federales', () => {
  it('nombra a las autoridades elegidas', () => {
    expect(noticeRecipients(withNotice(['asf', 'sabg']))).toBe(
      'Auditoría Superior de la Federación (ASF) y Secretaría Anticorrupción y Buen Gobierno (SABG)',
    );
    expect(noticeRecipients(withNotice(['fgr']))).toBe(
      'Fiscalía Especializada en materia de Combate a la Corrupción de la FGR',
    );
    expect(noticeRecipients({ procedure: undefined })).toBe('');
  });
});
