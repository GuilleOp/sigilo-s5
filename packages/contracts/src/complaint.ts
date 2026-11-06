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
export const ComplaintModeSchema = z.enum(['anonymous', 'sealed']).meta({
  description:
    'Modo de la denuncia: anonymous (sin identidad) o sealed (identidad cifrada que solo abre la autoridad, con registro público).',
});
export type ComplaintMode = z.infer<typeof ComplaintModeSchema>;

export const ComplaintStatusSchema = z
  .enum(['received', 'routing', 'routed', 'investigating', 'classified', 'archived', 'resolved'])
  .meta({
    description:
      'Estatus de la denuncia en la API v1. Su lugar en el flujo de gestión y en las etapas legales está en el catálogo COMPLAINT_STATUSES.',
  });
export type ComplaintStatus = z.infer<typeof ComplaintStatusSchema>;

/** Las pruebas siempre llegan como imagen limpia (los PDF se convierten a imagen). */
export const EvidenceMediaTypeSchema = z
  .enum(['image/jpeg', 'image/png'])
  .meta({ description: 'Tipo de la prueba ya limpia: imagen JPEG o PNG.' });
export type EvidenceMediaType = z.infer<typeof EvidenceMediaTypeSchema>;

export const MAX_EVIDENCE_ITEMS = 10;
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export const EvidenceDescriptorSchema = z
  .strictObject({
    evidenceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .meta({ description: 'Identificador aleatorio de la prueba (16 bytes en hexadecimal).' }),
    mediaType: EvidenceMediaTypeSchema,
    /** Digesto del archivo limpio, tal como lo recibe la autoridad. */
    sha256: Sha256HexSchema.meta({
      description: 'Digesto del archivo limpio, tal como lo recibe la autoridad.',
    }),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_EVIDENCE_BYTES)
      .meta({ description: 'Tamaño del archivo en bytes (máximo 10 MiB).' }),
  })
  .meta({
    description: 'Descriptor de una prueba subida: identifica el archivo sin revelar su contenido.',
  });
export type EvidenceDescriptor = z.infer<typeof EvidenceDescriptorSchema>;

export const EvidenceUploadResponseSchema = EvidenceDescriptorSchema;
export type EvidenceUploadResponse = z.infer<typeof EvidenceUploadResponseSchema>;

/** Clave INEGI de entidad federativa (2 dígitos) que existe en el catálogo. */
export const StateCodeSchema = z
  .string()
  .regex(/^\d{2}$/, 'Entidad inválida')
  .refine(isStateCode, 'Entidad desconocida')
  .meta({
    description: 'Clave INEGI de la entidad federativa (2 dígitos).',
    examples: ['22'],
    'x-catalog': 'STATES',
  });

/** Clave INEGI de municipio (3 dígitos). Su pertenencia a la entidad se valida en los hechos. */
export const MunicipalityCodeSchema = z
  .string()
  .regex(/^\d{3}$/, 'Municipio inválido')
  .meta({
    description: 'Clave INEGI del municipio (3 dígitos); debe pertenecer a la entidad.',
    examples: ['014'],
    'x-catalog': 'MUNICIPALITIES',
  });

/** Identificador de un ente público del catálogo. */
export const EntityIdSchema = z
  .string()
  .max(64)
  .refine(isEntityId, 'Ente público desconocido')
  .meta({
    description: 'Identificador del ente público en el catálogo del despliegue.',
    examples: ['VE-OBRAS'],
    'x-catalog': 'PUBLIC_ENTITIES',
  });

/** Clave de conducta del catálogo (principal o equivalente). */
export const OffenseCodeSchema = z
  .string()
  .max(64)
  .refine(isOffenseCode, 'Conducta desconocida')
  .meta({
    description: 'Clave de la conducta: ley y artículo (LGRA o Código Penal Federal).',
    examples: ['LGRA-52'],
    'x-catalog': 'OFFENSES',
  });

/**
 * Hechos legibles de la denuncia.
 * Seguridad: las claves de ubicación, ente y conducta solo pueden tomar valores de los catálogos,
 * porque aparecen en los datos abiertos; el texto libre queda en `accused` y `description`, que
 * nunca se publican.
 */
