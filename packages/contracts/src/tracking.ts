// Seguimiento por parte de la persona denunciante con folio y llave derivada del recibo.
import { z } from 'zod';
import { ComplaintModeSchema, ComplaintStatusSchema, SignedReceiptSchema } from './complaint.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { LedgerEventSchema } from './ledger.ts';
import { MailboxMessageSchema, MailboxSequenceSchema } from './mailbox.ts';
import { Base64UrlSchema, DayDateSchema, FolioSchema } from './primitives.ts';

export const TrackingCredentialsSchema = z.object({
  folio: FolioSchema,
  /** Llave de autenticación derivada del recibo (nunca el recibo). */
  authKey: Base64UrlSchema,
});
export type TrackingCredentials = z.infer<typeof TrackingCredentialsSchema>;

export const TimelineEntrySchema = z.object({
  status: ComplaintStatusSchema,
  on: DayDateSchema,
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

/** Identificador aleatorio de una apertura de identidad (16 bytes en hexadecimal). */
export const OpeningIdSchema = z.string().regex(/^[0-9a-f]{32}$/, 'Identificador inválido');

/**
 * Cada apertura de la identidad sellada queda visible para la persona denunciante de inmediato,
 * aunque su evento `identity.opened` se publique hasta que cierre el día. Con `openingId` y
 * `legalBasis` la persona recalcula el `payloadDigest` del evento (`identityOpenedPayloadDigest`).
 */
export const IdentityAccessEntrySchema = z.object({
  on: DayDateSchema,
  actorRole: z.literal('authority'),
  legalBasis: z.string(),
  openingId: OpeningIdSchema,
});
export type IdentityAccessEntry = z.infer<typeof IdentityAccessEntrySchema>;

/**
 * Descarte de pruebas por la autoridad, visible para la persona denunciante de inmediato aunque su
 * evento `evidence.discarded` se publique hasta que cierre el día.
 */
export const EvidenceDiscardEntrySchema = z.object({
  on: DayDateSchema,
  count: z.number().int().positive(),
});
export type EvidenceDiscardEntry = z.infer<typeof EvidenceDiscardEntrySchema>;

export const TrackingViewSchema = z.object({
  folio: FolioSchema,
  mode: ComplaintModeSchema,
  status: ComplaintStatusSchema,
  timeline: z.array(TimelineEntrySchema),
  identityAccess: z.array(IdentityAccessEntrySchema),
  /** Descartes de pruebas por la autoridad, en el orden en que ocurrieron. */
  evidenceDiscards: z.array(EvidenceDiscardEntrySchema).optional(),
  messages: z.array(MailboxMessageSchema),
  receipt: SignedReceiptSchema,
  /**
   * Evento `complaint.received` ya publicado (encadenado al cerrar su día). Falta mientras está
   * pendiente de publicar. El cliente comprueba que corresponda a su comprobante (`folioDigest`,
   * `payloadDigest` y fecha) y lo busca en la bitácora pública con `ledgerEvents?from=<seq>&limit=1`.
   */
  receivedEvent: LedgerEventSchema.optional(),
});
export type TrackingView = z.infer<typeof TrackingViewSchema>;

export const ReporterMessageRequestSchema = TrackingCredentialsSchema.extend({
  sequence: MailboxSequenceSchema,
  envelope: HpkeEnvelopeSchema,
  signature: Base64UrlSchema,
});
export type ReporterMessageRequest = z.infer<typeof ReporterMessageRequestSchema>;
