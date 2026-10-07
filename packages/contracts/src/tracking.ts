// Seguimiento por parte de la persona denunciante con folio y llave derivada del recibo.
import { z } from 'zod';
import { ComplaintModeSchema, ComplaintStatusSchema, SignedReceiptSchema } from './complaint.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { MailboxMessageSchema } from './mailbox.ts';
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

/** Cada apertura de la identidad sellada queda visible para la persona denunciante. */
export const IdentityAccessEntrySchema = z.object({
  on: DayDateSchema,
  actorRole: z.literal('authority'),
  legalBasis: z.string(),
  ledgerSeq: z.number().int().nonnegative(),
});
export type IdentityAccessEntry = z.infer<typeof IdentityAccessEntrySchema>;

export const TrackingViewSchema = z.object({
  folio: FolioSchema,
  mode: ComplaintModeSchema,
  status: ComplaintStatusSchema,
  timeline: z.array(TimelineEntrySchema),
  identityAccess: z.array(IdentityAccessEntrySchema),
  messages: z.array(MailboxMessageSchema),
  receipt: SignedReceiptSchema,
});
export type TrackingView = z.infer<typeof TrackingViewSchema>;

export const ReporterMessageRequestSchema = TrackingCredentialsSchema.extend({
  envelope: HpkeEnvelopeSchema,
  signature: Base64UrlSchema,
});
export type ReporterMessageRequest = z.infer<typeof ReporterMessageRequestSchema>;
