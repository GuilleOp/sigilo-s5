// Vista del trámite para el seguimiento y el panel: línea de tiempo con explicaciones sencillas,
// plazos legales con su situación (en curso, por vencer, vencido) y reglas públicas cumplidas.
// También arma los hechos del trámite con los que se evalúan las reglas.
import {
  CLOSURE_REASONS,
  describeLegalReference,
  FEDERAL_FUNDS_RULE,
  findClosureReason,
  findDeadlineRule,
  findEscalationRule,
  findLegalClosureReason,
  findLegalStage,
  findManagementState,
  findRemedyKind,
  findRemedyOutcome,
  offenseSeverity,
} from '@sigilo/contracts';
import type {
  DeadlineView,
  ProcedureStep,
  ProcedureStepRecord,
  ProcedureView,
  RemedyView,
  RuleTriggerView,
} from '@sigilo/contracts';
import { activeDeadlines, evaluateDeadline, toMexicoCentralDay } from '@sigilo/core';
import type { ProcedureSnapshot } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { nodeCalendar } from './calendar.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import type { StoredRuleTrigger, StoredStep } from '../db/procedure-repository.ts';
import { archiveSignalCount, downgradeSignalCount } from './audit-service.ts';
import { unconfirmedTransferOn } from './transfer-service.ts';
import {
  firstAuthorityMessageAfter,
  qualificationNotifiedOn,
  qualificationView,
} from './qualification-service.ts';
import { conflictFacts, sanctionCheckView } from './pdn-context.ts';
import { assignedAuthorityOf, hasCourtAccounts, lifecycleOf } from './procedure-service.ts';
import { abstentionView, inconformableAct, inconformityView } from './qualification-service.ts';
import { criminalStageOfStep, currentInconformity, pendingRemedies } from './lifecycle-state.ts';
import type { LifecycleState } from './lifecycle-state.ts';

/** Quién lee la vista: la persona denunciante (seguimiento) o la autoridad (panel). */
export type ProcedureAudience = 'reporter' | 'authority';
import { turnPendingSince } from './turn-semaphore.ts';

/** Día legal (hora del centro) de un mensaje fechado a la hora en UTC (`AAAA-MM-DDTHH:00Z`). */
function legalDayOfHour(hour: string): string {
  return toMexicoCentralDay(new Date(Date.parse(hour.replace(/Z$/u, ':00Z'))));
}

function isFirstStage(step: StoredStep): boolean {
  if (step.action !== 'stage_advanced') return false;
  const criminal = criminalStageOfStep(step);
  if (criminal !== null) return criminal === 'criminal_investigation';
  return step.legalStage === 'investigation';
}

function isQualificationOrLater(step: StoredStep): boolean {
  if (step.action !== 'stage_advanced' || step.legalStage === null) return false;
  if (criminalStageOfStep(step) !== null) return false;
  return (
    findLegalStage(step.legalStage)?.track === 'administrative' &&
    step.legalStage !== 'investigation'
  );
}

/**
 * Hechos del trámite en días legales: recepción, gravedad, inicio de la investigación,
 * calificación, cierre vigente, primer aviso por el buzón después de un archivo y última
 * actuación de la autoridad (pasos del trámite y mensajes suyos).
 */
