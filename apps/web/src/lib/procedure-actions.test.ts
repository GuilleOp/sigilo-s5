// Pruebas de lo que ofrece el panel del trámite según los plazos legales: la firmeza no se ofrece
// mientras corre el plazo de un recurso (LGRA, art. 206), sí cuando venció o cuando el recurso
// presentado ya se resolvió; con un recurso pendiente no se ofrece cerrar; desde el informe el
// cierre lleva motivo legal; la audiencia inicial espera 10 días hábiles y el cierre de la
// instrucción, los alegatos; la medida cautelar solo se concede provisionalmente durante la vista;
// el Tribunal no cierra después de la sentencia; la fiscalía solo ve los plazos penales. El nodo
// vuelve a validar todo.
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
  canCloseAtStage,
  hasPendingRemedy,
  notificationOption,
  precautionaryDecisionMode,
  precautionaryOutcomeOptions,
  precautionaryWaitFor,
  remedyFiler,
  requiresLegalOutcome,
  stageOptions,
  stageWaits,
  visibleDeadlines,
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

/** Notificación registrada de la sentencia y de la resolución: desde ella corren los recursos. */
const SENTENCE_NOTIFIED: ProcedureView['notification'] = {
  act: 'court_resolution',
  notifiedOn: '2026-12-01',
  recipients: ['accused'],
};
const RESOLUTION_NOTIFIED: ProcedureView['notification'] = {
  act: 'resolution',
  notifiedOn: '2026-12-01',
  recipients: ['accused'],
};

describe('firmeza de la sentencia', () => {
  it('no ofrece la firmeza mientras corre la apelación y explica hasta cuándo', () => {
    const view = detail({
      legalStage: 'court_resolution',
      notification: SENTENCE_NOTIFIED,
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
      notification: SENTENCE_NOTIFIED,
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
      notification: SENTENCE_NOTIFIED,
      deadlines: [deadline('review_filing', '2026-12-15', 'running')],
      remedies: [remedy('appeal', 'resolved')],
    });
    expect(keys(stageOptions(COURT, view))).toContain('final');
  });

  it('con el recurso pendiente no la ofrece ni la anuncia como espera', () => {
    const view = detail({
      legalStage: 'court_resolution',
      notification: SENTENCE_NOTIFIED,
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
      notification: RESOLUTION_NOTIFIED,
      deadlines: [deadline('revocation_filing', '2026-12-22', 'due_soon')],
    });
    expect(keys(stageOptions(SUBSTANTIATION, view))).not.toContain('final');
    expect(stageWaits(SUBSTANTIATION, view)[0]?.text).toContain('revocación');
  });
});

