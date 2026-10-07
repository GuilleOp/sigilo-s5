// Envío de denuncia. El servidor recibe hechos legibles (necesarios para el trámite)
// y, solo en modo "sealed", la identidad cifrada hacia la autoridad competente.
import { z } from 'zod';
import { isEntityId, isMunicipalityOf, isOffenseCode, isStateCode } from './catalogs/index.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import {
  Base64UrlSchema,
  DayDateSchema,
  FolioSchema,
  KeyIdSchema,
  MonthPeriodSchema,
  Sha256HexSchema,
} from './primitives.ts';

/** anonymous: sin identidad. sealed: identidad cifrada que solo abre la autoridad. */
export const ComplaintModeSchema = z.enum(['anonymous', 'sealed']);
export type ComplaintMode = z.infer<typeof ComplaintModeSchema>;

export const ComplaintStatusSchema = z.enum([
  'received',
  'routing',
  'routed',
  'investigating',
  'classified',
  'archived',
  'resolved',
]);
export type ComplaintStatus = z.infer<typeof ComplaintStatusSchema>;

/** Las pruebas siempre llegan como imagen limpia (los PDF se convierten a imagen). */
export const EvidenceMediaTypeSchema = z.enum(['image/jpeg', 'image/png']);
export type EvidenceMediaType = z.infer<typeof EvidenceMediaTypeSchema>;

export const MAX_EVIDENCE_ITEMS = 10;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export const EvidenceDescriptorSchema = z.object({
  evidenceId: z.string().regex(/^[0-9a-f]{32}$/),
  mediaType: EvidenceMediaTypeSchema,
  /** Digesto del archivo limpio, tal como lo recibe la autoridad. */
  sha256: Sha256HexSchema,
  sizeBytes: z.number().int().positive().max(MAX_EVIDENCE_BYTES),
});
export type EvidenceDescriptor = z.infer<typeof EvidenceDescriptorSchema>;

export const EvidenceUploadResponseSchema = EvidenceDescriptorSchema;
export type EvidenceUploadResponse = z.infer<typeof EvidenceUploadResponseSchema>;

/** Clave INEGI de entidad federativa (2 dígitos) que existe en el catálogo. */
export const StateCodeSchema = z
  .string()
  .regex(/^\d{2}$/, 'Entidad inválida')
  .refine(isStateCode, 'Entidad desconocida');

/** Clave INEGI de municipio (3 dígitos). Su pertenencia a la entidad se valida en los hechos. */
export const MunicipalityCodeSchema = z.string().regex(/^\d{3}$/, 'Municipio inválido');

/** Identificador de un ente público del catálogo. */
export const EntityIdSchema = z.string().max(64).refine(isEntityId, 'Ente público desconocido');

/** Clave de conducta del catálogo (principal o equivalente). */
export const OffenseCodeSchema = z.string().max(64).refine(isOffenseCode, 'Conducta desconocida');

/**
 * Hechos legibles de la denuncia.
 * Seguridad: las claves de ubicación, ente y conducta solo pueden tomar valores de los catálogos,
 * porque aparecen en los datos abiertos; el texto libre queda en `accused` y `description`, que
 * nunca se publican.
 */
export const ComplaintFactsSchema = z
  .object({
    /** Clave INEGI de entidad federativa (2 dígitos). */
    stateCode: StateCodeSchema,
    /** Clave INEGI de municipio (3 dígitos). Opcional: menor precisión, menor riesgo. */
    municipalityCode: MunicipalityCodeSchema.optional(),
    /** Identificador del ente público en el catálogo local. */
    entityId: EntityIdSchema,
    /** Clave de la conducta en el catálogo (LGRA o Código Penal Federal). */
    offenseCode: OffenseCodeSchema,
    occurredPeriod: MonthPeriodSchema,
    /** Persona o cargo denunciado, en texto libre. */
    accused: z.string().min(1).max(2000),
    description: z.string().min(20).max(10000),
  })
  .superRefine((facts, ctx) => {
    const { stateCode, municipalityCode } = facts;
    if (municipalityCode !== undefined && !isMunicipalityOf(stateCode, municipalityCode)) {
      ctx.addIssue({
        code: 'custom',
        path: ['municipalityCode'],
        message: 'El municipio no pertenece a la entidad.',
      });
    }
  });
export type ComplaintFacts = z.infer<typeof ComplaintFactsSchema>;

/** Contenido del bloque de identidad antes de cifrarse (solo existe en el navegador). */
export const IdentityBlockSchema = z.object({
  fullName: z.string().min(1).max(200),
  /** Medio de contacto opcional; el buzón hace innecesario pedirlo. */
  contact: z.string().max(200).optional(),
  witnesses: z.array(z.string().max(500)).max(10),
  /** Digestos de las pruebas originales (antes de limpiar), para cadena de custodia. */
  originalEvidenceSha256: z.array(Sha256HexSchema).max(MAX_EVIDENCE_ITEMS),
});
export type IdentityBlock = z.infer<typeof IdentityBlockSchema>;

export const ReporterKeysSchema = z.object({
  /** X25519 para recibir mensajes cifrados del buzón. */
  boxPublicKey: Base64UrlSchema,
  /** Ed25519 para firmar respuestas y complementos. */
  signingPublicKey: Base64UrlSchema,
});
export type ReporterKeys = z.infer<typeof ReporterKeysSchema>;

export const SubmitComplaintRequestSchema = z
  .object({
    version: z.literal(1),
    mode: ComplaintModeSchema,
    facts: ComplaintFactsSchema,
    evidence: z.array(EvidenceDescriptorSchema).max(MAX_EVIDENCE_ITEMS),
    sealedIdentity: HpkeEnvelopeSchema.optional(),
    protectionRequested: z.boolean(),
    reporterKeys: ReporterKeysSchema,
    /** SHA-256 de la llave de autenticación derivada del recibo. */
    authVerifier: Base64UrlSchema,
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'sealed' && !value.sealedIdentity) {
      ctx.addIssue({ code: 'custom', message: 'El modo sealed requiere identidad cifrada.' });
    }
    if (value.mode === 'anonymous' && (value.sealedIdentity || value.protectionRequested)) {
      ctx.addIssue({ code: 'custom', message: 'El modo anonymous no admite identidad.' });
    }
  });
export type SubmitComplaintRequest = z.infer<typeof SubmitComplaintRequestSchema>;

/** Comprobante firmado por el servidor: prueba de que la denuncia fue recibida. */
export const SignedReceiptSchema = z.object({
  folio: FolioSchema,
  /**
   * SHA-256 de la forma canónica de la solicitud enviada, con `sealedIdentity` sustituido por su
   * propio digesto (ver `computeSubmissionDigest` en @sigilo/core).
   */
  submissionDigest: Sha256HexSchema,
  receivedOn: DayDateSchema,
  /**
   * Identificador de su evento `complaint.received`: el `payloadDigest` del evento, que es
   * `sha256Hex(canonicalize({ folio, submissionDigest }))`. No es la secuencia: el evento recibe su
   * lugar en la bitácora hasta que se cierra el día, en orden barajado.
   */
  payloadDigest: Sha256HexSchema,
  serverKeyId: KeyIdSchema,
  /** Firma Ed25519 sobre la forma canónica del comprobante sin este campo. */
  signature: Base64UrlSchema,
});
export type SignedReceipt = z.infer<typeof SignedReceiptSchema>;

export const SubmitComplaintResponseSchema = z.object({
  folio: FolioSchema,
  receipt: SignedReceiptSchema,
});
export type SubmitComplaintResponse = z.infer<typeof SubmitComplaintResponseSchema>;
