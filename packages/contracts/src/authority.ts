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
  SignedReceiptSchema,
  StateCodeSchema,
  SubmitComplaintRequestSchema,
} from './complaint.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { MailboxMessageSchema, MailboxSequenceSchema } from './mailbox.ts';
import { primaryOffenseCode } from './catalogs/index.ts';
import { AccountIdSchema } from './authority-access.ts';
import { AuthorityIdSchema } from './network.ts';
import { Base64UrlSchema, DayDateSchema, FolioSchema, Sha256HexSchema } from './primitives.ts';
import {
  ClosureReasonSchema,
  ManagementStateSchema,
  QualificationSeveritySchema,
} from './procedure.ts';
import {
  AuditSignalViewSchema,
  ConflictReviewSchema,
  ContextSheetViewSchema,
  CorroborationViewSchema,
} from './context-view.ts';
import { RelayRequestSchema, RelayResponseSchema } from './network.ts';
import {
  AgreementTextSchema,
  LegalBasisTextSchema,
  ProcedureViewSchema,
  RuleTriggerViewSchema,
  TurnSemaphoreSchema,
} from './procedure-view.ts';
import { OpeningIdSchema } from './tracking.ts';

export const ComplaintSummarySchema = z
  .object({
    folio: FolioSchema,
    mode: ComplaintModeSchema,
    status: ComplaintStatusSchema,
    receivedOn: DayDateSchema.meta({ description: 'Día de recepción (UTC).' }),
    stateCode: StateCodeSchema,
    /** Clave principal de la conducta (las equivalentes del CPF se guardan como la de la LGRA). */
    offenseCode: OffenseCodeSchema.meta({
      description:
        'Clave principal de la conducta (las equivalentes del CPF se guardan como la de la LGRA).',
    }),
    protectionRequested: z
      .boolean()
      .meta({ description: 'La persona pidió medidas de protección.' }),
    managementState: ManagementStateSchema.optional(),
    assignedAuthorityId: AuthorityIdSchema.optional().meta({
      description: 'Autoridad que tiene la denuncia (el buzón general mientras no se turna).',
    }),
    turnSemaphore: TurnSemaphoreSchema.optional().meta({
      description:
        'Semáforo de turnado, solo si la denuncia espera turno o aceptación. Opcional: los nodos anteriores no lo envían.',
    }),
  })
  .meta({
    description: 'Resumen de una denuncia en el listado de la autoridad; nunca trae la identidad.',
  });
export type ComplaintSummary = z.infer<typeof ComplaintSummarySchema>;

/** Aprobaciones distintas que exige una apertura (2 de 3 custodios). */
export const IDENTITY_APPROVAL_THRESHOLD = 2;

/** Días naturales que una solicitud de apertura espera su segunda aprobación antes de vencer. */
export const IDENTITY_REQUEST_TTL_DAYS = 7;

export const IdentityApprovalSchema = z
  .object({
    accountId: AccountIdSchema,
    on: DayDateSchema.meta({ description: 'Día de la aprobación.' }),
    legalBasis: LegalBasisTextSchema,
  })
  .meta({ description: 'Aprobación de una persona de la autoridad competente.' });
export type IdentityApproval = z.infer<typeof IdentityApprovalSchema>;

/**
 * Solicitud de apertura de identidad. `pending` espera otra aprobación; `approved` alcanzó el
 * umbral y su apertura ya quedó registrada (la persona la ve); `expired` venció sin el umbral.
 */
export const IdentityOpeningRequestViewSchema = z
  .object({
    requestId: OpeningIdSchema,
    requestedOn: DayDateSchema,
    legalBasis: LegalBasisTextSchema,
    status: z.enum(['pending', 'approved', 'expired']).meta({
      description:
        'pending (espera otra aprobación), approved (se abrió y la persona lo ve) o expired (venció sin el umbral).',
    }),
    approvals: z
      .array(IdentityApprovalSchema)
      .meta({ description: 'Aprobaciones de personas distintas, incluida la de quien solicitó.' }),
    threshold: z
      .number()
      .int()
      .min(2)
      .meta({ description: 'Aprobaciones distintas que exige la apertura.' }),
    expiresOn: DayDateSchema.meta({
      description: 'Último día en que puede recibir la aprobación que le falta.',
    }),
    purpose: z.enum(['authority', 'appeal']).meta({
      description:
        'authority: apertura que pide la autoridad (2 de 3); appeal: la persona denunciante pidió abrirla solo para su recurso de inconformidad, y la entrega del sobre exige dos aprobaciones, al menos una de supervisión.',
    }),
  })
  .meta({ description: 'Solicitud de apertura de la identidad y sus aprobaciones.' });
export type IdentityOpeningRequestView = z.infer<typeof IdentityOpeningRequestViewSchema>;