export function procedureSnapshot(ctx: AppContext, complaint: ComplaintRecord): ProcedureSnapshot {
  const steps = ctx.procedure.listSteps(complaint.folio);
  const isClosed = complaint.managementState === 'closed';
  const lastClose = isClosed ? steps.filter((step) => step.action === 'closed').at(-1) : undefined;
  const closedOn = lastClose?.legalOn ?? null;
  const authorityDays = ctx.messages
    .listByFolio(complaint.folio)
    .filter((message) => message.from === 'authority')
    .map((message) => legalDayOfHour(message.sentOn));
  const actionDays = steps.filter((step) => step.actorId !== null).map((step) => step.legalOn);
  const lastActivityOn = [complaint.receivedLegalOn, ...actionDays, ...authorityDays].sort().at(-1);
  const qualification = ctx.qualifications.lastQualification(complaint.folio);
  const state = lifecycleOf(ctx, complaint);
  const inconformity = currentInconformity(state);
  const act = inconformableAct(ctx, complaint, state);
  const pending = pendingRemedies(state);
  return {
    receivedOn: complaint.receivedLegalOn,
    mode: complaint.mode,
    severity: offenseSeverity(complaint.facts.offenseCode) ?? 'serious',
    occurredPeriod: complaint.facts.occurredPeriod,
    investigationStartedOn: steps.find(isFirstStage)?.legalOn ?? null,
    qualifiedOn: steps.find(isQualificationOrLater)?.legalOn ?? null,
    closedOn,
    closureReason: isClosed ? complaint.closureReason : null,
    archiveNotifiedOn:
      closedOn === null
        ? null
        : firstAuthorityMessageAfter(ctx, complaint.folio, 'closure', closedOn),
    lastActivityOn: lastActivityOn ?? complaint.receivedLegalOn,
    ...conflictFacts(ctx, complaint, assignedAuthorityOf(ctx, complaint)),
    archiveSignalCount: archiveSignalCount(ctx, complaint.folio),
    legalStage: complaint.legalStage,
    qualificationSeverity: qualification?.severity ?? null,
    qualificationOn: qualification?.legalOn ?? null,
    qualificationNotifiedOn: qualificationNotifiedOn(ctx, complaint.folio, qualification),
    appealFiledOn: ctx.qualifications.findAppeal(complaint.folio)?.legalOn ?? null,
    downgradeSignalCount: downgradeSignalCount(ctx, complaint.folio),
    transferPendingOn: unconfirmedTransferOn(ctx, complaint.folio),
    turnPendingOn: turnPendingSince(complaint, steps),
    stageEnteredOn: state.stageEnteredOn,
    criminalStage: complaint.criminalStage,
    criminalStageEnteredOn: state.criminalStageEnteredOn,
    inconformityNotifiedOn: act?.notifiedOn ?? null,
    inconformitySignedOn: inconformity?.filedOn ?? null,
    inconformityResolved: inconformity?.status === 'resolved',
    pendingRemedies: pending.map((remedy) => ({ kind: remedy.kind, filedOn: remedy.filedOn })),
    filedRemedies: state.remedies
      .filter((remedy) => remedy.stage === complaint.legalStage)
      .map((remedy) => remedy.kind),
    precautionaryRequestedOn:
      state.precautionary !== null && state.precautionary.decidedOn === null
        ? state.precautionary.requestedOn
        : null,
    reclassificationOrderedOn: state.reclassificationOrderedOn,
    isSeriousTrack: isSeriousTrack(ctx, complaint, state),
  };
}

/** La denuncia va por la rama del Tribunal: falta grave o de particulares que no se devolvió. */
function isSeriousTrack(
  ctx: AppContext,
  complaint: ComplaintRecord,
  state: LifecycleState,
): boolean {
  if (state.returnedByCourt) return false;
  const qualification = ctx.qualifications.lastQualification(complaint.folio);
  if (qualification !== null) return qualification.severity === 'serious';
  return offenseSeverity(complaint.facts.offenseCode) !== 'non_serious';
}

function authorityName(ctx: AppContext, authorityId: string): string {
  return ctx.authorities.authority(authorityId)?.name ?? 'otra autoridad';
}

/** La ventanilla única la turnó sola al recibirla: el paso siguiente es un turnado del sistema. */
function wentStraightToAuthority(step: StoredStep, next: StoredStep | undefined): boolean {
  return (
    step.action === 'received' &&
    next !== undefined &&
    next.action === 'routed' &&
    next.actorId === null &&
    next.legalOn === step.legalOn
  );
}