describe('notificación de la resolución y de la sentencia', () => {
  it('sin notificación no ofrece la firmeza y pide registrarla primero', () => {
    const view = detail({
      legalStage: 'resolution',
      deadlines: [deadline('resolution_notice', '2026-12-15', 'running')],
    });
    expect(keys(stageOptions(SUBSTANTIATION, view))).not.toContain('final');
    expect(stageWaits(SUBSTANTIATION, view)).toEqual([
      expect.objectContaining({
        key: 'final',
        needsNotification: true,
        text: expect.stringContaining('Registra primero la notificación') as unknown,
      }),
    ]);
    // Aunque el recurso ya se haya resuelto, sin notificación no hay firmeza.
    const resolved = detail({
      legalStage: 'court_resolution',
      remedies: [remedy('appeal', 'resolved')],
    });
    expect(keys(stageOptions(COURT, resolved))).not.toContain('final');
  });

  it('la substanciadora notifica la resolución y el Tribunal, la sentencia; una sola vez', () => {
    const resolution = detail({ legalStage: 'resolution' });
    expect(notificationOption(SUBSTANTIATION, resolution)?.act.act).toBe('resolution');
    expect(notificationOption(COURT, resolution)).toBeNull();
    const sentence = detail({ legalStage: 'court_resolution' });
    expect(notificationOption(COURT, sentence)).toMatchObject({ mode: 'own' });
    expect(notificationOption(SUBSTANTIATION, sentence)).toBeNull();
    // Sin cuentas del Tribunal, la substanciación registra la notificación de la sentencia.
    const recorded = detail({ legalStage: 'court_resolution', courtRecording: true });
    expect(notificationOption(SUBSTANTIATION, recorded)?.mode).toBe('court_record');
    expect(
      notificationOption(
        SUBSTANTIATION,
        detail({ legalStage: 'resolution', notification: RESOLUTION_NOTIFIED }),
      ),
    ).toBeNull();
  });

  it('a la persona anónima no se le ofrece como destinataria', () => {
    const sealed = {
      ...detail({ legalStage: 'resolution' }),
      summary: { managementState: 'accepted', mode: 'sealed' },
    } as unknown as ComplaintDetail;
    const anonymous = {
      ...sealed,
      summary: { managementState: 'accepted', mode: 'anonymous' },
    } as unknown as ComplaintDetail;
    expect(notificationOption(SUBSTANTIATION, sealed)?.defaultRecipients).toEqual([
      'accused',
      'reporter',
    ]);
    expect(notificationOption(SUBSTANTIATION, anonymous)).toMatchObject({
      canNotifyReporter: false,
      defaultRecipients: ['accused'],
    });
  });

  it('la investigadora notifica la calificación de no grave mientras no se ha notificado', () => {
    const INVESTIGATION: Pick<AuthorityAccountView, 'functions'> = { functions: ['investigation'] };
    const pending = detail({
      legalStage: 'qualification',
      inconformity: { against: 'non_serious' },
    });
    expect(notificationOption(INVESTIGATION, pending)?.act.act).toBe('qualification');
    const notified = detail({
      legalStage: 'qualification',
      inconformity: { against: 'non_serious', notifiedOn: '2026-12-01' },
    });
    expect(notificationOption(INVESTIGATION, notified)).toBeNull();
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

describe('audiencia inicial y alegatos (LGRA, arts. 208 y 209)', () => {
  it('no ofrece la audiencia antes del mínimo de 10 días hábiles y dice desde cuándo', () => {
    const window: DeadlineView = {
      ...deadline('initial_hearing_window', '2026-12-22', 'running'),
      earliestOn: '2026-12-15',
      isEarliestReached: false,
    };
    const view = detail({ legalStage: 'summoned', deadlines: [window] });
    expect(keys(stageOptions(SUBSTANTIATION, view))).not.toContain('initial_hearing');
    expect(stageWaits(SUBSTANTIATION, view)).toEqual([
      expect.objectContaining({
        key: 'initial_hearing',
        availableOn: '2026-12-15',
        isRemedyWait: false,
      }),
    ]);
    const reached = detail({
      legalStage: 'summoned',
      deadlines: [{ ...window, isEarliestReached: true }],
    });
    expect(keys(stageOptions(SUBSTANTIATION, reached))).toContain('initial_hearing');
    expect(stageWaits(SUBSTANTIATION, reached)).toEqual([]);
  });

  it('no ofrece cerrar la instrucción con los alegatos abiertos, tampoco al Tribunal', () => {
    const open = deadline('closing_arguments', '2026-12-10', 'running');
    const view = detail({ legalStage: 'closing_arguments', deadlines: [open] });
    expect(keys(stageOptions(SUBSTANTIATION, view))).not.toContain('instruction_closed');
    expect(stageWaits(SUBSTANTIATION, view)[0]).toMatchObject({
      text: 'Las partes todavía pueden presentar sus alegatos',
      availableOn: '2026-12-11',
      isRemedyWait: false,
    });
    const court = detail({ legalStage: 'court_closing_arguments', deadlines: [open] });
    expect(keys(stageOptions(COURT, court))).not.toContain('court_instruction_closed');
    const elapsed = detail({
      legalStage: 'court_closing_arguments',
      deadlines: [deadline('closing_arguments', '2026-12-10', 'overdue')],
    });
    expect(keys(stageOptions(COURT, elapsed))).toContain('court_instruction_closed');
  });
});

describe('medida cautelar (LGRA, arts. 126 y 127)', () => {
  const hearing = (status: DeadlineView['status']) =>
    deadline('precautionary_hearing', '2026-12-08', status);

  it('durante la vista solo ofrece la provisional y avisa desde cuándo se resuelve', () => {
    const view = detail({
      legalStage: 'report_admitted',
      deadlines: [hearing('running')],
      precautionary: { requestedOn: '2026-12-01' },
    });
    expect(precautionaryOutcomeOptions(view).map((item) => item.key)).toEqual(['provisional']);
    expect(precautionaryWaitFor(SUBSTANTIATION, view)).toBe('2026-12-08');
  });

  it('vencida la vista ofrece concederla o negarla; tras la provisional, ya no la provisional', () => {
    const view = detail({
      legalStage: 'report_admitted',
      deadlines: [hearing('overdue')],
      precautionary: { requestedOn: '2026-12-01', decidedOn: '2026-12-02', outcome: 'provisional' },
    });
    expect(precautionaryOutcomeOptions(view).map((item) => item.key)).toEqual([
      'granted',
      'denied',
    ]);
    expect(precautionaryDecisionMode(SUBSTANTIATION, view)).toBe('own');
    expect(precautionaryWaitFor(SUBSTANTIATION, view)).toBeNull();
    // Provisional y con la vista corriendo: no hay nada que resolver todavía.
    const waiting = detail({
      legalStage: 'report_admitted',
      deadlines: [hearing('running')],
      precautionary: { requestedOn: '2026-12-01', decidedOn: '2026-12-02', outcome: 'provisional' },
    });
    expect(precautionaryDecisionMode(SUBSTANTIATION, waiting)).toBeNull();
    expect(precautionaryWaitFor(SUBSTANTIATION, waiting)).toBe('2026-12-08');
  });
});

describe('cierre después de la sentencia y plazos de la fiscalía', () => {
  it('dictada la sentencia no se ofrece cerrar; antes, en el Tribunal, sí', () => {
    expect(canCloseAtStage(detail({ legalStage: 'court_resolution' }))).toBe(false);
    expect(canCloseAtStage(detail({ legalStage: 'court_instruction_closed' }))).toBe(true);
    expect(canCloseAtStage(detail({ legalStage: 'final' }))).toBe(true);
  });

  it('la fiscalía solo ve los plazos de la vía penal', () => {
    const procedure = detail({
      deadlines: [
        deadline('prescription_serious', '2033-08-01', 'running'),
        deadline('serious_offense_start', '2026-12-15', 'running'),
        deadline('prosecutor_determination_challenge', '2026-12-15', 'running'),
      ],
    }).procedure;
    expect(visibleDeadlines({ isProsecution: true }, procedure).map((item) => item.key)).toEqual([
      'prosecutor_determination_challenge',
    ]);
    expect(visibleDeadlines({}, procedure)).toHaveLength(3);
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
