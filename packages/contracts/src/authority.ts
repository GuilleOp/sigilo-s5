// Panel de la autoridad competente. La identidad sellada nunca viaja en listados:
// solo se entrega mediante una solicitud con fundamento que queda en la bitácora.
import { z } from 'zod';
import {
  ComplaintFactsSchema,
  ComplaintModeSchema,
  ComplaintStatusSchema,
  EvidenceDescriptorSchema,
} from './complaint.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { MailboxMessageSchema } from './mailbox.ts';
import { Base64UrlSchema, DayDateSchema, FolioSchema } from './primitives.ts';

export const ComplaintSummarySchema = z.object({
  folio: FolioSchema,
  mode: ComplaintModeSchema,
  status: ComplaintStatusSchema,
  receivedOn: DayDateSchema,
  stateCode: z.string(),
  offenseCode: z.string(),
  protectionRequested: z.boolean(),
});
export type ComplaintSummary = z.infer<typeof ComplaintSummarySchema>;

export const ComplaintDetailSchema = z.object({
  summary: ComplaintSummarySchema,
  facts: ComplaintFactsSchema,
  evidence: z.array(EvidenceDescriptorSchema),
  reporterBoxPublicKey: Base64UrlSchema,
  reporterSigningPublicKey: Base64UrlSchema,
  messages: z.array(MailboxMessageSchema),
  identityOpenedCount: z.number().int().nonnegative(),
});
export type ComplaintDetail = z.infer<typeof ComplaintDetailSchema>;

export const OpenIdentityRequestSchema = z.object({
  /** Fundamento legal y motivo. Visible para la persona denunciante. */
  legalBasis: z.string().min(20).max(1000),
});
export type OpenIdentityRequest = z.infer<typeof OpenIdentityRequestSchema>;

export const OpenIdentityResponseSchema = z.object({
  sealedIdentity: HpkeEnvelopeSchema,
  ledgerSeq: z.number().int().nonnegative(),
});
export type OpenIdentityResponse = z.infer<typeof OpenIdentityResponseSchema>;

export const UpdateStatusRequestSchema = z.object({
  status: ComplaintStatusSchema,
});
export type UpdateStatusRequest = z.infer<typeof UpdateStatusRequestSchema>;

export const AuthorityMessageRequestSchema = z.object({
  envelope: HpkeEnvelopeSchema,
  signature: Base64UrlSchema,
});
export type AuthorityMessageRequest = z.infer<typeof AuthorityMessageRequestSchema>;
