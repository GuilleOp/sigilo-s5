// Evaluación pura de las reglas públicas de escalamiento y de alerta (`ESCALATION_RULES`) y de los
// plazos legales que corren para una denuncia. Con los mismos datos del trámite, cualquiera obtiene
// el mismo resultado. Todos los días son días civiles en la hora del centro de México.
import { ESCALATION_RULES, POST_ADMISSION_STAGES } from '@sigilo/contracts';
import type {
  ClosureReason,
  ComplaintMode,
  DeadlineKey,
  EscalationRule,
  EscalationRuleKey,
  LegalStage,
  OffenseSeverity,
  QualificationSeverity,
  RuleEffect,
} from '@sigilo/contracts';
import { DEFAULT_BUSINESS_CALENDAR, addCalendarMonths, computeDueDate } from './deadlines.ts';
import type { BusinessCalendar } from './deadlines.ts';

/**
 * Hechos del trámite con los que se evalúan las reglas. Las fechas son días legales
 * (`toMexicoCentralDay`); `null` si el hecho no ha ocurrido.
 */
export interface ProcedureSnapshot {
  receivedOn: string;
  mode: ComplaintMode;
  severity: OffenseSeverity;
  /** Mes aproximado de los hechos (`AAAA-MM`). */
  occurredPeriod: string;
  investigationStartedOn: string | null;
  qualifiedOn: string | null;
  closedOn: string | null;
  closureReason: ClosureReason | null;
  /** Primer aviso por el buzón de la autoridad después del archivo. */
  archiveNotifiedOn: string | null;
  /** Última actuación de la autoridad (o la recepción si no hay ninguna). */
  lastActivityOn: string;
  /** Día de la alerta de posible conflicto de interés en la autoridad que tiene la denuncia. */
  conflictAlertOn?: string | null;
  /** Día en que esa autoridad se excusó (LGRA, art. 58). */
  conflictExcusedOn?: string | null;
  /** Día en que esa autoridad justificó, en lugar de excusarse, por qué no hay conflicto. */
  conflictJustifiedOn?: string | null;
  /** Señales AUD-01 y AUD-02 del auditor sobre el archivo vigente. */
  archiveSignalCount?: number;
  /** Etapa legal vigente. */
  legalStage?: LegalStage | null;
  /** Calificación registrada con su acuerdo (LGRA, art. 100), si la hay. */
  qualificationSeverity?: QualificationSeverity | null;
  /** Día legal del acuerdo de calificación. */
  qualificationOn?: string | null;
  /** Primer aviso por el buzón después de la calificación de no grave (LGRA, art. 102). */
  qualificationNotifiedOn?: string | null;
  /** Día en que se presentó la inconformidad (LGRA, art. 103). */
  appealFiledOn?: string | null;
  /** Día del turnado a otro nodo que sigue sin comprobante válido del destino. */
  transferPendingOn?: string | null;
  /** Señales AUD-01, AUD-03 y AUD-04 del auditor sobre la calificación. */
  downgradeSignalCount?: number;
}

/** Regla cumplida: desde qué día corrió, cuándo vencía y su efecto. */
export interface TriggeredRule {
  key: EscalationRuleKey;
  effect: RuleEffect;
  anchorOn: string;
  dueOn: string;
}

/** Plazo legal que corre para la denuncia y desde qué día. */
export interface ActiveDeadline {
  key: DeadlineKey;
  startsOn: string;
}

/** Señales del auditor sobre un archivo a partir de las cuales se escala (docs/demo-escenario.md, 6.6). */
export const ARCHIVE_SIGNAL_THRESHOLD = 2;

/** Señales del auditor sobre una calificación de no grave a partir de las cuales se escala. */
export const DOWNGRADE_SIGNAL_THRESHOLD = 2;

const SERIOUS: readonly OffenseSeverity[] = ['serious', 'private_party', 'crime'];

/** Motivos de cierre que declinan la denuncia: canalizada, improcedente o acumulada. */
export const DECLINING_REASONS: readonly ClosureReason[] = ['channeled', 'inadmissible', 'joined'];

function isDeclining(reason: ClosureReason | null): boolean {
  return reason !== null && DECLINING_REASONS.includes(reason);
}