function stepView(
  ctx: AppContext,
  step: StoredStep,
  audience: ProcedureAudience,
  next?: StoredStep,
): ProcedureStep {
  const state = findManagementState(step.managementState);
  const criminal = criminalStageOfStep(step);
  const stageKey = criminal ?? step.legalStage;
  const stage = stageKey === null ? undefined : findLegalStage(stageKey);
  const reason = step.closureReason === null ? undefined : findClosureReason(step.closureReason);
  const name = authorityName(ctx, step.authorityId);
  const details = step.details ?? {};
  const remedy = details.remedyKind === undefined ? undefined : findRemedyKind(details.remedyKind);
  const remedyName = remedy?.name.toLowerCase() ?? 'recurso';
  const outcome =
    details.remedyOutcome === undefined ? undefined : findRemedyOutcome(details.remedyOutcome);
  const isOwnRemedy = details.remedyFiledBy === 'reporter';
  const titles: Record<StoredStep['action'], string> = {
    received: 'Recibida',
    routed: `Turnada a ${name}`,
    accepted: `Aceptada por ${name}`,
    reassigned: `Reasignada a ${name}`,
    returned_to_inbox: 'Devuelta al buzón general',
    stage_advanced: `Etapa: ${stage?.name ?? 'sin nombre'}`,
    closed: `Cerrada: ${reason?.name ?? 'sin motivo'}`,
    conflict_excused: 'La autoridad se excusó por un posible conflicto de interés',
    conflict_justified: 'La autoridad explicó por qué no tiene conflicto de interés',
    transferred: `Turnada a ${name}, en otro nodo de la red`,
    appeal_filed: 'Aviso de inconformidad (falta el escrito con firma)',
    abstention_declared: 'La autoridad se abstuvo de iniciar el procedimiento',
    report_not_filed: 'El informe se tuvo por no presentado y volvió a la investigación',
    returned_by_court: 'El Tribunal devolvió el expediente: no es falta grave',
    reclassification_ordered: 'El Tribunal ordenó reclasificar la falta',
    precautionary_requested: 'Se pidió una medida cautelar',
    precautionary_decided:
      details.precautionaryOutcome === 'denied'
        ? 'Se resolvió la medida cautelar'
        : 'Se dictaron medidas para proteger la investigación',
    remedy_filed:
      remedy?.key === 'inconformity'
        ? 'Inconformidad presentada con firma'
        : audience === 'reporter' && !isOwnRemedy
          ? `Se presentó un recurso de ${remedyName}`
          : `Recurso de ${remedyName} presentado`,
    remedy_resolved: `Recurso de ${remedyName}: ${outcome?.name.toLowerCase() ?? 'resuelto'}`,
    criminal_referral_filed: 'Se dio vista al Ministerio Público (denuncia penal)',
    federal_funds_flagged: 'La denuncia involucra recursos federales',
    federal_notice_sent: 'Se dio aviso a las autoridades federales',
    sanction_registered: 'Sanción inscrita en el registro de sancionados (S3)',
    withdrawal_received: 'Se recibió un escrito de desistimiento',
  };
  if (step.action === 'stage_advanced' && criminal !== null) {
    titles.stage_advanced = `Vía penal: ${stage?.name ?? 'sin nombre'}`;
  }
  if (details.recordedForCourt === true) {
    titles[step.action] = `Registro de actuación del Tribunal: ${titles[step.action]}`;
  }
  const explanations: Partial<Record<StoredStep['action'], string>> = {
    ...(wentStraightToAuthority(step, next)
      ? {
          received:
            'Tu denuncia llegó al nodo y la ventanilla única la envió directo a la autoridad competente según el directorio de la red.',
        }
      : {}),
    stage_advanced: stage?.explanation ?? '',
    closed: reason?.explanation ?? '',
    conflict_excused:
      'Quien recibió tu denuncia declaró que podría tener un conflicto de interés y se excusó, como pide la ley (LGRA, art. 58). Otra persona o autoridad debe atenderla.',
    conflict_justified:
      'El sistema avisó de un posible conflicto de interés y la autoridad explicó por qué no lo hay (LGRA, art. 58). Su explicación queda registrada.',
    transferred:
      'Tu denuncia pasó a una autoridad de otro nodo de la red. Viajó cifrada: nadie en medio pudo leerla.',
    appeal_filed:
      'Diste el aviso de inconformidad desde este seguimiento. Todavía no es el recurso: para que cuente, entrega el escrito con tu nombre, domicilio y firma autógrafa ante la autoridad investigadora dentro del plazo (LGRA, arts. 103, 104 y 109); sin firma no se tiene por presentado. Cuando la autoridad registre que lo recibió firmado, lo envía a la Sala, que resuelve en 30 días hábiles (art. 107). Abriste tu identidad solo para el recurso: queda registrado quién la abrió, cuándo y para qué.',
    abstention_declared: findLegalStage('abstention')?.explanation ?? '',
    report_not_filed: findLegalStage('report_prevented')?.explanation ?? '',
    returned_by_court:
      'El Tribunal revisó el expediente y consideró que la falta no es grave: lo devolvió a la autoridad substanciadora, que sigue el procedimiento de falta no grave (LGRA, art. 209 fr. II).',
    reclassification_ordered:
      'El Tribunal consideró que es otra falta grave y ordenó a la autoridad investigadora reclasificarla en 3 días hábiles (LGRA, art. 209 fr. II).',
    precautionary_requested:
      'La autoridad investigadora pidió una medida para proteger la investigación (LGRA, arts. 123 y 124). Se da vista a quienes afecta y se resuelve en 5 días hábiles.',
    precautionary_decided:
      'La autoridad resolvió una medida cautelar para proteger la investigación (LGRA, arts. 123 a 129). Los detalles son reservados.',
    remedy_filed: remedy === undefined ? '' : `${remedy.effect} ${remedy.against}`,
    remedy_resolved: outcome?.explanation ?? '',
    criminal_referral_filed: findLegalStage('criminal_complaint_filed')?.explanation ?? '',
    federal_funds_flagged: `${FEDERAL_FUNDS_RULE.notice} Las responsabilidades por esos recursos las determinan las autoridades federales (Ley de Coordinación Fiscal, art. 49).`,
    federal_notice_sent:
      'La autoridad avisó a las autoridades federales competentes porque la denuncia involucra recursos federales (Ley de Coordinación Fiscal, art. 49).',
    sanction_registered:
      'La sanción firme se inscribió en el sistema de servidores públicos y particulares sancionados de la Plataforma Digital Nacional (LGRA, art. 27).',
    withdrawal_received:
      'Quedó registrado el escrito de desistimiento. La investigación también es de oficio: retirar la denuncia no obliga a cerrarla si hay elementos (LGRA, arts. 91 y 94).',
  };
  if (details.recordedForCourt === true) {
    const base = explanations[step.action] ?? stage?.explanation ?? '';
    explanations[step.action] =
      `${base} Este acto lo registró la autoridad substanciadora, con el número de expediente del Tribunal, porque el Tribunal no tiene cuenta en el sistema.`.trim();
  }
  const explanation = explanations[step.action] ?? state?.explanation ?? '';
  return {
    on: step.on,
    legalOn: step.legalOn,
    action: step.action,
    managementState: step.managementState,
    ...(step.legalStage === null ? {} : { legalStage: step.legalStage }),
    ...(step.closureReason === null ? {} : { closureReason: step.closureReason }),
    title: titles[step.action],
    explanation,
    ...(step.note === null ? {} : { note: step.note }),
    ...recordOf(details, audience),
  };
}

