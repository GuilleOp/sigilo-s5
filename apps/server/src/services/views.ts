// Vistas de lectura: seguimiento de la persona denunciante y detalle para la autoridad.
import { ComplaintStatusSchema } from '@sigilo/contracts';
import type {
  ComplaintDetail,
  ComplaintSummary,
  LedgerEvent,
  TimelineEntry,
  TrackingView,
} from '@sigilo/contracts';
import { folioDigest } from '@sigilo/core';
import { z } from 'zod';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import type { StoredLedgerEvent } from '../db/ledger-repository.ts';

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

function statusEvents(ctx: AppContext, folio: string): StoredLedgerEvent[] {
  return ctx.ledgerRepository.listByFolioDigest(folioDigest(folio), [
    'complaint.received',
    'complaint.status_changed',
  ]);
}

/** Línea de tiempo de estatus reconstruida desde la bitácora, con fechas por día. */
function buildTimeline(events: readonly StoredLedgerEvent[]): TimelineEntry[] {
  return events.map(({ event, payloadJson }) => ({
    status:
      event.type === 'complaint.received'
        ? 'received'
        : StatusPayloadSchema.parse(JSON.parse(payloadJson)).status,
    on: event.at,
  }));
}

function receivedEventOf(
  complaint: ComplaintRecord,
  events: readonly StoredLedgerEvent[],
): LedgerEvent {
  const found = events.find(({ event }) => event.seq === complaint.receipt.ledgerSeq)?.event;
  if (found?.type !== 'complaint.received') {
    throw new Error('Falta el evento de recepción de la denuncia.');
  }
  return found;
}

/**
 * Vista de seguimiento: estatus, línea de tiempo, accesos a la identidad, mensajes, comprobante y
 * el evento `complaint.received` para que el cliente lo verifique contra su comprobante.
 */
export function buildTrackingView(ctx: AppContext, complaint: ComplaintRecord): TrackingView {
  const events = statusEvents(ctx, complaint.folio);
  return {
    folio: complaint.folio,
    mode: complaint.mode,
    status: complaint.status,
    timeline: buildTimeline(events),
    identityAccess: ctx.identityOpenings.listByFolio(complaint.folio),
    messages: ctx.messages.listByFolio(complaint.folio),
    receipt: complaint.receipt,
    receivedEvent: receivedEventOf(complaint, events),
  };
}

/**
 * Detalle para la autoridad, con lo necesario para recalcular el contexto de la identidad.
 * Seguridad: nunca incluye el sobre de identidad.
 */
export function buildComplaintDetail(ctx: AppContext, complaint: ComplaintRecord): ComplaintDetail {
  return {
    summary: toSummary(complaint),
    version: 1,
    facts: complaint.facts,
    evidence: ctx.evidence.listByFolio(complaint.folio),
    reporterKeys: complaint.reporterKeys,
    authVerifier: complaint.authVerifier,
    messages: ctx.messages.listByFolio(complaint.folio),
    identityOpenedCount: ctx.identityOpenings.countByFolio(complaint.folio),
  };
}
