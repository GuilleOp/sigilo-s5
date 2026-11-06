// Ejecuta todas las reglas deterministas sobre los acuerdos y casos de un nodo y produce las
// señales con su registro de bitácora. No cambia estados, no cierra, no turna: solo informa.
import { DEFAULT_BUSINESS_CALENDAR } from '@sigilo/core';
import type { BusinessCalendar } from '@sigilo/core';
import type { AuditLedgerRecord } from '@sigilo/contracts';
import { AUDITOR_CONFIG } from './config.ts';
import type { AuditorConfig } from './config.ts';
import { buildLedgerRecord } from './ledger-record.ts';
import { assertNeutralWording } from './signal.ts';
import type { AuditSignal, CaseRecord, ClosureAct } from './types.ts';
import { detectArchiveAgainstEvidence } from './rules/archive-against-evidence.ts';
import {
  detectArchiveConcentration,
  detectCorroboratedArchiveRate,
} from './rules/authority-patterns.ts';
import {
  detectDeadlineSignals,
  detectEmptyActivity,
  detectPrePrescriptionActivity,
} from './rules/deadlines.ts';
import { detectDowngradedQualification } from './rules/downgraded-qualification.ts';
import { detectTemplateClosure } from './rules/template-closure.ts';

/** Entrada del auditor: lo que la autoridad y el nodo ya tienen, sin identidades. */
export interface AuditInput {
  acts: readonly ClosureAct[];
  cases: readonly CaseRecord[];
  /** Día de la evaluación (AAAA-MM-DD). */
  today: string;
  config?: AuditorConfig;
  calendar?: BusinessCalendar;
}

/** Señal con su registro de bitácora. */
export interface AuditFinding {
  signal: AuditSignal;
  record: AuditLedgerRecord;
}

/** Resultado del auditor. */
export interface AuditReport {
  rulesVersion: string;
  findings: readonly AuditFinding[];
}

function finding(signal: AuditSignal, input: unknown, today: string): AuditFinding {
  assertNeutralWording(signal);
  return {
    signal,
    record: buildLedgerRecord({
      ruleId: signal.ruleId,
      signalKey: signal.key,
      engine: { kind: 'rules', rulesVersion: signal.rulesVersion },
      subject: signal.subject,
      input,
      output: signal,
      result: 'flagged',
      at: today,
    }),
  };
}

/**
 * Corre AUD-01 a AUD-08. Determinista: la misma entrada da las mismas señales en el mismo orden.
 * Un acuerdo sin caso ligado (por ejemplo, uno importado) solo se evalúa con AUD-01.
 */
export function runAudit(input: AuditInput): AuditReport {
  const config = input.config ?? AUDITOR_CONFIG;
  const calendar = input.calendar ?? DEFAULT_BUSINESS_CALENDAR;
  const { acts, cases, today } = input;
  const caseByRef = new Map(cases.map((record) => [record.caseRef, record]));
  const findings: AuditFinding[] = [];
  // Con una configuración distinta de la publicada, la versión registrada es la de esa configuración.
  const rulesVersion = config.version;

  const actsByAuthority = new Map<string, ClosureAct[]>();
  for (const act of acts) {
    actsByAuthority.set(act.authorityId, [...(actsByAuthority.get(act.authorityId) ?? []), act]);
  }

  for (const act of [...acts].sort((left, right) => left.id.localeCompare(right.id))) {
    const corpus = actsByAuthority.get(act.authorityId) ?? [];
    const template = detectTemplateClosure(act, corpus, config.templateClosure);
    if (template !== null) {
      findings.push(
        finding(
          { ...template, rulesVersion },
          { rule: 'AUD-01', config: config.templateClosure, act, corpus },
          today,
        ),
      );
    }
    const record = act.caseRef === null ? undefined : caseByRef.get(act.caseRef);
    if (record === undefined) continue;
    const archive = detectArchiveAgainstEvidence(act, record, config.archiveAgainstEvidence);
    if (archive !== null) {
      findings.push(
        finding({ ...archive, rulesVersion }, { rule: 'AUD-02', act, case: record }, today),
      );
    }
    const downgraded = detectDowngradedQualification(act, record);
    if (downgraded !== null) {
      findings.push(
        finding({ ...downgraded, rulesVersion }, { rule: 'AUD-03', act, case: record }, today),
      );
    }
  }

  for (const record of [...cases].sort((left, right) =>
    left.caseRef.localeCompare(right.caseRef),
  )) {
    const caseInput = { case: record, today };
    for (const signal of detectDeadlineSignals(record, today, calendar, config.deadlines)) {
      findings.push(finding({ ...signal, rulesVersion }, { rule: 'AUD-04', ...caseInput }, today));
    }
    for (const signal of detectEmptyActivity(record, config.deadlines)) {
      findings.push(finding({ ...signal, rulesVersion }, { rule: 'AUD-05', ...caseInput }, today));
    }
    const pre = detectPrePrescriptionActivity(record, config.prePrescription);
    if (pre !== null)
      findings.push(finding({ ...pre, rulesVersion }, { rule: 'AUD-08', ...caseInput }, today));
  }

  const authorities = [
    ...new Set([...cases.map((item) => item.authorityId), ...acts.map((item) => item.authorityId)]),
  ].sort();
  for (const authorityId of authorities) {
    const own = {
      cases: cases.filter((item) => item.authorityId === authorityId),
      acts: actsByAuthority.get(authorityId) ?? [],
    };
    const rate = detectCorroboratedArchiveRate(
      authorityId,
      own.cases,
      own.acts,
      today,
      config.corroboratedArchiveRate,
    );
    if (rate !== null)
      findings.push(finding({ ...rate, rulesVersion }, { rule: 'AUD-06', ...own, today }, today));
    for (const signal of detectArchiveConcentration(
      authorityId,
      own.cases,
      own.acts,
      today,
      config.archiveConcentration,
    )) {
      findings.push(finding({ ...signal, rulesVersion }, { rule: 'AUD-07', ...own, today }, today));
    }
  }
  return { rulesVersion, findings };
}
