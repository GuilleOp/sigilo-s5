// Vistas de lectura: seguimiento de la persona denunciante y detalle para la autoridad.
import type { ComplaintDetail, ComplaintSummary, TrackingView } from '@sigilo/contracts';
import { primaryOffenseCode } from '@sigilo/contracts';
import { sealedIdentityDigest } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { DEFAULT_EVIDENCE_RETENTION_DAYS, evidenceDeletionDay } from './evidence-service.ts';

/** Resumen de la denuncia con la clave principal de la conducta; nunca incluye el sobre. */
export function toSummary(complaint: ComplaintRecord): ComplaintSummary {
  return {
    folio: complaint.folio,
    mode: complaint.mode,
    status: complaint.status,
    receivedOn: complaint.receivedOn,
    stateCode: complaint.facts.stateCode,
    offenseCode: primaryOffenseCode(complaint.facts.offenseCode) ?? complaint.facts.offenseCode,
    protectionRequested: complaint.protectionRequested,
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
    evidenceDiscards: ctx.evidence.listDiscardsByFolio(complaint.folio),
    messages: ctx.messages.listByFolio(complaint.folio),
    receipt: complaint.receipt,
    ...(receivedEvent === null ? {} : { receivedEvent }),
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
export function buildComplaintDetail(ctx: AppContext, complaint: ComplaintRecord): ComplaintDetail {
  const receivedEvent = publishedReceivedEvent(ctx, complaint);
  const deletionOn = evidenceDeletionOn(ctx, complaint);
  return {
    summary: toSummary(complaint),
    version: 1,
    facts: complaint.facts,
    evidence: ctx.evidence.listByFolio(complaint.folio),
    reporterKeys: complaint.reporterKeys,
    authVerifier: complaint.authVerifier,
    ...(complaint.sealedIdentity === null
      ? {}
      : { sealedIdentityDigest: sealedIdentityDigest(complaint.sealedIdentity) }),
    ...(receivedEvent === null ? {} : { receivedEventSeq: receivedEvent.seq }),
    ...(deletionOn === null ? {} : { evidenceDeletionOn: deletionOn }),
    storedEvidenceCount: ctx.evidence.listStoredIdsForFolio(complaint.folio).length,
    messages: ctx.messages.listByFolio(complaint.folio),
    identityOpenedCount: ctx.identityOpenings.countByFolio(complaint.folio),
  };
}
