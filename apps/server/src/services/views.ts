// Vistas de lectura: seguimiento de la persona denunciante y detalle para la autoridad.
import type { ComplaintDetail, ComplaintSummary, TrackingView } from '@sigilo/contracts';
import { primaryOffenseCode } from '@sigilo/contracts';
import { sealedIdentityDigest } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';

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
 * comprobante. Antes publica los días cerrados, para que el evento aparezca en cuanto corresponda.
 * Seguridad: las aperturas de identidad se muestran de inmediato, aunque su evento siga pendiente.
 */
export function buildTrackingView(ctx: AppContext, complaint: ComplaintRecord): TrackingView {
  ctx.ledger.publishClosedDays();
  const receivedEvent = publishedReceivedEvent(ctx, complaint);
  return {
    folio: complaint.folio,
    mode: complaint.mode,
    status: complaint.status,
    timeline: ctx.statusHistory.listByFolio(complaint.folio),
    identityAccess: ctx.identityOpenings.listByFolio(complaint.folio),
    messages: ctx.messages.listByFolio(complaint.folio),
    receipt: complaint.receipt,
    ...(receivedEvent === null ? {} : { receivedEvent }),
  };
}

/**
 * Detalle para la autoridad, con lo necesario para recalcular el contexto de la identidad y el
 * digesto del envío (incluido el digesto del sobre y, si ya se publicó, la secuencia de su
 * evento `complaint.received`).
 * Seguridad: nunca incluye el sobre de identidad.
 */
export function buildComplaintDetail(ctx: AppContext, complaint: ComplaintRecord): ComplaintDetail {
  ctx.ledger.publishClosedDays();
  const receivedEvent = publishedReceivedEvent(ctx, complaint);
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
    messages: ctx.messages.listByFolio(complaint.folio),
    identityOpenedCount: ctx.identityOpenings.countByFolio(complaint.folio),
  };
}
