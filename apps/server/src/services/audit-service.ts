// Auditor en el nodo (ADR 0009, nivel B): corre las reglas deterministas de @sigilo/auditor sobre
// los acuerdos de cierre (los del nodo y los importados) y los casos, guarda cada señal nueva una
// sola vez y registra `audit.signal` en la bitácora con el digesto de su registro canónico. Las
// señales no deciden: alimentan la regla pública `escalation.archive-signals`, el detalle de la
// autoridad y los conteos del observatorio.
import { AUDIT_LEDGER_EVENT_TYPE, POST_ADMISSION_STAGES } from '@sigilo/contracts';
import type { AuditSignalView } from '@sigilo/contracts';
import { runAudit } from '@sigilo/auditor';
import type { AuditSignal, CaseActivity, CaseRecord, ClosureAct } from '@sigilo/auditor';
import {
  canonicalize,
  randomBytes,
  sha256Hex,
  toDayDate,
  toHex,
  toMexicoCentralDay,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { withTransaction } from '../db/database.ts';
import type { StoredStep } from '../db/procedure-repository.ts';
import { pdnVerifications } from './pdn-context.ts';
import { assignedAuthorityOf } from './procedure-service.ts';

/** Reglas cuyas señales cuentan para `escalation.archive-signals`. */
export const ARCHIVE_SIGNAL_RULES = ['AUD-01', 'AUD-02'] as const;

/** Reglas cuyas señales cuentan para `escalation.downgrade-signals` (calificación de no grave). */
export const DOWNGRADE_SIGNAL_RULES = ['AUD-01', 'AUD-03', 'AUD-04'] as const;

const FILE_NUMBER_PATTERN = /\b[A-Z]{2,}(?:-[A-Z0-9]+)*-\d{3,}\b/u;

/** Expediente citado en el acuerdo, o el folio si no cita ninguno. */
function fileNumberOf(text: string, fallback: string): string {
  return FILE_NUMBER_PATTERN.exec(text)?.[0] ?? fallback;
}

/**
 * Actuación del auditor que corresponde a una etapa: el inicio del procedimiento, la calificación,
 * la admisión del informe (la primera etapa posterior, desde la que aplica la caducidad del art. 74)
 * u otra actuación con contenido.
 */
function stageActivity(stage: StoredStep['legalStage']): CaseActivity['kind'] {
  if (stage === 'investigation' || stage === 'criminal_investigation') {
    return 'investigation_started';
  }
  if (stage === 'qualification') return 'qualification';
  if (stage !== null && POST_ADMISSION_STAGES.includes(stage)) return 'report_admitted';
  return 'other';
}

function activityOf(step: StoredStep): CaseActivity | null {
  switch (step.action) {
    case 'accepted':
      return { on: step.legalOn, kind: 'accepted', hasContent: true };
    case 'stage_advanced':
      return { on: step.legalOn, kind: stageActivity(step.legalStage), hasContent: true };
    case 'closed':
      return { on: step.legalOn, kind: 'closure', hasContent: true };
    case 'received':
    case 'routed':
    case 'appeal_filed':
      // La inconformidad es de la persona denunciante, no una actuación de la autoridad.
      return null;
    default:
      return { on: step.legalOn, kind: 'note', hasContent: step.note !== null };
  }
}

function auditInput(ctx: AppContext): { acts: ClosureAct[]; cases: CaseRecord[] } {
  const authorityIds = ctx.authorities.listAuthorities().map((item) => item.authorityId);
  const closures = ctx.procedure.listClosures(authorityIds, 0, 100_000);
  const acts: ClosureAct[] = closures.map((closure) => ({
    id: `closure:${closure.folio}:${closure.agreementDigest.slice(0, 16)}`,
    authorityId: closure.authorityId,
    fileNumber: fileNumberOf(closure.agreement, closure.folio),
    issuedOn: closure.legalOn,
    reason: closure.reason,
    text: closure.agreement,
    qualification: null,
    caseRef: closure.folio,
    kind: 'closure',
  }));
  // Acuerdos de calificación (LGRA, art. 100): el auditor los compara como cualquier acuerdo.
  const qualified = ctx.qualifications.listQualifications();
  for (const item of qualified) {
    acts.push({
      id: `qualification:${item.folio}:${item.agreementDigest.slice(0, 16)}`,
      authorityId: item.authorityId,
      fileNumber: fileNumberOf(item.agreement, item.folio),
      issuedOn: item.legalOn,
      reason: null,
      text: item.agreement,
      qualification: item.severity === 'serious' ? 'grave' : 'no-grave',
      caseRef: item.folio,
      kind: 'qualification',
    });
  }
  for (const imported of ctx.integration.listImportedActs()) {
    acts.push({
      id: `imported:${imported.actId}`,
      authorityId: imported.authorityId,
      fileNumber: imported.fileNumber,
      issuedOn: imported.issuedOn,
      reason: imported.reason === null ? null : (imported.reason as ClosureAct['reason']),
      text: imported.agreement,
      qualification:
        imported.qualification === null
          ? null
          : imported.qualification === 'serious'
            ? 'grave'
            : 'no-grave',
      caseRef: null,
      kind: imported.qualification === null ? 'closure' : 'qualification',
    });
  }
  const folios = [
    ...new Set([...closures.map((closure) => closure.folio), ...qualified.map((q) => q.folio)]),
  ];
  const cases: CaseRecord[] = folios.flatMap((folio) => {
    const complaint = ctx.complaints.find(folio);
    if (complaint === null) return [];
    const corroboration = ctx.integration.lastCorroborationStatus(folio);
    return [
      {
        caseRef: folio,
        authorityId: assignedAuthorityOf(ctx, complaint),
        offenseCode: complaint.facts.offenseCode,
        receivedOn: complaint.receivedLegalOn,
        occurredPeriod: complaint.facts.occurredPeriod,
        attachments: ctx.evidence.listByFolio(folio).map((_, index) => ({
          label: `Prueba ${index + 1}`,
        })),
        independentReporters: corroboration?.independentSources ?? 1,
        verifications: pdnVerifications(ctx, complaint),
        accusedKey: sha256Hex(
          `sigilo/audit/accused:${complaint.facts.accused.trim().toLowerCase()}`,
        ),
        supplierKeys: [],
        campaignGroupId: null,
        isReporterIdentifiable: complaint.mode === 'sealed',
        activities: ctx.procedure.listSteps(folio).flatMap((step) => {
          const activity = activityOf(step);
          return activity === null ? [] : [activity];
        }),
      },
    ];
  });
  return { acts, cases };
}

/** Folio del sujeto de la señal, si es un acuerdo o un caso de una denuncia del nodo. */
function folioOfSubject(signal: AuditSignal): string | null {
  if (signal.subject.kind === 'case') return signal.subject.id;
  const match = /^(?:closure|qualification):([^:]+):/u.exec(signal.subject.id);
  return match?.[1] ?? null;
}

/**
 * Corre el auditor y registra las señales nuevas. Devuelve cuántas registró. Lo llama la tarea
 * periódica; es idempotente (una señal se guarda una vez por regla, sujeto y clave).
 * Seguridad: el evento público lleva solo el digesto del registro canónico, que no tiene texto y
 * no se puede adivinar (incluye los digestos del sujeto y de la entrada). Las señales de acuerdos
 * importados o de una autoridad completa no tienen folio: quedan en el nodo y en los conteos.
 */
export function runNodeAudit(ctx: AppContext): number {
  const { acts, cases } = auditInput(ctx);
  if (acts.length === 0) return 0;
  const report = runAudit({ acts, cases, today: toMexicoCentralDay(ctx.deps.now()) });
  let recorded = 0;
  for (const { signal, record } of report.findings) {
    const folio = folioOfSubject(signal);
    const recordDigest = sha256Hex(canonicalize(record));
    const isNew = withTransaction(ctx.deps.db, () => {
      const inserted = ctx.integration.insertAuditSignal({
        signalId: toHex(randomBytes(16)),
        subjectKey: signal.subject.id,
        folio,
        authorityId: signal.subject.authorityId,
        ruleId: signal.ruleId,
        signalKey: signal.key,
        flaggedOn: record.at,
        signalJson: JSON.stringify(signal),
        recordDigest,
      });
      // Solo las señales de una denuncia del nodo entran a su bitácora (cada evento lleva folio).
      if (inserted && folio !== null) {
        ctx.ledger.record(
          {
            type: AUDIT_LEDGER_EVENT_TYPE,
            folio,
            at: toDayDate(ctx.deps.now()),
            actorRole: 'system',
            // payloadDigest = sha256(canonicalize(record)), como define @sigilo/auditor.
            payload: record,
          },
          { isExemptFromDailyCap: true },
        );
      }
      return inserted;
    });
    if (isNew) recorded += 1;
  }
  return recorded;
}

/** Señales AUD-01 y AUD-02 sobre el archivo vigente de la denuncia. */
export function archiveSignalCount(ctx: AppContext, folio: string): number {
  return ctx.integration
    .listAuditSignalsByFolio(folio)
    .filter(
      (item) =>
        (ARCHIVE_SIGNAL_RULES as readonly string[]).includes(item.ruleId) &&
        item.subjectKey.startsWith('closure:'),
    ).length;
}

/** Señales AUD-01, AUD-03 y AUD-04 sobre la calificación vigente de la denuncia y su caso. */
export function downgradeSignalCount(ctx: AppContext, folio: string): number {
  return ctx.integration
    .listAuditSignalsByFolio(folio)
    .filter(
      (item) =>
        (DOWNGRADE_SIGNAL_RULES as readonly string[]).includes(item.ruleId) &&
        (item.subjectKey.startsWith('qualification:') || item.ruleId === 'AUD-04'),
    ).length;
}

/** Señales de la denuncia tal como las ve la autoridad. */
export function auditSignalViews(ctx: AppContext, folio: string): AuditSignalView[] {
  return ctx.integration.listAuditSignalsByFolio(folio).map((item) => {
    const signal = JSON.parse(item.signalJson) as AuditSignal;
    return {
      ruleId: signal.ruleId,
      key: signal.key,
      name: signal.name,
      explanation: signal.explanation,
      on: item.flaggedOn,
      evidence: signal.evidence.map((pair) => ({
        label: pair.label,
        actText: pair.actText,
        counterpart: pair.counterpart,
        counterpartSource: pair.counterpartSource,
      })),
      note: signal.note,
    };
  });
}
