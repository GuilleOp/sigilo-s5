// Pruebas de lo que ofrece el panel del trámite según los plazos legales: la firmeza no se ofrece
// mientras corre el plazo de un recurso (LGRA, art. 206), sí cuando venció o cuando el recurso
// presentado ya se resolvió; con un recurso pendiente no se ofrece cerrar; desde el informe el
// cierre lleva motivo legal. El nodo vuelve a validar todo.
import { describe, expect, it } from 'vitest';
import type {
  AuthorityAccountView,
  ComplaintDetail,
  DeadlineView,
  ProcedureView,
  RemedyView,
} from '@sigilo/contracts';
import { findRemedyKind } from '@sigilo/contracts';
import {
  hasPendingRemedy,
  remedyFiler,
  requiresLegalOutcome,
  stageOptions,
  stageWaits,
} from './procedure-actions.ts';

const COURT: Pick<AuthorityAccountView, 'functions'> = { functions: ['court'] };
const SUBSTANTIATION: Pick<AuthorityAccountView, 'functions'> = { functions: ['substantiation'] };

function deadline(
  key: DeadlineView['key'],
  dueOn: string,
  status: DeadlineView['status'],
): DeadlineView {
  return {
    key,
    name: key,
    explanation: 'Plazo sintético de prueba.',
    startsOn: '2026-12-01',
    dueOn,
    status,
    remaining: status === 'overdue' ? -1 : 3,
    remainingUnit: 'business_days',
    legalBasis: [],
  };
}

function remedy(kind: RemedyView['kind'], status: RemedyView['status']): RemedyView {
  return { kind, name: kind, filedOn: '2026-12-03', status, effect: 'Efecto sintético.' };
}

function detail(patch: Partial<ProcedureView>): ComplaintDetail {
  const procedure: ProcedureView = {
    managementState: 'accepted',
    managementStateName: 'Aceptada',
    explanation: 'Explicación sintética.',
    steps: [],
    deadlines: [],
    rules: [],
    ...patch,
  };
  return { summary: { managementState: 'accepted' }, procedure } as unknown as ComplaintDetail;
}

const keys = (options: { key: string }[]) => options.map((option) => option.key);

describe('firmeza de la sentencia', () => {
  it('no ofrece la firmeza mientras corre la apelación y explica hasta cuándo', () => {
    const view = detail({
      legalStage: 'court_resolution',
      deadlines: [
        deadline('court_appeal_filing', '2026-12-22', 'running'),
        deadline('review_filing', '2026-12-15', 'overdue'),
      ],
    });
    expect(keys(stageOptions(COURT, view))).not.toContain('final');
    expect(stageWaits(COURT, view)).toEqual([
      expect.objectContaining({
        key: 'final',
        text: 'La sentencia todavía puede apelarse',
        dueOn: '2026-12-22',
      }),
    ]);
  });

  it('sí la ofrece cuando vencieron los plazos', () => {
    const view = detail({
      legalStage: 'court_resolution',
      deadlines: [
        deadline('court_appeal_filing', '2026-12-22', 'overdue'),
        deadline('review_filing', '2026-12-15', 'overdue'),
      ],
    });
    expect(keys(stageOptions(COURT, view))).toContain('final');
    expect(stageWaits(COURT, view)).toEqual([]);
  });

  it('sí la ofrece cuando el recurso presentado ya se resolvió', () => {
    const view = detail({
      legalStage: 'court_resolution',
      deadlines: [deadline('review_filing', '2026-12-15', 'running')],
      remedies: [remedy('appeal', 'resolved')],
    });
    expect(keys(stageOptions(COURT, view))).toContain('final');
  });

  it('con el recurso pendiente no la ofrece ni la anuncia como espera', () => {
    const view = detail({
      legalStage: 'court_resolution',
      remedies: [remedy('appeal', 'pending')],
    });
    expect(keys(stageOptions(COURT, view))).not.toContain('final');
    expect(stageWaits(COURT, view)).toEqual([]);
  });
});

describe('firmeza de la resolución no grave', () => {
  it('espera a que venza la revocación', () => {
    const view = detail({
      legalStage: 'resolution',
      deadlines: [deadline('revocation_filing', '2026-12-22', 'due_soon')],
    });
    expect(keys(stageOptions(SUBSTANTIATION, view))).not.toContain('final');
    expect(stageWaits(SUBSTANTIATION, view)[0]?.text).toContain('revocación');
  });
});

describe('cierres', () => {
  it('un recurso pendiente impide cerrar', () => {
    expect(
      hasPendingRemedy(detail({ remedies: [remedy('revocation', 'admitted')] }).procedure),
    ).toBe(true);
    expect(
      hasPendingRemedy(detail({ remedies: [remedy('revocation', 'resolved')] }).procedure),
    ).toBe(false);
  });

  it('desde el informe el cierre lleva motivo legal; en la investigación, no', () => {
    expect(requiresLegalOutcome(detail({ legalStage: 'investigation' }))).toBe(false);
    expect(requiresLegalOutcome(detail({ legalStage: 'qualification' }))).toBe(false);
    expect(requiresLegalOutcome(detail({ legalStage: 'report_filed' }))).toBe(true);
    expect(requiresLegalOutcome(detail({}))).toBe(false);
  });
});

describe('quién presentó el recurso', () => {
  it('la revocación solo la presenta la persona señalada: no se envía «persona denunciante»', () => {
    const revocation = findRemedyKind('revocation');
    if (revocation === undefined) throw new Error('Falta la revocación en el catálogo.');
    expect(revocation.filedBy).toEqual(['accused']);
    expect(remedyFiler(revocation, 'reporter')).toBe('accused');
    expect(remedyFiler({ filedBy: ['accused', 'reporter'] }, 'reporter')).toBe('reporter');
  });
});
