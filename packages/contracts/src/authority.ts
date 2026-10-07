// Panel de la autoridad competente. La identidad sellada nunca viaja en listados:
// solo se entrega mediante una solicitud con fundamento que queda en la bitácora.
import { z } from 'zod';
import {
  ComplaintFactsSchema,
  ComplaintModeSchema,
  ComplaintStatusSchema,
  EvidenceDescriptorSchema,
  MAX_EVIDENCE_ITEMS,
  OffenseCodeSchema,
  ReporterKeysSchema,
  StateCodeSchema,
} from './complaint.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { MailboxMessageSchema, MailboxSequenceSchema } from './mailbox.ts';
import { Base64UrlSchema, DayDateSchema, FolioSchema } from './primitives.ts';

export const ComplaintSummarySchema = z.object({
  folio: FolioSchema,
  mode: ComplaintModeSchema,
  status: ComplaintStatusSchema,
  receivedOn: DayDateSchema,
  stateCode: StateCodeSchema,
  offenseCode: OffenseCodeSchema,
  protectionRequested: z.boolean(),
});
export type ComplaintSummary = z.infer<typeof ComplaintSummarySchema>;

/**
 * Detalle para la autoridad. Trae todo lo necesario para recalcular el contexto del sobre de
 * identidad (`version`, modo, hechos, pruebas, protección, `reporterKeys` y `authVerifier`); si el
 * servidor alterara cualquiera de esos datos, el sobre no abriría.
 */
export const ComplaintDetailSchema = z
  .object({
    summary: ComplaintSummarySchema,
    /** Versión del formato de la solicitud original. */
    version: z.literal(1),
    facts: ComplaintFactsSchema,
    evidence: z.array(EvidenceDescriptorSchema).max(MAX_EVIDENCE_ITEMS),
    reporterKeys: ReporterKeysSchema,
    /** Digesto de la llave de autenticación: forma parte del AAD de la identidad, no autentica. */
    authVerifier: Base64UrlSchema,
    messages: z.array(MailboxMessageSchema),
    identityOpenedCount: z.number().int().nonnegative(),
  })
  .superRefine((detail, ctx) => {
    const { summary, facts } = detail;
    if (summary.stateCode !== facts.stateCode || summary.offenseCode !== facts.offenseCode) {
      ctx.addIssue({ code: 'custom', message: 'El resumen no corresponde a los hechos.' });
    }
    const isAnonymous = summary.mode === 'anonymous';
    if (isAnonymous && (summary.protectionRequested || detail.identityOpenedCount > 0)) {
      ctx.addIssue({ code: 'custom', message: 'El modo anonymous no admite identidad.' });
    }
  });
export type ComplaintDetail = z.infer<typeof ComplaintDetailSchema>;

export const OpenIdentityRequestSchema = z.object({
  /** Fundamento legal y motivo. Visible para la persona denunciante. */
  legalBasis: z.string().min(20).max(1000),
});
export type OpenIdentityRequest = z.infer<typeof OpenIdentityRequestSchema>;

/** Sobre de identidad. Su contexto (AAD) se recalcula desde `ComplaintDetail`. */
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
  sequence: MailboxSequenceSchema,
  envelope: HpkeEnvelopeSchema,
  signature: Base64UrlSchema,
});
export type AuthorityMessageRequest = z.infer<typeof AuthorityMessageRequestSchema>;