/**
 * Detalle para la autoridad. Trae todo lo necesario para recalcular el contexto del sobre de
 * identidad (`version`, modo, hechos, pruebas, protección, `reporterKeys` y `authVerifier`); si el
 * servidor alterara cualquiera de esos datos, el sobre no abriría. Con `sealedIdentityDigest`
 * además se recalcula `submissionDigest` (`submissionDigestFromDetail`) y se compara con el evento
 * `complaint.received` publicado: así se comprueban las llaves del buzón también en modo anónimo.
 * `facts` son los hechos tal como se enviaron (la clave de conducta puede ser una equivalente).
 */
/** Artículo equivalente en el catálogo de faltas del S5. */
export const S5ReferenceSchema = z
  .object({
    s5Id: z.number().int().nonnegative().meta({
      description: 'Identificador de la entrada en el catálogo de faltas del S5.',
    }),
    law: z.string().max(300).meta({ description: 'Ley o código.' }),
    article: z.string().max(80).meta({ description: 'Artículo y fracción.' }),
  })
  .strict()
  .meta({ description: 'Artículo de la ley local equivalente a la conducta, con su id del S5.' });

export const ComplaintDetailSchema = z
  .object({
    summary: ComplaintSummarySchema,
    /** Versión del formato de la solicitud original. */
    version: z.literal(1).meta({ description: 'Versión del formato de la solicitud original.' }),
    facts: ComplaintFactsSchema,
    evidence: z
      .array(EvidenceDescriptorSchema)
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Descriptores de las pruebas, tal como se enviaron.' }),
    reporterKeys: ReporterKeysSchema,
    /** Digesto de la llave de autenticación: forma parte del AAD de la identidad, no autentica. */
    authVerifier: Base64UrlSchema.meta({
      description:
        'Digesto de la llave de autenticación; forma parte del contexto de la identidad, no autentica.',
    }),
    /** `sha256Hex(canonicalize(sealedIdentity))`; solo en modo `sealed`. */
    sealedIdentityDigest: Sha256HexSchema.optional().meta({
      description: 'SHA-256 de la forma canónica del sobre de identidad; solo en modo sealed.',
    }),
    /** `sha256Hex(canonicalize(escalationEnvelope))`, si la denuncia trae segunda llave. */
    escalationEnvelopeDigest: Sha256HexSchema.optional().meta({
      description:
        'SHA-256 de la forma canónica del sobre de escalamiento (segunda llave), si la denuncia lo trae.',
    }),
    /** `sha256Hex(canonicalize(corroboration))`, si la denuncia pidió corroboración ciega. */
    corroborationDigest: Sha256HexSchema.optional().meta({
      description:
        'SHA-256 de la forma canónica de la corroboración ciega, si la denuncia la trae; la etiqueta no se muestra.',
    }),
    /** Secuencia del evento `complaint.received` una vez publicado; falta mientras está pendiente. */
    receivedEventSeq: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: 'Secuencia del evento complaint.received una vez publicado.' }),
    /**
     * Día (UTC) en que la retención borrará los archivos de las pruebas: solo mientras la denuncia
     * está en `received` (sin atender) o `archived`, tiene pruebas guardadas y hay retención.
     */
    evidenceDeletionOn: DayDateSchema.optional().meta({
      description: 'Día en que la retención borrará los archivos de las pruebas, si aplica.',
    }),
    /** Pruebas cuyo archivo sigue guardado (las borradas por retención o descarte no cuentan). */
    storedEvidenceCount: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_EVIDENCE_ITEMS)
      .optional()
      .meta({ description: 'Pruebas cuyo archivo sigue guardado.' }),
    messages: z.array(MailboxMessageSchema).meta({ description: 'Mensajes del buzón, cifrados.' }),
    identityOpenedCount: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'Veces que se ha abierto la identidad sellada.' }),
    /**
     * Artículos del catálogo de faltas del S5 que equivalen a la conducta en la entidad de los
     * hechos (o la federal si la oficina es federal). Los calcula el nodo; no los envía quien
     * denuncia ni forman parte del comprobante.
     */
    s5References: z.array(S5ReferenceSchema).max(200).optional().meta({
      description:
        'Artículos equivalentes en el catálogo de faltas del S5 (ley de responsabilidades y código penal de la entidad), con su id del S5. Los calcula el nodo.',
    }),
    procedure: ProcedureViewSchema.optional(),
    identityRequests: z
      .array(IdentityOpeningRequestViewSchema)
      .optional()
      .meta({ description: 'Solicitudes de apertura de la identidad y sus aprobaciones.' }),
    contextSheet: ContextSheetViewSchema.optional(),
    conflictReview: ConflictReviewSchema.optional(),
    corroboration: CorroborationViewSchema.optional(),
    auditSignals: z
      .array(AuditSignalViewSchema)
      .optional()
      .meta({ description: 'Señales del auditor sobre los acuerdos y el caso.' }),
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
  })
  .meta({
    description:
      'Detalle para la autoridad, con todo lo necesario para recalcular el contexto del sobre de identidad. La identidad no viene aquí.',
  });
