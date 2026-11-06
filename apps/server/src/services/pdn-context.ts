// Contexto de la PDN en el nodo (ADR 0007, 0008 y 0010): ficha con prioridad explicable en el
// detalle de la autoridad, conflicto de interés antes de turnar (alerta, nunca bloqueo) y
// verificación de sanciones al cerrar. Fuentes sintéticas en la demostración y SQLite cuando hay
// ruta configurada. Ninguna consulta sale a la red.
import { findEntity } from '@sigilo/contracts';
import type {
  CitedFact,
  ConflictReview,
  ContextSheetView,
  SanctionCheckView,
  SanctionClaimInput,
} from '@sigilo/contracts';
import {
  buildContextSheet,
  checkConflictOfInterest,
  checkContractSuppliers,
  checkUnverifiableSanction,
  extractContractClaims,
  pickSource,
  verifyCitedContract,
  verifySanction,
} from '@sigilo/contexto-pdn';
import type {
  ConflictCheck,
  ContractsSource,
  CoverageMatrix,
  DeclaredInterestsSource,
  Evidence,
  PersonRef,
  ProcurementStaffSource,
  SanctionsSource,
  TaxListSource,
  Verification,
} from '@sigilo/contexto-pdn';
import { toDayDate, toMexicoCentralDay } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import type { StoredSanctionCheck } from '../db/integration-repository.ts';

/** Fuentes de la PDN con las que trabaja el nodo; cualquiera puede faltar. */
export interface PdnSources {
  matrix: CoverageMatrix;
  s1: DeclaredInterestsSource | null;
  s2: ProcurementStaffSource | null;
  s3: readonly SanctionsSource[];
  s6: ContractsSource | null;
  taxList: TaxListSource | null;
}

/** Proveedor de fuentes: recibe el día legal de hoy (las sintéticas dependen del reloj). */
export type PdnSourcesProvider = (today: string) => PdnSources;

function sourcesOf(ctx: AppContext): PdnSources | null {
  const provider = ctx.deps.pdnSources;
  return provider === undefined ? null : provider(toMexicoCentralDay(ctx.deps.now()));
}

/** Clave de entidad que usa la PDN: `00` para lo federal. */
function pdnStateCode(complaint: ComplaintRecord): string {
  return findEntity(complaint.facts.entityId)?.level === 'federal'
    ? '00'
    : complaint.facts.stateCode;
}

/** Persona denunciada como la busca la PDN: el nombre antes de la primera coma y su ente. */
function accusedPerson(complaint: ComplaintRecord): PersonRef {
  const [name = complaint.facts.accused] = complaint.facts.accused.split(',');
  return {
    fullName: name.trim(),
    institution: findEntity(complaint.facts.entityId)?.name ?? complaint.facts.entityId,
    stateCode: pdnStateCode(complaint),
  };
}

function citedFact(evidence: Evidence): CitedFact {
  return { label: evidence.label, value: evidence.value, source: evidence.citation.text };
}

/**
 * Qué debe hacer quien tiene el posible conflicto (LGRA, art. 58): informar a su superior inmediato
 * y pedir que lo excuse; el superior le responde a más tardar 48 horas antes del plazo para atender
 * el asunto, con instrucciones por escrito si no puede abstenerse.
 */
export const ARTICLE_58_PROCEDURE =
  'Quien tiene el conflicto debe informarlo a su superior inmediato y pedir que lo excuse de atender, tramitar o resolver el asunto; el superior debe responderle a más tardar 48 horas antes del plazo para atenderlo y, si no es posible que se abstenga, darle instrucciones por escrito para actuar con imparcialidad (LGRA, art. 58). Registra aquí la excusa o la justificación; si se emite un acto resolutivo sin ninguna, la denuncia se escala.';

function conflictReviewOf(
  stored: ReturnType<AppContext['integration']['lastConflictReview']>,
  response: ConflictReview['response'] | undefined,
): ConflictReview | null {
  if (stored === null) return null;
  const check = JSON.parse(stored.checkJson) as ConflictCheck;
  return {
    checkedOn: stored.legalOn,
    authorityId: stored.authorityId,
    outcome: check.outcome,
    summary: check.requiresExcuseOrJustification
      ? `${check.summary} ${ARTICLE_58_PROCEDURE}`
      : check.summary,
    alerts: check.alerts.map((alert) => ({
      kind: alert.kind,
      title: alert.title,
      explanation: alert.explanation,
      evidence: alert.evidence.map(citedFact),
    })),
    requiresResponse: check.requiresExcuseOrJustification,
    ...(response === undefined ? {} : { response }),
  };
}

