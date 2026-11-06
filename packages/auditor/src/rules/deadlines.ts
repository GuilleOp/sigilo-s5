// AUD-04 plazos vencidos o por vencer, AUD-05 actuación vacía tras inactividad y AUD-08 movimiento
// justo antes de prescribir. Reutiliza el catálogo DEADLINE_RULES y el cálculo de @sigilo/core.
import { findDeadlineRule, PROCEDURE_LAW_NAMES } from '@sigilo/contracts';
import type { DeadlineKey, LegalReference } from '@sigilo/contracts';
import { addDays, classifyOffense, daysBetween } from '@sigilo/contexto-pdn';
import {
  addCalendarMonths,
  computeDueDate,
  DEFAULT_BUSINESS_CALENDAR,
  evaluateDeadline,
  termForRule,
} from '@sigilo/core';
import type { BusinessCalendar } from '@sigilo/core';
import { AUDITOR_CONFIG, RULES_VERSION } from '../config.ts';
import type { AuditorConfig } from '../config.ts';
import { SIGNAL_NOTE } from '../signal.ts';
import type { AuditSignal, CaseActivity, CaseRecord } from '../types.ts';

function rule(key: DeadlineKey) {
  const found = findDeadlineRule(key);
  if (found === undefined) throw new Error('Plazo desconocido en el catálogo.');
  return found;
}

function cite(references: readonly LegalReference[]): string {
  return references
    .map(
      (item) =>
        `${item.law}, art. ${item.article}${item.fraction === undefined ? '' : `, fr. ${item.fraction}`}`,
    )
    .join('; ');
}

// Los días hábiles dependen de un calendario con cobertura limitada: fuera de ella no se opina.
function safeEvaluate(
  key: DeadlineKey,
  start: string,
  today: string,
  calendar: BusinessCalendar,
): ReturnType<typeof evaluateDeadline> | null {
  try {
    return evaluateDeadline(key, start, today, { calendar });
  } catch {
    return null;
  }
}

function isSerious(record: CaseRecord): boolean {
  const severity = classifyOffense(record.offenseCode);
  return severity === 'grave' || severity === 'crime';
}

function sorted(activities: readonly CaseActivity[]): CaseActivity[] {
  return [...activities].sort((left, right) => left.on.localeCompare(right.on));
}

function isClosed(record: CaseRecord): boolean {
  const ordered = sorted(record.activities);
  const lastClosure = ordered.findLastIndex((item) => item.kind === 'closure');
  const lastReopen = ordered.findLastIndex((item) => item.kind === 'reopened');
  return lastClosure >= 0 && lastClosure > lastReopen;
}

function deadlineSignal(
  record: CaseRecord,
  key: DeadlineKey,
  status: 'due_soon' | 'overdue',
  dueOn: string,
  detail: string,
  actText: string | null,
  metrics: Record<string, number>,
): AuditSignal {
  const item = rule(key);
  const overdue = status === 'overdue';
  return {
    ruleId: 'AUD-04',
    key: 'signal.deadline',
    name: `${overdue ? 'Plazo vencido' : 'Plazo por vencer'}: ${item.name.toLowerCase()}`,
    explanation: `${item.explanation} ${detail}`,
    subject: { kind: 'case', id: record.caseRef, authorityId: record.authorityId },
    evidence: [
      {
        label: item.name,
        actText,
        counterpart:
          `Vence el ${dueOn}. ${item.startsFrom} ${overdue ? item.consequence : ''}`.trim(),
        counterpartSource: `Catálogo de plazos (${cite(item.legalBasis)}) y bitácora del nodo`,
      },
    ],
    basis: {
      references: item.legalBasis,
      text: `${cite(item.legalBasis)} (${item.legalBasis
        .map((reference) => PROCEDURE_LAW_NAMES[reference.law])
        .filter((name, index, all) => all.indexOf(name) === index)
        .join(
          '; ',
        )}). El cálculo usa la misma función de plazos del sistema; es una alerta, no una determinación legal.`,
    },
    note: SIGNAL_NOTE,
    source: 'rules',
    metrics: { ...metrics, isOverdue: overdue ? 1 : 0 },
    rulesVersion: RULES_VERSION,
  };
}

/** Día de la última admisión del Informe de Presunta Responsabilidad Administrativa, o `null`. */
export function reportAdmittedOn(record: CaseRecord): string | null {
  return sorted(record.activities).findLast((item) => item.kind === 'report_admitted')?.on ?? null;
}