export const ComplaintFactsSchema = z
  .strictObject({
    /** Clave INEGI de entidad federativa (2 dígitos). */
    stateCode: StateCodeSchema,
    /** Clave INEGI de municipio (3 dígitos). Opcional: menor precisión, menor riesgo. */
    municipalityCode: MunicipalityCodeSchema.optional(),
    /** Identificador del ente público en el catálogo local. */
    entityId: EntityIdSchema,
    /** Clave de la conducta en el catálogo (LGRA o Código Penal Federal). */
    offenseCode: OffenseCodeSchema,
    occurredPeriod: MonthPeriodSchema.meta({
      description: 'Mes aproximado en que ocurrieron los hechos.',
    }),
    /** Persona o cargo denunciado, en texto libre. */
    accused: z
      .string()
      .min(1)
      .max(2000)
      .meta({ description: 'Persona o cargo denunciado, en texto libre. Nunca se publica.' }),
    description: z
      .string()
      .min(20)
      .max(10000)
      .meta({ description: 'Relato de los hechos, en texto libre. Nunca se publica.' }),
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
  })
  .meta({
    description:
      'Hechos legibles de la denuncia. Las claves de ubicación, ente y conducta salen de catálogos públicos; el texto libre nunca se publica.',
  });
export type ComplaintFacts = z.infer<typeof ComplaintFactsSchema>;

/** Contenido del bloque de identidad antes de cifrarse (solo existe en el navegador). */
export const IdentityBlockSchema = z
  .object({
    fullName: z
      .string()
      .min(1)
      .max(200)
      .meta({ description: 'Nombre completo de la persona denunciante.' }),
    /** Medio de contacto opcional; el buzón hace innecesario pedirlo. */
    contact: z
      .string()
      .max(200)
      .optional()
      .meta({ description: 'Medio de contacto opcional; el buzón hace innecesario pedirlo.' }),
    witnesses: z
      .array(z.string().max(500))
      .max(10)
      .meta({ description: 'Testigos, en texto libre.' }),
    /** Digestos de las pruebas originales (antes de limpiar), para cadena de custodia. */
    originalEvidenceSha256: z.array(Sha256HexSchema).max(MAX_EVIDENCE_ITEMS).meta({
      description:
        'Digestos de las pruebas originales, antes de limpiarlas, para la cadena de custodia.',
    }),
  })
  .meta({
    description:
      'Contenido de la identidad sellada antes de cifrarse. Solo existe en el navegador y en el equipo de la autoridad; nunca viaja en claro.',
  });
export type IdentityBlock = z.infer<typeof IdentityBlockSchema>;

export const ReporterKeysSchema = z
  .strictObject({
    /** X25519 para recibir mensajes cifrados del buzón. */
    boxPublicKey: Base64UrlSchema.meta({
      description:
        'Llave pública X25519, derivada del recibo, para recibir mensajes cifrados del buzón.',
    }),
    /** Ed25519 para firmar respuestas y complementos. */
    signingPublicKey: Base64UrlSchema.meta({
      description: 'Llave pública Ed25519, derivada del recibo, para firmar respuestas.',
    }),
  })
  .meta({
    description: 'Llaves públicas de la persona denunciante, derivadas de su recibo de 8 palabras.',
  });
export type ReporterKeys = z.infer<typeof ReporterKeysSchema>;

