// Vistas de lectura: seguimiento de la persona denunciante y detalle para la autoridad.
import type { ComplaintDetail, ComplaintSummary, TrackingView } from '@sigilo/contracts';
import { primaryOffenseCode } from '@sigilo/contracts';
import { s5ReferencesFor } from '@sigilo/contracts/s5';
import {
  escalationEnvelopeDigest,
  randomBytes,
  sealedIdentityDigest,
  toDayDate,
  toHex,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import { DEFAULT_EVIDENCE_RETENTION_DAYS, evidenceDeletionDay } from './evidence-service.ts';
import { listIdentityRequests } from './identity-service.ts';
import { assignedAuthorityOf } from './procedure-service.ts';
import { buildProcedureView } from './procedure-view.ts';
import { auditSignalViews } from './audit-service.ts';
import { conflictReview, contextSheetView } from './pdn-context.ts';
import { summaryWithSemaphore } from './turn-semaphore.ts';

/** Resumen de la denuncia con la clave principal de la conducta; nunca incluye el sobre. */
export function toSummary(ctx: AppContext, complaint: ComplaintRecord): ComplaintSummary {
  return {
    folio: complaint.folio,
    mode: complaint.mode,
    status: complaint.status,
    receivedOn: complaint.receivedOn,
    stateCode: complaint.facts.stateCode,
    offenseCode: primaryOffenseCode(complaint.facts.offenseCode) ?? complaint.facts.offenseCode,
    protectionRequested: complaint.protectionRequested,
    managementState: complaint.managementState,
    assignedAuthorityId: assignedAuthorityOf(ctx, complaint),
  };
}

function publishedReceivedEvent(ctx: AppContext, complaint: ComplaintRecord) {
  return ctx.ledgerRepository.findByPayloadDigest(
    'complaint.received',
    complaint.receipt.payloadDigest,
  );
}

/**
 * Vista de seguimiento: estatus, línea de tiempo, accesos a la identidad, mensajes, comprobante y,
 * si ya se publicó, el evento `complaint.received` para que el cliente lo verifique contra su
 * comprobante. Solo muestra lo ya publicado: los días los cierra la tarea programada.
 * Seguridad: las aperturas de identidad y los descartes de pruebas se muestran de inmediato, aunque
 * su evento siga pendiente.
 */
export function buildTrackingView(ctx: AppContext, complaint: ComplaintRecord): TrackingView {
  const receivedEvent = publishedReceivedEvent(ctx, complaint);
  return {
    folio: complaint.folio,
    mode: complaint.mode,
    status: complaint.status,
    timeline: ctx.statusHistory.listByFolio(complaint.folio),
    identityAccess: ctx.identityOpenings.listByFolio(complaint.folio),
    identityReleases: ctx.qualifications
      .listReleases(complaint.folio)
      .map((release) => ({ on: release.releasedOn, openingId: release.openingId })),
    evidenceDiscards: ctx.evidence.listDiscardsByFolio(complaint.folio),
    messages: ctx.messages.listByFolio(complaint.folio),
    receipt: complaint.receipt,
    ...(receivedEvent === null ? {} : { receivedEvent }),
    procedure: buildProcedureView(ctx, complaint),
  };
}

/** Fecha de borrado de las pruebas por la retención, si la denuncia sigue sin atender o archivada. */
function evidenceDeletionOn(ctx: AppContext, complaint: ComplaintRecord): string | null {
  const isRetained = complaint.status === 'received' || complaint.status === 'archived';
  if (!isRetained || !ctx.evidence.hasStoredForFolio(complaint.folio)) return null;
  const retentionDays = ctx.deps.evidenceRetentionDays ?? DEFAULT_EVIDENCE_RETENTION_DAYS;
  return evidenceDeletionDay(complaint.receivedOn, retentionDays);
}

/**
 * Detalle para la autoridad, con lo necesario para recalcular el contexto de la identidad y el
 * digesto del envío (incluido el digesto del sobre y, si ya se publicó, la secuencia de su
 * evento `complaint.received`), cuántas pruebas siguen guardadas y, si sigue sin atender o está
 * archivada, el día en que se borrarán.
 * Seguridad: nunca incluye el sobre de identidad.
 */
/**
 * Indica si la cuenta puede ver la corroboración de la denuncia: solo la autoridad competente (no
 * el buzón general) y solo después de aceptarla (H3).
 */
export function canSeeCorroboration(
  ctx: AppContext,
  account: AuthorityAccount | null,
  complaint: ComplaintRecord,
): boolean {
  if (account === null) return false;
  const assigned = complaint.assignedAuthorityId ?? ctx.authorities.inboxAuthorityId;
  return (
    account.authorityId === assigned &&
    assigned !== ctx.authorities.inboxAuthorityId &&
    ctx.procedure.listSteps(complaint.folio).some((step) => step.action === 'accepted')
  );
}

export function buildComplaintDetail(
  ctx: AppContext,
  complaint: ComplaintRecord,
  account: AuthorityAccount | null = null,
): ComplaintDetail {
  const mayCorroborate = canSeeCorroboration(ctx, account, complaint);
  const corroboration = mayCorroborate ? corroborationView(ctx, complaint.folio) : null;
  // Cada consulta del detalle con corroboración queda en la bitácora con el seudónimo (H3).
  if (corroboration !== null && account !== null) {
    ctx.ledger.record(
      {
        type: 'corroboration.viewed',
        folio: complaint.folio,
        at: toDayDate(ctx.deps.now()),
        actorRole: 'authority',
        payload: {
          folio: complaint.folio,
          viewId: toHex(randomBytes(16)),
          actor: account.accountId,
        },
      },
      { isExemptFromDailyCap: true },
    );
  }
  const receivedEvent = publishedReceivedEvent(ctx, complaint);
  const deletionOn = evidenceDeletionOn(ctx, complaint);
  return {
    summary: summaryWithSemaphore(ctx, complaint, toSummary(ctx, complaint)),
    version: 1,
    facts: complaint.facts,
    evidence: ctx.evidence.listByFolio(complaint.folio),
    reporterKeys: complaint.reporterKeys,
    authVerifier: complaint.authVerifier,
    ...(complaint.sealedIdentity === null
      ? {}
      : { sealedIdentityDigest: sealedIdentityDigest(complaint.sealedIdentity) }),
    ...(complaint.escalationEnvelope === null
      ? {}
      : { escalationEnvelopeDigest: escalationEnvelopeDigest(complaint.escalationEnvelope) }),
    ...(complaint.corroborationDigest === null
      ? {}
      : { corroborationDigest: complaint.corroborationDigest }),
    ...(receivedEvent === null ? {} : { receivedEventSeq: receivedEvent.seq }),
    ...(deletionOn === null ? {} : { evidenceDeletionOn: deletionOn }),
    storedEvidenceCount: ctx.evidence.listStoredIdsForFolio(complaint.folio).length,
    messages: ctx.messages.listByFolio(complaint.folio),
    identityOpenedCount: ctx.identityOpenings.countByFolio(complaint.folio),
    s5References: s5ReferencesFor(
      complaint.facts.entityId,
      complaint.facts.stateCode,
      complaint.facts.offenseCode,
    ),
    procedure: buildProcedureView(ctx, complaint),
    identityRequests: listIdentityRequests(ctx, complaint),
    ...optional('contextSheet', contextSheetView(ctx, complaint, mayCorroborate)),
    ...optional('conflictReview', conflictReview(ctx, complaint)),
    ...optional('corroboration', corroboration),
    auditSignals: auditSignalViews(ctx, complaint.folio),
  };
}

function optional<K extends string, V>(key: K, value: V | null): Partial<Record<K, V>> {
  return value === null ? {} : ({ [key]: value } as Partial<Record<K, V>>);
}

function corroborationView(ctx: AppContext, folio: string) {
  const status = ctx.integration.lastCorroborationStatus(folio);
  if (status === null) return null;
  return {
    sources: status.independentSources >= 2 ? ('two_or_more' as const) : ('one' as const),
    isPossibleCampaign: status.isPossibleCampaign,
    updatedOn: status.updatedOn,
    ...(status.newIndicationOn === null ? {} : { newIndicationOn: status.newIndicationOn }),
  };
}