export type ComplaintDetail = z.infer<typeof ComplaintDetailSchema>;

export const OpenIdentityRequestSchema = z
  .strictObject({
    /** Fundamento legal y motivo. Visible para la persona denunciante. */
    legalBasis: LegalBasisTextSchema,
  })
  .meta({
    description:
      'Solicitud de apertura de la identidad sellada, con su fundamento; cuenta como la primera aprobación.',
  });
export type OpenIdentityRequest = z.infer<typeof OpenIdentityRequestSchema>;

/** Aprobación de una segunda persona, con su propio fundamento. */
export const ApproveIdentityRequestSchema = z
  .strictObject({ legalBasis: LegalBasisTextSchema })
  .meta({
    description: 'Aprobación de una solicitud de apertura por otra persona de la autoridad.',
  });
export type ApproveIdentityRequest = z.infer<typeof ApproveIdentityRequestSchema>;

/**
 * Sobre de identidad. Su contexto (AAD) se recalcula desde `ComplaintDetail`. El servidor lo
 * entrega solo a quien aprobó una solicitud que alcanzó el umbral.
 */
export const OpenIdentityResponseSchema = z
  .object({
    sealedIdentity: HpkeEnvelopeSchema,
    /** Identificador de la apertura; forma parte de los datos de su evento `identity.opened`. */
    openingId: OpeningIdSchema,
  })
  .meta({
    description: 'Sobre de identidad; la autoridad lo abre en su equipo con su llave privada.',
  });
export type OpenIdentityResponse = z.infer<typeof OpenIdentityResponseSchema>;

/** Denuncia escalada a la autoridad supervisora, sin contenido. */
export const EscalationSummarySchema = z
  .object({
    folio: FolioSchema,
    escalatedOn: DayDateSchema,
    fromAuthorityId: AuthorityIdSchema,
    rules: z.array(RuleTriggerViewSchema).min(1).meta({
      description:
        'Reglas que se cumplieron: de escalamiento (effect escalate, entregan el sobre) o avisos para supervisión (effect alert, como el turnado vencido, sin sobre).',
    }),
  })
  .meta({
    description:
      'Denuncia escalada a la supervisora por una regla pública, o con un aviso para supervisión (turnado vencido) que no entrega el sobre.',
  });
export type EscalationSummary = z.infer<typeof EscalationSummarySchema>;

/**
 * Entrega a la supervisora: el sobre de escalamiento y lo necesario para comprobar, después de
 * abrirlo, que es el que envió la persona (se recalcula `submissionDigest` y se compara con el
 * evento `complaint.received` publicado).
 */
export const EscalationDeliverySchema = z
  .object({
    folio: FolioSchema,
    escalationEnvelope: HpkeEnvelopeSchema,
    authVerifier: Base64UrlSchema,
    reporterKeys: ReporterKeysSchema,
    sealedIdentityDigest: Sha256HexSchema.optional().meta({
      description:
        'SHA-256 del sobre de identidad (solo en modo sealed), para recalcular el digesto del envío; la supervisora nunca recibe la identidad.',
    }),
    corroborationDigest: Sha256HexSchema.optional().meta({
      description:
        'SHA-256 de la corroboración ciega, si la denuncia la trae, para recalcular el digesto del envío; la etiqueta no se entrega.',
    }),
    receivedEventSeq: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .meta({ description: 'Secuencia del evento complaint.received una vez publicado.' }),
    rules: z
      .array(RuleTriggerViewSchema)
      .min(1)
      .meta({ description: 'Reglas de escalamiento que se cumplieron.' }),
  })
  .meta({
    description:
      'Sobre de escalamiento (segunda llave) con lo necesario para verificarlo; nunca la identidad.',
  });
export type EscalationDelivery = z.infer<typeof EscalationDeliverySchema>;

/** Resultado de descartar las pruebas de una denuncia: cuántos archivos se borraron. */
export const DiscardEvidenceResponseSchema = z
  .object({
    discarded: z
      .number()
      .int()
      .nonnegative()
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Archivos borrados; 0 si ya no había.' }),
  })
  .meta({ description: 'Resultado del descarte de pruebas.' });
export type DiscardEvidenceResponse = z.infer<typeof DiscardEvidenceResponseSchema>;