/** Datos del acto que puede ver cada audiencia. */
function recordOf(
  details: NonNullable<StoredStep['details']>,
  audience: ProcedureAudience,
): { record?: ProcedureStepRecord } {
  const record: ProcedureStepRecord = {
    ...(details.recordedForCourt === true ? { recordedForCourt: true as const } : {}),
    ...(details.courtFileNumber === undefined ? {} : { courtFileNumber: details.courtFileNumber }),
    ...(details.legalBasis === undefined ? {} : { legalBasis: details.legalBasis }),
    ...(details.remedyKind === undefined ? {} : { remedyKind: details.remedyKind }),
    ...(details.remedyOutcome === undefined ? {} : { remedyOutcome: details.remedyOutcome }),
    // Seguridad (B14): la persona denunciante solo ve quién recurrió si fue ella.
    ...(details.remedyFiledBy === undefined ||
    (audience === 'reporter' && details.remedyFiledBy !== 'reporter')
      ? {}
      : { remedyFiledBy: details.remedyFiledBy }),
    // La medida cautelar concreta es reservada: la persona solo ve que se dictaron medidas.
    ...(details.precautionaryOutcome === undefined || audience === 'reporter'
      ? {}
      : { precautionaryOutcome: details.precautionaryOutcome }),
    ...(details.criminalStage === undefined ? {} : { criminalStage: details.criminalStage }),
    ...(details.legalOutcome === undefined ? {} : { legalOutcome: details.legalOutcome }),
    ...(details.destination === undefined ? {} : { destination: details.destination }),
    ...(details.funding === undefined ? {} : { funding: details.funding }),
    ...(details.recipients === undefined ? {} : { recipients: details.recipients }),
    ...(details.prosecutor === undefined ? {} : { prosecutor: details.prosecutor }),
    ...(details.registryReference === undefined
      ? {}
      : { registryReference: details.registryReference }),
  };
  return Object.keys(record).length === 0 ? {} : { record };
}