/** Día de la calificación de no grave de una conducta grave, o `null`. */
function downgradedOn(snapshot: ProcedureSnapshot): string | null {
  const isDowngrade =
    snapshot.qualificationSeverity === 'non_serious' && SERIOUS.includes(snapshot.severity);
  return isDowngrade ? (snapshot.qualificationOn ?? null) : null;
}

/** Primer día del mes de los hechos: el más temprano posible, para no alertar tarde. */
function occurredStart(period: string): string {
  return `${period}-01`;
}

/** Años de prescripción: 3 si la falta no es grave y 7 en los demás casos (LGRA, art. 74). */
function prescriptionYears(severity: OffenseSeverity): number {
  return severity === 'non_serious' ? 3 : 7;
}

function anchorOf(rule: EscalationRule, snapshot: ProcedureSnapshot): string | null {
  switch (rule.anchor) {
    case 'received':
      return snapshot.receivedOn;
    case 'archived':
      return snapshot.closureReason === 'insufficient_information' ? snapshot.closedOn : null;
    case 'closed':
      return snapshot.closedOn;
    case 'resolutive': {
      const days = [snapshot.qualificationOn ?? null, snapshot.closedOn].filter(
        (day): day is string => day !== null,
      );
      return days.length === 0 ? null : ([...days].sort()[0] ?? null);
    }
    case 'downgraded':
      return downgradedOn(snapshot);
    case 'declined':
      return isDeclining(snapshot.closureReason) ? snapshot.closedOn : null;
    case 'archived_or_declined':
      return snapshot.closureReason === 'insufficient_information' ||
        isDeclining(snapshot.closureReason)
        ? snapshot.closedOn
        : null;
    case 'conflict_justified':
      return snapshot.conflictJustifiedOn ?? null;
    case 'transfer_pending':
      return snapshot.transferPendingOn ?? null;
    case 'last_activity':
      return snapshot.lastActivityOn;
    case 'prescription':
      return occurredStart(snapshot.occurredPeriod);
  }
}

function dueOnOf(
  rule: EscalationRule,
  anchor: string,
  snapshot: ProcedureSnapshot,
  calendar: BusinessCalendar,
): string {
  if (rule.anchor !== 'prescription') return computeDueDate(anchor, rule.term, calendar);
  // El plazo de la regla se cuenta antes de la prescripción: N meses antes de los años de ley.
  const months = prescriptionYears(snapshot.severity) * 12 - rule.term.amount;
  return addCalendarMonths(anchor, Math.max(months, 0));
}

/** Día en que se cumplió el primer hecho que deja sin efecto la regla, o `null`. */
function satisfiedOn(rule: EscalationRule, snapshot: ProcedureSnapshot): string | null {
  const days = rule.satisfiedBy.flatMap((satisfier) => {
    switch (satisfier.fact) {
      case 'investigation_started':
        return snapshot.investigationStartedOn === null ? [] : [snapshot.investigationStartedOn];
      case 'qualified':
        return snapshot.qualifiedOn === null ? [] : [snapshot.qualifiedOn];
      case 'archive_notified':
        return snapshot.archiveNotifiedOn === null ? [] : [snapshot.archiveNotifiedOn];
      case 'conflict_excused':
        return (snapshot.conflictExcusedOn ?? null) === null
          ? []
          : [snapshot.conflictExcusedOn ?? ''];
      case 'closed': {
        if (snapshot.closedOn === null || snapshot.closureReason === null) return [];
        const isListed =
          satisfier.reasons === undefined || satisfier.reasons.includes(snapshot.closureReason);
        return isListed ? [snapshot.closedOn] : [];
      }
    }
  });
  return days.length === 0 ? null : ([...days].sort()[0] ?? null);
}

function applies(rule: EscalationRule, snapshot: ProcedureSnapshot): boolean {
  const isSeverity = rule.severities === undefined || rule.severities.includes(snapshot.severity);
  const isMode = rule.modes === undefined || rule.modes.includes(snapshot.mode);
  const requirements: Record<NonNullable<EscalationRule['requires']>, boolean> = {
    conflict_alert: (snapshot.conflictAlertOn ?? null) !== null,
    archive_signals: (snapshot.archiveSignalCount ?? 0) >= ARCHIVE_SIGNAL_THRESHOLD,
    downgrade_signals: (snapshot.downgradeSignalCount ?? 0) >= DOWNGRADE_SIGNAL_THRESHOLD,
  };
  const isRequired = rule.requires === undefined || requirements[rule.requires];
  const stage = snapshot.legalStage ?? null;
  const isStage =
    (rule.stages === undefined || (stage !== null && rule.stages.includes(stage))) &&
    (rule.exceptStages === undefined || stage === null || !rule.exceptStages.includes(stage));
  return isSeverity && isMode && isRequired && isStage;
}