export const SubmitComplaintRequestSchema = z
  .strictObject({
    version: z.literal(1).meta({ description: 'Versión del formato de la solicitud.' }),
    mode: ComplaintModeSchema,
    facts: ComplaintFactsSchema,
    evidence: z
      .array(EvidenceDescriptorSchema)
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Descriptores de las pruebas ya subidas (hasta 10).' }),
    sealedIdentity: HpkeEnvelopeSchema.optional(),
    /**
     * Segunda llave (ADR 0007): hechos y pruebas cifrados hacia la autoridad supervisora, nunca la
     * identidad. El nodo lo guarda sin poder leerlo y lo entrega solo si se cumple una regla de
     * escalamiento.
     */
    escalationEnvelope: HpkeEnvelopeSchema.optional().meta({
      description:
        'Segunda llave: hechos y pruebas cifrados hacia la autoridad supervisora (nunca la identidad). Se entrega solo si se cumple una regla de escalamiento.',
    }),
    protectionRequested: z
      .boolean()
      .meta({ description: 'Solicitud de medidas de protección; solo en modo sealed.' }),
    /**
     * Corroboración ciega (ADR 0006): etiqueta VOPRF y resumen difuso que calculó el navegador. El
     * nodo los registra firmados en el índice; nunca viaja el identificador.
     */
    corroboration: z
      .strictObject({
        epoch: z.number().int().min(1).meta({ description: 'Época de la llave del evaluador.' }),
        tag: Sha256HexSchema.meta({ description: 'Etiqueta de corroboración.' }),
        similarity: Base64UrlSchema.nullable().meta({
          description: 'Resumen difuso del relato (512 bits), o null si el relato es muy corto.',
        }),
      })
      .optional()
      .meta({ description: 'Corroboración ciega opcional: etiqueta y resumen difuso.' }),
    reporterKeys: ReporterKeysSchema,
    /** SHA-256 de la llave de autenticación derivada del recibo. */
    authVerifier: Base64UrlSchema.meta({
      description:
        'SHA-256 de la llave de autenticación derivada del recibo; el recibo nunca se envía.',
    }),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'sealed' && !value.sealedIdentity) {
      ctx.addIssue({ code: 'custom', message: 'El modo sealed requiere identidad cifrada.' });
    }
    if (value.mode === 'anonymous' && (value.sealedIdentity || value.protectionRequested)) {
      ctx.addIssue({ code: 'custom', message: 'El modo anonymous no admite identidad.' });
    }
  })
  .meta({
    description:
      'Envío de una denuncia. En modo sealed lleva sealedIdentity; en modo anonymous no lleva identidad ni protectionRequested = true.',
  });
export type SubmitComplaintRequest = z.infer<typeof SubmitComplaintRequestSchema>;

/**
 * Contenido del sobre de escalamiento antes de cifrarse (solo existe en el navegador de quien
 * denuncia y en el de la supervisora): la parte de la solicitud que cubre `contentDigest`.
 */
export const EscalationContentSchema = z
  .strictObject({
    version: z.literal(1).meta({ description: 'Versión del formato de la solicitud.' }),
    mode: ComplaintModeSchema,
    facts: ComplaintFactsSchema,
    evidence: z
      .array(EvidenceDescriptorSchema)
      .max(MAX_EVIDENCE_ITEMS)
      .meta({ description: 'Descriptores de las pruebas, tal como se enviaron.' }),
    protectionRequested: z
      .boolean()
      .meta({ description: 'Solicitud de medidas de protección; solo en modo sealed.' }),
  })
  .meta({
    description:
      'Contenido del sobre de escalamiento antes de cifrarse: versión, modo, hechos, pruebas y protección. Nunca la identidad.',
  });
export type EscalationContent = z.infer<typeof EscalationContentSchema>;

/** Comprobante firmado por el servidor: prueba de que la denuncia fue recibida. */
export const SignedReceiptSchema = z
  .object({
    folio: FolioSchema,
    /**
     * SHA-256 de la forma canónica de la solicitud enviada, con `sealedIdentity` sustituido por su
     * propio digesto (ver `computeSubmissionDigest` en @sigilo/core).
     */
    submissionDigest: Sha256HexSchema.meta({
      description:
        'SHA-256 de la forma canónica de la solicitud, con sealedIdentity sustituido por su digesto.',
    }),
    receivedOn: DayDateSchema.meta({ description: 'Día de recepción (UTC).' }),
    /**
     * Identificador de su evento `complaint.received`: el `payloadDigest` del evento, que es
     * `sha256Hex(canonicalize({ folio, submissionDigest }))`. No es la secuencia: el evento recibe su
     * lugar en la bitácora hasta que se cierra el día, en orden barajado.
     */
    payloadDigest: Sha256HexSchema.meta({
      description: 'Identifica el evento complaint.received en la bitácora.',
    }),
    serverKeyId: KeyIdSchema,
    /** Firma Ed25519 sobre la forma canónica del comprobante sin este campo. */
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del servidor sobre la forma canónica del comprobante sin este campo.',
    }),
  })
  .meta({ description: 'Comprobante firmado por el servidor de que la denuncia fue recibida.' });
export type SignedReceipt = z.infer<typeof SignedReceiptSchema>;

export const SubmitComplaintResponseSchema = z
  .object({
    folio: FolioSchema,
    receipt: SignedReceiptSchema,
  })
  .meta({ description: 'Respuesta al envío: folio y comprobante firmado.' });
export type SubmitComplaintResponse = z.infer<typeof SubmitComplaintResponseSchema>;