/**
 * Señal de inactividad prolongada en la investigación (antes de admitido el informe). No cita la
 * caducidad: el art. 74 solo la prevé en el procedimiento de responsabilidad ya admitido el informe.
 */
function prolongedInactivitySignal(
  record: CaseRecord,
  lastWithContent: string,
  today: string,
  config: AuditorConfig['deadlines'],
): AuditSignal | null {
  const reachedOn = addCalendarMonths(lastWithContent, config.prolongedInactivityMonths);
  const remaining = daysBetween(today, reachedOn);
  if (remaining > config.inactivityWarningDays) return null;
  const overdue = remaining < 0;
  const idleDays = daysBetween(lastWithContent, today);
  return {
    ruleId: 'AUD-04',
    key: 'signal.prolonged-inactivity',
    name: overdue
      ? 'Inactividad prolongada en la investigación'
      : 'La investigación está por cumplir meses sin actuaciones',
    explanation:
      `La última actuación con contenido es del ${lastWithContent} (hace ${idleDays} días). ` +
      `Al ${reachedOn} se cumplen ${config.prolongedInactivityMonths} meses sin actuaciones con contenido. ` +
      'Mientras la investigación está detenida sigue corriendo el plazo de prescripción.',
    subject: { kind: 'case', id: record.caseRef, authorityId: record.authorityId },
    evidence: [
      {
        label: 'Inactividad en la investigación',
        actText: `Última actuación con contenido: ${lastWithContent}.`,
        counterpart: `${config.prolongedInactivityMonths} meses sin actuaciones con contenido se cumplen el ${reachedOn}. Aún no se registra la admisión del Informe de Presunta Responsabilidad Administrativa.`,
        counterpartSource: 'Bitácora del nodo y umbral publicado del auditor',
      },
    ],
    basis: {
      references: [{ law: 'LGRA', article: '74' }],
      text:
        'La prescripción corre desde los hechos y solo la interrumpe la calificación (LGRA, art. 74). ' +
        'La caducidad de la instancia del mismo artículo no aplica a la investigación: solo al procedimiento de responsabilidad ya admitido el informe. ' +
        `Regla publicada del prototipo: alerta desde ${config.inactivityWarningDays} días antes de cumplir ${config.prolongedInactivityMonths} meses sin actuaciones con contenido.`,
    },
    note: SIGNAL_NOTE,
    source: 'rules',
    metrics: { remainingDays: remaining, idleDays, isOverdue: overdue ? 1 : 0 },
    rulesVersion: RULES_VERSION,
  };
}

/**
 * AUD-04 sobre un caso en el día `today`: inicio del procedimiento ante una posible falta grave
 * (art. 64, fr. II), notificación del archivo (art. 100), inactividad prolongada en la
 * investigación y, solo después de admitido el informe, caducidad de la instancia (art. 74).
 */