/**
 * Reglas que se cumplen el día `today`. Una regla `overdue` se cumple desde el día siguiente a su
 * vencimiento y una `reached`, desde el mismo día. Un hecho que la satisface a más tardar el día
 * del vencimiento la deja sin efecto; uno posterior no, porque el plazo ya se había incumplido.
 * Lanza si un plazo en días hábiles sale del calendario.
 */
export function evaluateEscalationRules(
  snapshot: ProcedureSnapshot,
  today: string,
  options: { calendar?: BusinessCalendar; rules?: readonly EscalationRule[] } = {},
): TriggeredRule[] {
  const calendar = options.calendar ?? DEFAULT_BUSINESS_CALENDAR;
  const triggered: TriggeredRule[] = [];
  for (const rule of options.rules ?? ESCALATION_RULES) {
    if (!applies(rule, snapshot)) continue;
    const anchorOn = anchorOf(rule, snapshot);
    if (anchorOn === null) continue;
    const dueOn = dueOnOf(rule, anchorOn, snapshot, calendar);
    const satisfied = satisfiedOn(rule, snapshot);
    if (satisfied !== null && satisfied <= dueOn) continue;
    const isDue = rule.firesWhen === 'overdue' ? today > dueOn : today >= dueOn;
    if (isDue) triggered.push({ key: rule.key, effect: rule.effect, anchorOn, dueOn });
  }
  return triggered;
}

/**
 * Plazos legales del catálogo `DEADLINE_RULES` que corren para la denuncia, con el día desde el
 * que cuentan: iniciar ante una posible falta grave (mientras no inicie el procedimiento correspondiente ni se
 * cierre), notificar el archivo a quien es identificable (mientras no haya aviso), la prescripción
 * (mientras no haya calificación ni cierre), la inconformidad contra la calificación de no grave
 * (desde su notificación, mientras no se presente), su resolución por la Sala (desde que se
 * presenta) y la caducidad de la instancia (solo después de admitido el informe, LGRA art. 74).
 */
export function activeDeadlines(
  snapshot: ProcedureSnapshot,
  options: { isAccepted: boolean },
): ActiveDeadline[] {
  const deadlines: ActiveDeadline[] = [];
  const isClosed = snapshot.closedOn !== null;
  const isSerious = snapshot.severity !== 'non_serious';
  if (isSerious && snapshot.investigationStartedOn === null && !isClosed) {
    deadlines.push({ key: 'serious_offense_start', startsOn: snapshot.receivedOn });
  }
  const isArchived = snapshot.closureReason === 'insufficient_information';
  if (isArchived && snapshot.closedOn !== null && snapshot.mode === 'sealed') {
    if (snapshot.archiveNotifiedOn === null) {
      deadlines.push({ key: 'archive_notification', startsOn: snapshot.closedOn });
    }
  }
  if (!isClosed && snapshot.qualifiedOn === null) {
    deadlines.push({
      key: isSerious ? 'prescription_serious' : 'prescription_non_serious',
      startsOn: occurredStart(snapshot.occurredPeriod),
    });
  }
  const isNonSerious = snapshot.qualificationSeverity === 'non_serious';
  const appealFiledOn = snapshot.appealFiledOn ?? null;
  const notifiedOn = snapshot.qualificationNotifiedOn ?? null;
  if (isNonSerious && snapshot.mode === 'sealed' && appealFiledOn === null && notifiedOn !== null) {
    deadlines.push({ key: 'appeal_filing', startsOn: notifiedOn });
  }
  if (appealFiledOn !== null) {
    deadlines.push({ key: 'appeal_resolution', startsOn: appealFiledOn });
  }
  const stage = snapshot.legalStage ?? null;
  const isAdmitted = stage !== null && POST_ADMISSION_STAGES.includes(stage);
  if (options.isAccepted && !isClosed && isAdmitted) {
    deadlines.push({ key: 'inactivity_expiry', startsOn: snapshot.lastActivityOn });
  }
  return deadlines;
}