export const AuthorityMessageRequestSchema = z
  .strictObject({
    sequence: MailboxSequenceSchema,
    envelope: HpkeEnvelopeSchema,
    signature: Base64UrlSchema.meta({
      description: 'Firma Ed25519 de la autoridad sobre { envelope, from, sequence }.',
    }),
  })
  .meta({
    description: 'Mensaje de la autoridad por el buzón, cifrado hacia la persona denunciante.',
  });
export type AuthorityMessageRequest = z.infer<typeof AuthorityMessageRequestSchema>;

/**
 * Turnado a una autoridad de otro nodo (SEC-19). El navegador de la autoridad que tiene la
 * denuncia la descifra y la vuelve a cifrar hacia el nodo destino (sobre de red); el servidor solo
 * lo transporta al enrutador y no puede leerlo.
 */
export const TransferComplaintRequestSchema = z
  .strictObject({
    toAuthorityId: AuthorityIdSchema,
    relay: RelayRequestSchema,
    note: z
      .string()
      .min(1)
      .max(2000)
      .meta({ description: 'Nota pública para la persona denunciante.' }),
  })
  .meta({ description: 'Turnado a otro nodo con la denuncia ya re-cifrada en el navegador.' });
export type TransferComplaintRequest = z.infer<typeof TransferComplaintRequestSchema>;

/** Respuesta del enrutador, que solo abre el navegador que turnó (trae el nuevo comprobante). */
export const TransferComplaintResponseSchema = z
  .object({ relay: RelayResponseSchema, transferId: OpeningIdSchema })
  .meta({ description: 'Sobre de vuelta del nodo destino y el identificador del turnado.' });
export type TransferComplaintResponse = z.infer<typeof TransferComplaintResponseSchema>;

/**
 * Comprobante firmado por el nodo destino que el navegador entrega después de abrir la respuesta:
 * el nodo de origen lo verifica con la llave del nodo destino en el directorio y avisa a la persona
 * denunciante con el folio nuevo.
 */
export const TransferReceiptRequestSchema = z
  .strictObject({
    transferId: OpeningIdSchema,
    receipt: SignedReceiptSchema,
    /**
     * Denuncia re-cifrada tal como la recibió el nodo destino: el nodo de origen recalcula su
     * digesto y exige que coincida con el comprobante y que sea la misma denuncia (recibo, llaves
     * y hechos).
     */
    request: SubmitComplaintRequestSchema,
  })
  .meta({
    description:
      'Comprobante del nodo destino de un turnado entre nodos, con la denuncia que recibió para ligarlo a la denuncia turnada.',
  });
export type TransferReceiptRequest = z.infer<typeof TransferReceiptRequestSchema>;

/** Acuerdo recibido por otros medios que la autoridad registra (Bases de la PDN, art. 58). */
export const ImportedClosureSchema = z
  .strictObject({
    fileNumber: z.string().min(1).max(64).meta({ description: 'Expediente del acuerdo.' }),
    issuedOn: DayDateSchema.meta({ description: 'Día del acuerdo.' }),
    reason: ClosureReasonSchema.optional(),
    /** Si el acuerdo califica la falta (LGRA, art. 100), su calificación. */
    qualification: QualificationSeveritySchema.optional(),
    agreement: AgreementTextSchema,
  })
  .meta({ description: 'Acuerdo de cierre o de calificación importado en versión pública.' });

export const ImportClosuresRequestSchema = z
  .strictObject({
    acts: z
      .array(ImportedClosureSchema)
      .min(1)
      .max(1000)
      .meta({ description: 'Acuerdos del lote (hasta 1000).' }),
  })
  .meta({
    description:
      'Lote de acuerdos recibidos por otros medios; queda en la bitácora como un solo evento con su digesto.',
  });
export type ImportClosuresRequest = z.infer<typeof ImportClosuresRequestSchema>;

export const ImportClosuresResponseSchema = z
  .object({
    imported: z.number().int().nonnegative().meta({ description: 'Acuerdos nuevos.' }),
    skipped: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'Acuerdos que ya estaban (mismo expediente).' }),
    batchDigest: Sha256HexSchema.meta({ description: 'SHA-256 del lote canónico.' }),
  })
  .meta({ description: 'Resultado de la importación.' });
export type ImportClosuresResponse = z.infer<typeof ImportClosuresResponseSchema>;

/** Conteo de señales del auditor por autoridad y regla, sin folios ni texto. */
export const AuditSummarySchema = z
  .array(
    z.object({
      authorityId: AuthorityIdSchema,
      ruleId: z.string().meta({ description: 'Regla del auditor (AUD-01 a AUD-08).' }),
      count: z.number().int().nonnegative().meta({ description: 'Señales registradas.' }),
    }),
  )
  .meta({ description: 'Conteos agregados de señales del auditor para el observatorio.' });
export type AuditSummary = z.infer<typeof AuditSummarySchema>;