export function detectDeadlineSignals(
  record: CaseRecord,
  today: string,
  calendar: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
  config: AuditorConfig['deadlines'] = AUDITOR_CONFIG.deadlines,
): AuditSignal[] {
  const signals: AuditSignal[] = [];
  const ordered = sorted(record.activities);

  // Iniciar el procedimiento correspondiente ante una posible falta grave: 30 días naturales
  // (art. 64, fr. II). `investigation_started` es el inicio que registra la autoridad.
  if (isSerious(record)) {
    const started = ordered.find(
      (item) => item.kind === 'investigation_started' && item.hasContent,
    );
    const evaluation = evaluateDeadline(
      'serious_offense_start',
      record.receivedOn,
      started?.on ?? today,
      {
        calendar,
      },
    );
    const isLate = started !== undefined && started.on > evaluation.dueOn;
    if (started === undefined && evaluation.status !== 'running') {
      const closure = ordered.find((item) => item.kind === 'closure');
      signals.push(
        deadlineSignal(
          record,
          'serious_offense_start',
          evaluation.status,
          evaluation.dueOn,
          closure === undefined
            ? 'No hay registro de que se haya iniciado el procedimiento correspondiente.'
            : `El caso se cerró el ${closure.on} sin registro de que se haya iniciado el procedimiento correspondiente.`,
          'Sin actuación de inicio del procedimiento correspondiente en la bitácora.',
          { remainingDays: evaluation.remaining },
        ),
      );
    } else if (started !== undefined && isLate) {
      signals.push(
        deadlineSignal(
          record,
          'serious_offense_start',
          'overdue',
          evaluation.dueOn,
          `El procedimiento correspondiente se inició el ${started.on}, ${daysBetween(evaluation.dueOn, started.on)} días después del plazo.`,
          `Inicio registrado el ${started.on}.`,
          { daysLate: daysBetween(evaluation.dueOn, started.on) },
        ),
      );
    }
  }

  // Notificación del archivo a quien es identificable: 10 días hábiles (art. 100).
  const closure = ordered.findLast((item) => item.kind === 'closure');
  const notified =
    closure === undefined
      ? undefined
      : ordered.find((item) => item.kind === 'archive_notified' && item.on >= closure.on);
  const evaluation =
    closure === undefined || !record.isReporterIdentifiable
      ? null
      : safeEvaluate('archive_notification', closure.on, notified?.on ?? today, calendar);
  if (closure !== undefined && evaluation !== null) {
    const isMissing = notified === undefined && evaluation.status !== 'running';
    const isLate = notified !== undefined && notified.on > evaluation.dueOn;
    if (isMissing || isLate) {
      signals.push(
        deadlineSignal(
          record,
          'archive_notification',
          isLate ? 'overdue' : evaluation.status === 'overdue' ? 'overdue' : 'due_soon',
          evaluation.dueOn,
          notified !== undefined
            ? `Se notificó el ${notified.on}, después del plazo.`
            : 'No hay registro de la notificación a la persona denunciante.',
          `Archivo registrado el ${closure.on}.`,
          { remainingDays: evaluation.remaining },
        ),
      );
    }
  }

  // Inactividad, solo en casos abiertos. Antes de admitido el informe es «inactividad prolongada»;
  // después, la caducidad de la instancia del art. 74 (la decreta la autoridad a solicitud del
  // presunto infractor, por eso es una alerta).
  if (!isClosed(record)) {
    const lastWithContent = ordered.findLast((item) => item.hasContent)?.on ?? record.receivedOn;
    const admittedOn = reportAdmittedOn(record);
    const evaluation =
      admittedOn === null
        ? null
        : evaluateDeadline(
            'inactivity_expiry',
            lastWithContent > admittedOn ? lastWithContent : admittedOn,
            today,
            { calendar },
          );
    if (evaluation === null) {
      const signal = prolongedInactivitySignal(record, lastWithContent, today, config);
      if (signal !== null) signals.push(signal);
    } else if (evaluation.status !== 'running') {
      signals.push(
        deadlineSignal(
          record,
          'inactivity_expiry',
          evaluation.status,
          evaluation.dueOn,
          `El Informe de Presunta Responsabilidad Administrativa se admitió el ${admittedOn ?? ''} y la última actuación con contenido es del ${lastWithContent}. La caducidad se decreta a solicitud del presunto infractor.`,
          `Última actuación con contenido: ${lastWithContent}.`,
          { remainingDays: evaluation.remaining },
        ),
      );
    }
  }
  return signals;
}

/**
 * AUD-05: actuaciones sin contenido registradas después de `emptyActivityAfterMonths` meses sin
 * actuaciones con contenido. Pueden aparentar actividad sin que el caso avance; después de admitido
 * el informe, además, pueden evitar la caducidad de la instancia (art. 74).
 */