/** Pasos que la persona denunciante no ve: la petición de una medida cautelar (reservada). */
function isVisibleTo(step: StoredStep, audience: ProcedureAudience): boolean {
  if (audience === 'authority') return true;
  if (step.action === 'precautionary_requested') return false;
  // Una medida negada no se anuncia a la persona; una concedida, sí, sin detalles.
  return !(
    step.action === 'precautionary_decided' && step.details?.precautionaryOutcome === 'denied'
  );
}

/** Recursos del trámite con su situación. */
function remedyViews(
  state: LifecycleState,
  ctx: AppContext,
  audience: ProcedureAudience,
): RemedyView[] {
  return state.remedies.map((remedy) => {
    const kind = findRemedyKind(remedy.kind);
    const outcome = remedy.outcome === null ? undefined : findRemedyOutcome(remedy.outcome);
    const deadline = kind?.resolutionDeadline;
    let resolutionDueOn: string | null = null;
    if (deadline !== undefined && remedy.status !== 'resolved') {
      try {
        resolutionDueOn = evaluateDeadline(deadline, remedy.filedOn, remedy.filedOn, {
          calendar: nodeCalendar(ctx),
        }).dueOn;
      } catch {
        resolutionDueOn = null;
      }
    }
    return {
      kind: remedy.kind,
      name: kind?.name ?? remedy.kind,
      filedOn: remedy.filedOn,
      ...(audience === 'authority' || remedy.filedBy === 'reporter'
        ? { filedBy: remedy.filedBy }
        : {}),
      status: remedy.status,
      ...(remedy.outcome === null ? {} : { outcome: remedy.outcome }),
      ...(outcome === undefined ? {} : { outcomeName: outcome.name }),
      ...(remedy.resolvedOn === null ? {} : { resolvedOn: remedy.resolvedOn }),
      ...(resolutionDueOn === null ? {} : { resolutionDueOn }),
      effect: kind?.effect ?? '',
    };
  });
}

function deadlineViews(ctx: AppContext, complaint: ComplaintRecord, today: string): DeadlineView[] {
  const snapshot = procedureSnapshot(ctx, complaint);
  const isAccepted = complaint.managementState === 'accepted';
  return activeDeadlines(snapshot, { isAccepted }).flatMap((deadline) => {
    const rule = findDeadlineRule(deadline.key);
    if (rule === undefined) return [];
    try {
      const evaluation = evaluateDeadline(deadline.key, deadline.startsOn, today, {
        calendar: nodeCalendar(ctx),
      });
      return [
        {
          key: deadline.key,
          name: rule.name,
          explanation: rule.explanation,
          startsOn: deadline.startsOn,
          dueOn: evaluation.dueOn,
          status: evaluation.status,
          remaining: evaluation.remaining,
          remainingUnit: evaluation.remainingUnit,
          legalBasis: rule.legalBasis.map(describeLegalReference),
        },
      ];
    } catch {
      // Fuera del calendario de días inhábiles no se puede calcular un plazo en días hábiles.
      return [];
    }
  });
}

function qualificationOf(ctx: AppContext, complaint: ComplaintRecord) {
  const view = qualificationView(ctx, complaint);
  return view === null ? {} : { qualification: view };
}

function sanctionOf(ctx: AppContext, folio: string) {
  const check = sanctionCheckView(ctx, folio);
  return check === null ? {} : { sanctionCheck: check };
}

/** Regla cumplida con su nombre y su explicación pública. */
export function ruleTriggerView(trigger: StoredRuleTrigger): RuleTriggerView {
  const rule = findEscalationRule(trigger.ruleKey);
  return {
    on: trigger.triggeredOn,
    ruleKey: trigger.ruleKey,
    name: rule?.name ?? trigger.ruleKey,
    explanation: rule?.explanation ?? '',
    effect: trigger.effect,
    dueOn: trigger.dueOn,
  };
}

/**
 * Vista del trámite: estado actual con su explicación, línea de tiempo, cierre con su acuerdo en
 * versión pública, plazos que corren y reglas cumplidas. Los plazos se calculan con el día legal
 * de hoy (hora del centro de México).
 */
