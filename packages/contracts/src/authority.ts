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
import { primaryOffenseCode } from './catalogs/index.ts';
import { Base64UrlSchema, DayDateSchema, FolioSchema, Sha256HexSchema } from './primitives.ts';
import { OpeningIdSchema } from './tracking.ts';

export const ComplaintSummarySchema = z.object({
  folio: FolioSchema,
  mode: ComplaintModeSchema,
  status: ComplaintStatusSchema,
  receivedOn: DayDateSchema,
  stateCode: StateCodeSchema,
  /** Clave principal de la conducta (las equivalentes del CPF se guardan como la de la LGRA). */
  offenseCode: OffenseCodeSchema,
  protectionRequested: z.boolean(),
});
export type ComplaintSummary = z.infer<typeof ComplaintSummarySchema>;

/**
 * Detalle para la autoridad. Trae todo lo necesario para recalcular el contexto del sobre de
 * identidad (`version`, modo, hechos, pruebas, protección, `reporterKeys` y `authVerifier`); si el
 * servidor alterara cualquiera de esos datos, el sobre no abriría. Con `sealedIdentityDigest`
 * además se recalcula `submissionDigest` (`submissionDigestFromDetail`) y se compara con el evento
 * `complaint.received` publicado: así se comprueban las llaves del buzón también en modo anónimo.
 * `facts` son los hechos tal como se enviaron (la clave de conducta puede ser una equivalente).
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
    /** `sha256Hex(canonicalize(sealedIdentity))`; solo en modo `sealed`. */
    sealedIdentityDigest: Sha256HexSchema.optional(),
    /** Secuencia del evento `complaint.received` una vez publicado; falta mientras está pendiente. */
    receivedEventSeq: z.number().int().nonnegative().optional(),
    messages: z.array(MailboxMessageSchema),
    identityOpenedCount: z.number().int().nonnegative(),
  })
  .superRefine((detail, ctx) => {
    const { summary, facts } = detail;
    const isSameOffense = summary.offenseCode === primaryOffenseCode(facts.offenseCode);
    if (summary.stateCode !== facts.stateCode || !isSameOffense) {
      ctx.addIssue({ code: 'custom', message: 'El resumen no corresponde a los hechos.' });
    }
    const isAnonymous = summary.mode === 'anonymous';
    if (isAnonymous && (summary.protectionRequested || detail.identityOpenedCount > 0)) {
      ctx.addIssue({ code: 'custom', message: 'El modo anonymous no admite identidad.' });
    }
    if (isAnonymous === (detail.sealedIdentityDigest !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sealedIdentityDigest'],
        message: 'Solo el modo sealed lleva el digesto del sobre, y siempre.',
      });
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
  /** Identificador de la apertura; forma parte de los datos de su evento `identity.opened`. */
  openingId: OpeningIdSchema,
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