export function detectEmptyActivity(
  record: CaseRecord,
  config: AuditorConfig['deadlines'] = AUDITOR_CONFIG.deadlines,
): AuditSignal[] {
  const ordered = sorted(record.activities);
  const signals: AuditSignal[] = [];
  let lastWithContent = record.receivedOn;
  for (const item of ordered) {
    if (item.hasContent) {
      lastWithContent = item.on;
      continue;
    }
    const threshold = addCalendarMonths(lastWithContent, config.emptyActivityAfterMonths);
    if (item.on < threshold) continue;
    const idleDays = daysBetween(lastWithContent, item.on);
    const admittedOn = reportAdmittedOn(record);
    const isProcedure = admittedOn !== null && item.on >= admittedOn;
    signals.push({
      ruleId: 'AUD-05',
      key: 'signal.empty-activity',
      name: 'Actuación sin contenido después de meses de inactividad',
      explanation:
        `El ${item.on} se registró una actuación sin contenido, ${idleDays} días después de la última actuación con contenido. ` +
        (isProcedure
          ? 'En el procedimiento de responsabilidad, una actuación así puede evitar la caducidad de la instancia sin que el caso avance.'
          : 'Una actuación así puede aparentar actividad en la investigación sin que el caso avance.'),
      subject: { kind: 'case', id: record.caseRef, authorityId: record.authorityId },
      evidence: [
        {
          label: 'Actuación sin contenido',
          actText: `Actuación «${item.kind}» del ${item.on}, sin texto, documento ni diligencia.`,
          counterpart: `Última actuación con contenido: ${lastWithContent} (${idleDays} días antes).`,
          counterpartSource: 'Bitácora del nodo',
        },
      ],
      basis: {
        references: [{ law: 'LGRA', article: '74' }],
        text:
          (isProcedure
            ? 'Admitido el informe, el procedimiento no puede detenerse más de seis meses sin causa justificada; la caducidad se decreta a solicitud del presunto infractor (LGRA, art. 74). '
            : 'En la investigación no hay caducidad de la instancia; la prescripción sigue corriendo y solo la interrumpe la calificación (LGRA, art. 74). ') +
          `Regla publicada: actuación sin contenido tras ${config.emptyActivityAfterMonths} meses o más sin actuaciones con contenido (ADR 0007 y 0009).`,
      },
      note: SIGNAL_NOTE,
      source: 'rules',
      metrics: { idleDays, isProcedure: isProcedure ? 1 : 0 },
      rulesVersion: RULES_VERSION,
    });
  }
  return signals;
}

/** Día probable de prescripción: desde el primer día del periodo de los hechos (lo más temprano). */
export function prescriptionDueOn(record: CaseRecord): { key: DeadlineKey; dueOn: string } {
  const key: DeadlineKey = isSerious(record) ? 'prescription_serious' : 'prescription_non_serious';
  const start = `${record.occurredPeriod}-01`;
  return { key, dueOn: computeDueDate(start, termForRule(rule(key))) };
}

/**
 * AUD-08: una actuación en los `windowDays` días previos a la prescripción, después de
 * `minPriorGapMonths` meses o más sin actuaciones. La calificación interrumpe la prescripción
 * (LGRA, art. 74): moverse solo al final puede ser legítimo, pero conviene revisarlo.
 */
export function detectPrePrescriptionActivity(
  record: CaseRecord,
  config: AuditorConfig['prePrescription'] = AUDITOR_CONFIG.prePrescription,
): AuditSignal | null {
  const { key, dueOn } = prescriptionDueOn(record);
  const windowStart = addDays(dueOn, -config.windowDays);
  const ordered = sorted(record.activities);
  let previous = record.receivedOn;
  for (const item of ordered) {
    const gapThreshold = addCalendarMonths(previous, config.minPriorGapMonths);
    if (item.on >= windowStart && item.on <= dueOn && item.on >= gapThreshold) {
      const daysBefore = daysBetween(item.on, dueOn);
      const idleDays = daysBetween(previous, item.on);
      const prescription = rule(key);
      return {
        ruleId: 'AUD-08',
        key: 'signal.pre-prescription-activity',
        name: 'Movimiento justo antes de prescribir',
        explanation:
          `Tras ${idleDays} días sin actuaciones, la autoridad registró una actuación ${daysBefore} días antes de la fecha probable de prescripción. ` +
          'Puede ser legítimo; conviene revisar si la actuación hace avanzar el caso.',
        subject: { kind: 'case', id: record.caseRef, authorityId: record.authorityId },
        evidence: [
          {
            label: 'Actuación cercana a la prescripción',
            actText: `Actuación «${item.kind}» del ${item.on}${item.hasContent ? '' : ', sin contenido'}.`,
            counterpart: `${prescription.name}: fecha probable ${dueOn}, contada desde el inicio del periodo de los hechos (${record.occurredPeriod}). Actuación anterior: ${previous}.`,
            counterpartSource: `Catálogo de plazos (${cite(prescription.legalBasis)}) y bitácora del nodo`,
          },
        ],
        basis: {
          references: prescription.legalBasis,
          text: `Prescripción de 3 o 7 años según la gravedad, interrumpida por la calificación (LGRA, art. 74). Regla publicada: actuación en los ${config.windowDays} días previos tras ${config.minPriorGapMonths} meses o más sin actuaciones.`,
        },
        note: SIGNAL_NOTE,
        source: 'rules',
        metrics: { daysBefore, idleDays },
        rulesVersion: RULES_VERSION,
      };
    }
    previous = item.on;
  }
  return null;
}