export function buildProcedureView(
  ctx: AppContext,
  complaint: ComplaintRecord,
  audience: ProcedureAudience = 'authority',
): ProcedureView {
  const state = findManagementState(complaint.managementState);
  const stage = complaint.legalStage === null ? undefined : findLegalStage(complaint.legalStage);
  const criminal =
    complaint.criminalStage === null ? undefined : findLegalStage(complaint.criminalStage);
  const lifecycle = lifecycleOf(ctx, complaint);
  const legalOutcome =
    complaint.managementState === 'closed'
      ? (ctx.procedure.lastClosure(complaint.folio)?.legalOutcome ?? null)
      : null;
  const outcomeOption = legalOutcome === null ? undefined : findLegalClosureReason(legalOutcome);
  const abstention = abstentionView(ctx, complaint);
  const inconformity = inconformityView(ctx, complaint);
  const remedies = remedyViews(lifecycle, ctx, audience);
  const funding =
    complaint.fundingSource === null
      ? undefined
      : FEDERAL_FUNDS_RULE.fundings.find((item) => item.key === complaint.fundingSource);
  const closure =
    complaint.managementState === 'closed' ? ctx.procedure.lastClosure(complaint.folio) : null;
  const reason =
    closure === null ? undefined : CLOSURE_REASONS.find((r) => r.key === closure.reason);
  const today = toMexicoCentralDay(ctx.deps.now());
  return {
    managementState: complaint.managementState,
    managementStateName: state?.name ?? complaint.managementState,
    explanation: state?.explanation ?? '',
    ...(complaint.legalStage === null || stage === undefined
      ? {}
      : { legalStage: complaint.legalStage, legalStageName: stage.name }),
    ...(complaint.criminalStage === null || criminal === undefined
      ? {}
      : { criminalStage: complaint.criminalStage, criminalStageName: criminal.name }),
    ...(closure === null || reason === undefined
      ? {}
      : {
          closure: {
            on: closure.on,
            legalOn: closure.legalOn,
            reason: closure.reason,
            reasonName: reason.name,
            reasonExplanation: reason.explanation,
            legalBasis: closure.legalBasis,
            agreement: closure.agreement,
            ...sanctionOf(ctx, complaint.folio),
            ...(outcomeOption === undefined
              ? {}
              : {
                  legalOutcome: outcomeOption.key,
                  legalOutcomeName: outcomeOption.name,
                  legalOutcomeExplanation: outcomeOption.explanation,
                }),
            ...(closure.destination === null ? {} : { destination: closure.destination }),
          },
        }),
    ...qualificationOf(ctx, complaint),
    ...(abstention === null ? {} : { abstention }),
    ...(inconformity === null ? {} : { inconformity }),
    ...(remedies.length === 0 ? {} : { remedies }),
    ...(lifecycle.precautionary === null ||
    (audience === 'reporter' &&
      (lifecycle.precautionary.outcome === null || lifecycle.precautionary.outcome === 'denied'))
      ? {}
      : {
          precautionary: {
            requestedOn: lifecycle.precautionary.requestedOn,
            ...(lifecycle.precautionary.decidedOn === null
              ? {}
              : { decidedOn: lifecycle.precautionary.decidedOn }),
            ...(lifecycle.precautionary.outcome === null
              ? {}
              : { outcome: lifecycle.precautionary.outcome }),
          },
        }),
    ...(funding === undefined || lifecycle.federal === null
      ? {}
      : {
          federalFunds: {
            funding: funding.key,
            fundingName: funding.name,
            flaggedOn: lifecycle.federal.flaggedOn,
            ...(lifecycle.federal.noticeSentOn === null
              ? {}
              : { noticeSentOn: lifecycle.federal.noticeSentOn }),
          },
        }),
    ...(audience === 'authority' ? { courtRecording: !hasCourtAccounts(ctx) } : {}),
    ...(lifecycle.sanctionRegistered === null
      ? {}
      : { sanctionRegistered: lifecycle.sanctionRegistered }),
    steps: ctx.procedure
      .listSteps(complaint.folio)
      .filter((step) => isVisibleTo(step, audience))
      .map((step, index, visible) => stepView(ctx, step, audience, visible[index + 1])),
    deadlines: deadlineViews(ctx, complaint, today),
    rules: ctx.procedure.listRuleTriggers(complaint.folio).map(ruleTriggerView),
  };
}
