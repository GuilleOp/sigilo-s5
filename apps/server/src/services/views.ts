// Vistas de lectura: seguimiento de la persona denunciante y detalle para la autoridad.
import { ComplaintStatusSchema } from '@sigilo/contracts';
import type {
  ComplaintDetail,
  ComplaintSummary,
  TimelineEntry,
  TrackingView,
} from '@sigilo/contracts';
import { folioDigest } from '@sigilo/core';
import { z } from 'zod';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';

const StatusPayloadSchema = z.object({ status: ComplaintStatusSchema });

/** Resumen de la denuncia; nunca incluye el sobre de identidad. */
export function toSummary(complaint: ComplaintRecord): ComplaintSummary {
  return {
    folio: complaint.folio,
    mode: complaint.mode,
    status: complaint.status,
    receivedOn: complaint.receivedOn,
    stateCode: complaint.facts.stateCode,
    offenseCode: complaint.facts.offenseCode,
    protectionRequested: complaint.protectionRequested,
  };
}

/** Línea de tiempo de estatus reconstruida desde la bitácora, con fechas por día. */
function buildTimeline(ctx: AppContext, folio: string): TimelineEntry[] {
  const events = ctx.ledgerRepository.listByFolioDigest(folioDigest(folio), [
    'complaint.received',
    'complaint.status_changed',
  ]);
  return events.map(({ event, payloadJson }) => ({
    status:
      event.type === 'complaint.received'
        ? 'received'
        : StatusPayloadSchema.parse(JSON.parse(payloadJson)).status,
    on: event.at,
  }));
}

/** Vista de seguimiento: estatus, línea de tiempo, accesos a la identidad, mensajes y comprobante. */
export function buildTrackingView(ctx: AppContext, complaint: ComplaintRecord): TrackingView {
  return {
    folio: complaint.folio,
    mode: complaint.mode,
    status: complaint.status,
    timeline: buildTimeline(ctx, complaint.folio),
    identityAccess: ctx.identityOpenings.listByFolio(complaint.folio),
    messages: ctx.messages.listByFolio(complaint.folio),
    receipt: complaint.receipt,
  };
}

/** Detalle para la autoridad. Seguridad: nunca incluye el sobre de identidad. */
export function buildComplaintDetail(ctx: AppContext, complaint: ComplaintRecord): ComplaintDetail {
  return {
    summary: toSummary(complaint),
    facts: complaint.facts,
    evidence: ctx.evidence.listByFolio(complaint.folio),
    reporterBoxPublicKey: complaint.reporterKeys.boxPublicKey,
    reporterSigningPublicKey: complaint.reporterKeys.signingPublicKey,
    messages: ctx.messages.listByFolio(complaint.folio),
    identityOpenedCount: ctx.identityOpenings.countByFolio(complaint.folio),
  };
}
