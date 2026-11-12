// Vista del trámite para el seguimiento y el panel: línea de tiempo con explicaciones sencillas,
// plazos legales con su situación (en curso, por vencer, vencido) y reglas públicas cumplidas.
// También arma los hechos del trámite con los que se evalúan las reglas.
import {
  CLOSURE_REASONS,
  describeLegalReference,
  findClosureReason,
  findDeadlineRule,
  findEscalationRule,
  findLegalStage,
  findManagementState,
  offenseSeverity,
} from '@sigilo/contracts';
import type {
  DeadlineView,
  ProcedureStep,
  ProcedureView,
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
import { assignedAuthorityOf } from './procedure-service.ts';
import { turnPendingSince } from './turn-semaphore.ts';

/** Día legal (hora del centro) de un mensaje fechado a la hora en UTC (`AAAA-MM-DDTHH:00Z`). */
function legalDayOfHour(hour: string): string {
  return toMexicoCentralDay(new Date(Date.parse(hour.replace(/Z$/u, ':00Z'))));
}

function isFirstStage(step: StoredStep): boolean {
  return (
    step.action === 'stage_advanced' &&
    (step.legalStage === 'investigation' || step.legalStage === 'criminal_investigation')
  );
}

function isQualificationOrLater(step: StoredStep): boolean {
  if (step.action !== 'stage_advanced' || step.legalStage === null) return false;
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
  };
}

function authorityName(ctx: AppContext, authorityId: string): string {
  return ctx.authorities.authority(authorityId)?.name ?? 'otra autoridad';
}

function stepView(ctx: AppContext, step: StoredStep): ProcedureStep {
  const state = findManagementState(step.managementState);
  const stage = step.legalStage === null ? undefined : findLegalStage(step.legalStage);
  const reason = step.closureReason === null ? undefined : findClosureReason(step.closureReason);
  const name = authorityName(ctx, step.authorityId);
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
    appeal_filed: 'Presentaste tu inconformidad contra la calificación',
  };
  const explanations: Partial<Record<StoredStep['action'], string>> = {
    stage_advanced: stage?.explanation ?? '',
    closed: reason?.explanation ?? '',
    conflict_excused:
      'Quien recibió tu denuncia declaró que podría tener un conflicto de interés y se excusó, como pide la ley (LGRA, art. 58). Otra persona o autoridad debe atenderla.',
    conflict_justified:
      'El sistema avisó de un posible conflicto de interés y la autoridad explicó por qué no lo hay (LGRA, art. 58). Su explicación queda registrada.',
    transferred:
      'Tu denuncia pasó a una autoridad de otro nodo de la red. Viajó cifrada: nadie en medio pudo leerla.',
    appeal_filed:
      'Te inconformaste ante la autoridad investigadora, que debe enviar el recurso con el expediente y su informe a la Sala Especializada en Responsabilidades Administrativas (LGRA, art. 104). La Sala resuelve en un plazo no mayor a 30 días hábiles (art. 107). Mientras tanto, no se inicia el procedimiento de responsabilidad (art. 102). Abriste tu identidad solo para el recurso: queda registrado quién la abrió, cuándo y para qué.',
  };
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
  };
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
export function buildProcedureView(ctx: AppContext, complaint: ComplaintRecord): ProcedureView {
  const state = findManagementState(complaint.managementState);
  const stage = complaint.legalStage === null ? undefined : findLegalStage(complaint.legalStage);
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
          },
        }),
    ...qualificationOf(ctx, complaint),
    steps: ctx.procedure.listSteps(complaint.folio).map((step) => stepView(ctx, step)),
    deadlines: deadlineViews(ctx, complaint, today),
    rules: ctx.procedure.listRuleTriggers(complaint.folio).map(ruleTriggerView),
  };
}