/** Respuesta (excusa o justificación) registrada después de la última revisión, si la hay. */
export function conflictResponseOf(
  ctx: AppContext,
  complaint: ComplaintRecord,
): { response: 'excuse' | 'justification'; on: string } | null {
  const review = ctx.integration.lastConflictReview(complaint.folio);
  if (review === null) return null;
  const step = ctx.procedure
    .listSteps(complaint.folio)
    .filter(
      (item) =>
        (item.action === 'conflict_excused' || item.action === 'conflict_justified') &&
        item.legalOn >= review.legalOn &&
        item.authorityId === review.authorityId,
    )
    .at(0);
  if (step === undefined) return null;
  return {
    response: step.action === 'conflict_excused' ? 'excuse' : 'justification',
    on: step.legalOn,
  };
}

/** Revisión de conflicto vigente de la denuncia, para el detalle de la autoridad. */
export function conflictReview(ctx: AppContext, complaint: ComplaintRecord): ConflictReview | null {
  const answer = conflictResponseOf(ctx, complaint);
  return conflictReviewOf(ctx.integration.lastConflictReview(complaint.folio), answer?.response);
}

/**
 * Revisa el conflicto de interés entre la persona titular de la autoridad que recibe la denuncia y
 * la persona denunciada (S1 y S2), justo al turnarla. Nunca bloquea: si hay un posible conflicto,
 * la autoridad debe excusarse o justificar (LGRA, art. 58); si resuelve sin hacerlo, se escala.
 * No hace nada si no hay fuentes o si la autoridad no tiene titular declarado.
 */
export function reviewConflictOnAssignment(
  ctx: AppContext,
  folio: string,
  authorityId: string,
): void {
  const sources = sourcesOf(ctx);
  const head = ctx.authorities.headOf(authorityId);
  const complaint = ctx.complaints.find(folio);
  if (sources === null || head === null || complaint === null) return;
  const check = checkConflictOfInterest({
    matrix: sources.matrix,
    s1: sources.s1,
    s2: sources.s2,
    authorityHead: head,
    accused: accusedPerson(complaint),
  });
  const now = ctx.deps.now();
  ctx.integration.insertConflictReview(folio, {
    authorityId,
    checkedOn: toDayDate(now),
    legalOn: toMexicoCentralDay(now),
    outcome: check.outcome,
    requiresResponse: check.requiresExcuseOrJustification,
    checkJson: JSON.stringify(check),
  });
}

function answerDays(answer: { response: 'excuse' | 'justification'; on: string } | null) {
  return {
    conflictExcusedOn: answer?.response === 'excuse' ? answer.on : null,
    conflictJustifiedOn: answer?.response === 'justification' ? answer.on : null,
  };
}

/**
 * Indica si la autoridad que tiene la denuncia se excusó por un posible conflicto (LGRA, art. 58):
 * entonces no puede aceptarla ni emitir actos resolutivos; debe reasignarla o turnarla.
 */
export function isExcusedAuthority(ctx: AppContext, complaint: ComplaintRecord): boolean {
  const review = ctx.integration.lastConflictReview(complaint.folio);
  return (
    review !== null &&
    review.authorityId === (complaint.assignedAuthorityId ?? ctx.authorities.inboxAuthorityId) &&
    conflictResponseOf(ctx, complaint)?.response === 'excuse'
  );
}

/** Día de la alerta de conflicto que sigue pendiente para la autoridad que tiene la denuncia. */
export function conflictFacts(
  ctx: AppContext,
  complaint: ComplaintRecord,
  assignedAuthorityId: string,
): {
  conflictAlertOn: string | null;
  conflictExcusedOn: string | null;
  conflictJustifiedOn: string | null;
} {
  const review = ctx.integration.lastConflictReview(complaint.folio);
  if (review === null || !review.requiresResponse || review.authorityId !== assignedAuthorityId) {
    return { conflictAlertOn: null, conflictExcusedOn: null, conflictJustifiedOn: null };
  }
  return {
    conflictAlertOn: review.legalOn,
    ...answerDays(conflictResponseOf(ctx, complaint)),
  };
}

/** Contrato citado en la narración verificado contra S6 y sus proveedores contra la lista 69-B. */
function recordChecks(sources: PdnSources, complaint: ComplaintRecord) {
  const stateCode = pdnStateCode(complaint);
  const [claim] = extractContractClaims(complaint.facts.description);
  const contract =
    claim === undefined || sources.s6 === null
      ? undefined
      : {
          verification: verifyCitedContract({
            source: sources.s6,
            matrix: sources.matrix,
            stateCode,
            claim,
            date: complaint.facts.occurredPeriod,
          }),
          source: sources.s6,
        };
  const record = contract?.verification.record ?? null;
  const taxList =
    record === null || sources.taxList === null
      ? []
      : checkContractSuppliers(sources.taxList, record);
  return { contract, taxList };
}

/**
 * Datos que la PDN confirmó o contradijo para la denuncia (contrato y lista 69-B), como los usa el
 * auditor (AUD-02). Vacío sin fuentes.
 */
export function pdnVerifications(ctx: AppContext, complaint: ComplaintRecord): Verification[] {
  const sources = sourcesOf(ctx);
  if (sources === null) return [];
  const { contract, taxList } = recordChecks(sources, complaint);
  return [...(contract === undefined ? [] : [contract.verification]), ...taxList];
}

/**
 * Ficha de contexto con prioridad explicable: falta grave, contrato citado contra S6, proveedores
 * en la lista tipo 69-B, corroboración independiente, posible campaña y conflicto de interés.
 * `null` sin fuentes configuradas.
 */
export function contextSheetView(
  ctx: AppContext,
  complaint: ComplaintRecord,
  canSeeCorroboration = false,
): ContextSheetView | null {
  const sources = sourcesOf(ctx);
  if (sources === null) return null;
  const { contract, taxList } = recordChecks(sources, complaint);
  // Seguridad (H3): sin permiso, la ficha no usa la corroboración (no sirve de oráculo); con él,
  // solo distingue una fuente de dos o más.
  const corroboration = canSeeCorroboration
    ? ctx.integration.lastCorroborationStatus(complaint.folio)
    : null;
  const stored = ctx.integration.lastConflictReview(complaint.folio);
  const sheet = buildContextSheet({
    offenseCode: complaint.facts.offenseCode,
    independentReporters: Math.min(corroboration?.independentSources ?? 1, 2),
    isPossibleCampaign: corroboration?.isPossibleCampaign ?? false,
    ...(contract === undefined ? {} : { contract }),
    taxList,
    ...(stored === null ? {} : { conflict: JSON.parse(stored.checkJson) as ConflictCheck }),
  });
  const notices = [...sheet.notices];
  if (corroboration?.newIndicationOn !== null && corroboration?.newIndicationOn !== undefined) {
    notices.push(
      `Posible nuevo indicio: el ${corroboration.newIndicationOn} llegó otra denuncia independiente sobre lo mismo mientras esta estaba archivada (LGRA, art. 100).`,
    );
  }
  return {
    score: sheet.priority.score,
    level: sheet.priority.level,
    label: sheet.priority.label,
    configVersion: sheet.priority.configVersion,
    factors: sheet.priority.factors.map((factor) => ({
      id: factor.id,
      label: factor.label,
      points: factor.points,
      reason: factor.reason,
      source: factor.citation?.text ?? null,
    })),
    facts: sheet.facts.map(citedFact),
    notices,
  };
}

/**
 * Verifica contra S3 la sanción que la autoridad declaró al cerrar y guarda el resultado (tres
 * resultados; la ausencia nunca es evidencia). Sin fuentes, no hace nada.
 */
function computeSanctionCheck(
  ctx: AppContext,
  claim: SanctionClaimInput & { declaredOn: string },
): StoredSanctionCheck | null {
  const sources = sourcesOf(ctx);
  const source = sources === null ? null : pickSource(sources.s3, claim.stateCode);
  if (sources === null || source === null) return null;
  const verification = verifySanction({ source, matrix: sources.matrix, claim });
  const flag = checkUnverifiableSanction({
    claim,
    verification,
    today: toMexicoCentralDay(ctx.deps.now()),
  });
  return {
    checkedOn: toDayDate(ctx.deps.now()),
    outcome: verification.outcome,
    explanation: verification.explanation,
    unverifiable: flag.isFlagged,
    claimJson: JSON.stringify(claim),
  };
}

/**
 * Verifica contra S3 la sanción que la autoridad declaró al cerrar y guarda el resultado (tres
 * resultados; la ausencia nunca es evidencia). Sin fuentes, no hace nada.
 */
export function verifyClosureSanction(
  ctx: AppContext,
  folio: string,
  claim: SanctionClaimInput,
  declaredOn: string,
): void {
  const check = computeSanctionCheck(ctx, { ...claim, declaredOn });
  if (check !== null) ctx.integration.insertSanctionCheck(folio, check);
}

/**
 * Vuelve a verificar las sanciones que quedaron sin cobertura: S3 publica con retraso, así que una
 * sanción declarada puede confirmarse días después o marcarse como no verificable al vencer el plazo
 * de publicación. Solo guarda un resultado nuevo si cambió. Lo llama la tarea periódica.
 */
export function recheckPendingSanctions(ctx: AppContext): number {
  let changed = 0;
  for (const folio of ctx.integration.listPendingSanctionFolios()) {
    const last = ctx.integration.lastSanctionCheck(folio);
    if (last === null) continue;
    const claim = JSON.parse(last.claimJson) as SanctionClaimInput & { declaredOn: string };
    const next = computeSanctionCheck(ctx, claim);
    if (next === null || (next.outcome === last.outcome && !next.unverifiable)) continue;
    ctx.integration.insertSanctionCheck(folio, next);
    changed += 1;
  }
  return changed;
}

/** Última verificación de la sanción declarada, para el cierre en el seguimiento y el detalle. */
export function sanctionCheckView(ctx: AppContext, folio: string): SanctionCheckView | null {
  const last = ctx.integration.lastSanctionCheck(folio);
  if (last === null) return null;
  return {
    checkedOn: last.checkedOn,
    outcome: last.outcome,
    explanation: last.explanation,
    unverifiable: last.unverifiable,
  };
}
