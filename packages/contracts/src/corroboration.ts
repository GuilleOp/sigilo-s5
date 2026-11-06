// Corroboración ciega (ADR 0006) y una persona = una corroboración (ADR 0010): rutas y cuerpos del
// evaluador OPRF y del índice de coincidencias, dos servicios que operan partes distintas.
import { z } from 'zod';
import { CORROBORATION_OPRF_SUITE } from './corroboration-key.ts';
import { NodeIdSchema } from './network.ts';
import { Base64UrlSchema, DayDateSchema, KeyIdSchema, Sha256HexSchema } from './primitives.ts';

/** Prefijo de las rutas de la corroboración. */
export const CORROBORATION_API_PREFIX = '/api/v1/corroboracion';

/**
 * Rutas de la corroboración. Las de `evaluador` las sirve el evaluador OPRF (las llama el
 * navegador); las de `indice`, el índice de coincidencias (las llaman solo los nodos).
 */
export const CORROBORATION_ROUTES = {
  /** `GET`: llave pública vigente del evaluador (la misma que publica el directorio). */
  evaluatorKey: `${CORROBORATION_API_PREFIX}/evaluador/llave`,
  /** `GET`: reto de prueba de trabajo para una evaluación. */
  evaluatorChallenge: `${CORROBORATION_API_PREFIX}/evaluador/reto`,
  /** `POST`: evalúa un elemento cegado y devuelve el resultado con su prueba DLEQ. */
  evaluations: `${CORROBORATION_API_PREFIX}/evaluador/evaluaciones`,
  /** `GET ?from=AAAA-MM-DD`: conteos diarios firmados de evaluaciones de días ya cerrados. */
  evaluationCounts: `${CORROBORATION_API_PREFIX}/evaluador/conteos`,
  /** `POST`: un nodo registra la etiqueta de una denuncia y recibe el estado de su grupo. */
  indexRegistrations: `${CORROBORATION_API_PREFIX}/indice/registros`,
  /** `POST`: un nodo pide los avisos de cambio de los grupos donde tiene denuncias. */
  indexNotices: `${CORROBORATION_API_PREFIX}/indice/avisos`,
  /**
   * `POST`: el nodo confirma que la autoridad aceptó la denuncia; desde entonces cuenta como fuente
   * independiente para las demás y ve el conteo de su grupo.
   */
  indexConfirmations: `${CORROBORATION_API_PREFIX}/indice/confirmaciones`,
  /** `POST`: el nodo retira del índice una denuncia cerrada como spam, improcedente o duplicada. */
  indexWithdrawals: `${CORROBORATION_API_PREFIX}/indice/bajas`,
} as const;

/**
 * Días naturales tras el registro (según el reloj del índice) en que una denuncia sin confirmar ni
 * retirar pasa a contar como confirmada («aged»). Coincide con los 30 días que tiene la autoridad
 * para iniciar la investigación de una falta grave (LGRA, art. 64, fr. II): en ese lapso el nodo
 * debe confirmarla o darla de baja.
 */
export const CORROBORATION_CONFIRMATION_GRACE_DAYS = 30;

/** Bytes de un elemento ristretto255 y de una prueba DLEQ (dos escalares). */
export const OPRF_ELEMENT_BYTES = 32;
export const OPRF_PROOF_BYTES = 64;

/** Bytes del resumen difuso de similitud: 512 firmas MinHash de un bit. */
export const SIMILARITY_DIGEST_BYTES = 64;

/** Longitud en Base64URL sin relleno de `bytes` bytes. */
function base64UrlLength(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

const elementSchema = (description: string) =>
  Base64UrlSchema.length(base64UrlLength(OPRF_ELEMENT_BYTES)).meta({ description });

export const CorroborationEvaluationRequestSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    keyId: KeyIdSchema.meta({
      description: 'Llave del evaluador con la que el navegador espera la evaluación.',
    }),
    blinded: elementSchema(
      'Elemento cegado (ristretto255, 32 bytes): el evaluador no puede saber de qué identificador viene.',
    ),
  })
  .strict()
  .meta({
    description:
      'Petición de evaluación OPRF. No lleva identificador, etiqueta, folio ni nada de la denuncia.',
  });
export type CorroborationEvaluationRequest = z.infer<typeof CorroborationEvaluationRequestSchema>;

export const CorroborationEvaluationResponseSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    suite: z
      .literal(CORROBORATION_OPRF_SUITE)
      .meta({ description: 'Suite OPRF con la que se evaluó.' }),
    epoch: z.number().int().min(1).meta({ description: 'Época de la llave que evaluó.' }),
    keyId: KeyIdSchema,
    evaluated: elementSchema('Elemento evaluado con la llave privada del evaluador.'),
    proof: Base64UrlSchema.length(base64UrlLength(OPRF_PROOF_BYTES)).meta({
      description:
        'Prueba DLEQ (RFC 9497, sección 2.2) de que se usó la llave publicada; el navegador la verifica antes de usar el resultado.',
    }),
  })
  .strict()
  .meta({ description: 'Resultado de la evaluación con su prueba de llave única.' });
export type CorroborationEvaluationResponse = z.infer<typeof CorroborationEvaluationResponseSchema>;

export const EvaluationDailyCountSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    day: DayDateSchema.meta({ description: 'Día ya cerrado (UTC) al que corresponde el conteo.' }),
    epoch: z.number().int().min(1).meta({ description: 'Época de la llave del evaluador.' }),
    evaluations: z
      .number()
      .int()
      .min(0)
      .meta({ description: 'Evaluaciones que hizo el evaluador ese día.' }),
    signingKeyId: KeyIdSchema,
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 sobre "sigilo/corroboracion/evaluation-count/v1:" + JSON canónico sin la firma.',
    }),
  })
  .strict()
  .meta({
    description:
      'Conteo diario firmado de evaluaciones: comparado con el número de denuncias, delata una enumeración masiva.',
  });
export type EvaluationDailyCount = z.infer<typeof EvaluationDailyCountSchema>;

export const EvaluationCountsPageSchema = z
  .object({
    counts: z
      .array(EvaluationDailyCountSchema)
      .max(366)
      .meta({ description: 'Conteos firmados, uno por día cerrado.' }),
  })
  .strict()
  .meta({ description: 'Conteos diarios de días cerrados, del más antiguo al más reciente.' });
export type EvaluationCountsPage = z.infer<typeof EvaluationCountsPageSchema>;

/** Hora redondeada a 10 minutos (UTC): la única marca de tiempo que recibe el índice. */
export const TenMinuteDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:[0-5]0Z$/u, 'Hora inválida')
  .meta({
    description: 'Fecha y hora redondeada hacia abajo a 10 minutos, en UTC (AAAA-MM-DDTHH:M0Z).',
    examples: ['2026-11-11T17:20Z'],
  });

export const CorroborationTagSchema = Sha256HexSchema.meta({
  description:
    'Etiqueta de corroboración: HKDF de la salida VOPRF. Es igual para el mismo identificador y la misma época, y no revela cuál es.',
});

export const CorroborationEntrySchema = z.enum(['relay', 'direct']).meta({
  description:
    'Por dónde llegó la denuncia al nodo: relay (ventanilla única, por el enrutador) o direct (entrada propia del nodo).',
});
export type CorroborationEntry = z.infer<typeof CorroborationEntrySchema>;

export const IndexRegistrationSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    nodeId: NodeIdSchema,
    epoch: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Época de la llave del evaluador con la que se obtuvo la etiqueta.' }),
    tag: CorroborationTagSchema,
    folioDigest: Sha256HexSchema.meta({
      description:
        'Digesto opaco del folio (HMAC con un secreto del nodo): solo el nodo lo relaciona con su denuncia.',
    }),
    receivedAt: TenMinuteDateSchema,
    entry: CorroborationEntrySchema,
    similarity: Base64UrlSchema.length(base64UrlLength(SIMILARITY_DIGEST_BYTES)).nullable().meta({
      description:
        'Resumen difuso del relato (512 bits MinHash con llave derivada de la etiqueta) que calculó el navegador, o null si el relato es muy corto. No permite reconstruir el texto.',
    }),
    custody: z.boolean().optional().meta({
      description:
        'true si la denuncia está en custodia (ADR 0006): ve cuántas fuentes confirmadas hay sin estar aceptada. Queda en la bitácora del nodo.',
    }),
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del nodo (llave del directorio) sobre "sigilo/corroboracion/index-registration/v1:" + JSON canónico sin la firma.',
    }),
  })
  .strict()
  .meta({
    description:
      'Registro de una denuncia en el índice: etiqueta, nodo, folio opaco y señales de independencia. Nunca el identificador.',
  });
export type IndexRegistration = z.infer<typeof IndexRegistrationSchema>;

export const CorroborationFlagSchema = z.enum(['possible_same_origin', 'possible_campaign']).meta({
  description:
    'Marca del grupo de origen: possible_same_origin (parecen de la misma fuente) o possible_campaign (ráfaga de tres o más con textos parecidos). Nunca significa «falsa».',
});
export type CorroborationFlag = z.infer<typeof CorroborationFlagSchema>;

export const IndependenceSignalSchema = z
  .enum(['similar_text', 'burst', 'same_node', 'same_entry'])
  .meta({
    description:
      'Señal que unió esta denuncia con otra: similar_text (relatos muy parecidos), burst (misma ventana corta), same_node (mismo nodo), same_entry (misma entrada a la red).',
  });
export type IndependenceSignal = z.infer<typeof IndependenceSignalSchema>;

export const CorroborationConfirmationSchema = z.enum(['pending', 'confirmed', 'aged']).meta({
  description:
    'Confirmación de la denuncia ante el índice: pending (registrada, sin confirmar), confirmed (el nodo confirmó que la autoridad la aceptó) o aged (pasaron los días de gracia sin confirmación ni baja).',
});
export type CorroborationConfirmation = z.infer<typeof CorroborationConfirmationSchema>;

export const CorroborationStatusSchema = z
  .object({
    folioDigest: Sha256HexSchema,
    confirmation: CorroborationConfirmationSchema,
    isRevealed: z.boolean().meta({
      description:
        'Si el estado incluye el grupo. Solo con la denuncia confirmada, envejecida o en custodia; si no, el estado es el de una denuncia sola, para que registrar no sirva de oráculo.',
    }),
    groupId: z
      .string()
      .regex(/^[0-9a-f]{32}$/u, 'Grupo inválido')
      .meta({
        description:
          'Identificador aleatorio del grupo de la etiqueta (o uno propio de la denuncia mientras no se revela); no se deriva de ella ni dice qué nodos o folios lo forman.',
      }),
    complaints: z.number().int().min(1).meta({
      description:
        'Denuncias de su grupo de origen más las de las fuentes confirmadas; las demás no se cuentan ni se revelan.',
    }),
    independentSources: z.number().int().min(1).meta({
      description:
        'Esta fuente más las otras fuentes confirmadas (aceptadas o envejecidas); las denuncias que parecen de la misma fuente cuentan una vez.',
    }),
    confirmedOtherSources: z.number().int().min(0).meta({
      description:
        'Otras fuentes independientes confirmadas; 0 mientras no se revela. Es lo que libera una custodia.',
    }),
    sameOriginCount: z.number().int().min(1).meta({
      description: 'Denuncias que cuentan como la misma fuente que esta (ella incluida).',
    }),
    flags: z.array(CorroborationFlagSchema).meta({
      description: 'Marcas del grupo de origen de esta denuncia; vacío si parece independiente.',
    }),
    signals: z.array(IndependenceSignalSchema).meta({
      description: 'Señales que agruparon esta denuncia con otras, para explicar el conteo.',
    }),
  })
  .strict()
  .meta({
    description:
      'Estado de corroboración de una denuncia del nodo: suma prioridad explicable, nunca retrasa, descarta ni cambia su estado.',
  });
export type CorroborationStatus = z.infer<typeof CorroborationStatusSchema>;

export const IndexNoticesRequestSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    nodeId: NodeIdSchema,
    after: z
      .number()
      .int()
      .min(0)
      .meta({ description: 'Último aviso ya recibido (0 para empezar).' }),
    requestedAt: TenMinuteDateSchema.meta({
      description: 'Hora de la petición; el índice rechaza las que difieren más de 20 minutos.',
    }),
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del nodo sobre "sigilo/corroboracion/index-notices/v1:" + JSON canónico sin la firma.',
    }),
  })
  .strict()
  .meta({ description: 'Petición firmada de avisos del índice para un nodo.' });
export type IndexNoticesRequest = z.infer<typeof IndexNoticesRequestSchema>;

const requestedAtSchema = TenMinuteDateSchema.meta({
  description: 'Hora de la petición; el índice rechaza las que difieren más de 20 minutos.',
});

export const IndexConfirmationSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    nodeId: NodeIdSchema,
    folioDigest: Sha256HexSchema.meta({ description: 'Folio opaco ya registrado por el nodo.' }),
    requestedAt: requestedAtSchema,
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del nodo sobre "sigilo/corroboracion/index-confirmation/v1:" + JSON canónico sin la firma.',
    }),
  })
  .strict()
  .meta({
    description:
      'El nodo confirma que la autoridad aceptó la denuncia (estado aceptada del trámite). La confirmación queda en la bitácora del nodo.',
  });
export type IndexConfirmation = z.infer<typeof IndexConfirmationSchema>;

export const IndexWithdrawalReasonSchema = z.enum(['spam', 'inadmissible', 'duplicate']).meta({
  description:
    'Motivo de la baja: spam (envío sin hechos), inadmissible (cerrada como improcedente) o duplicate (acumulada a otra denuncia del mismo nodo).',
});
export type IndexWithdrawalReason = z.infer<typeof IndexWithdrawalReasonSchema>;

export const IndexWithdrawalSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    nodeId: NodeIdSchema,
    folioDigest: Sha256HexSchema.meta({ description: 'Folio opaco que se retira.' }),
    reason: IndexWithdrawalReasonSchema,
    requestedAt: requestedAtSchema,
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del nodo sobre "sigilo/corroboracion/index-withdrawal/v1:" + JSON canónico sin la firma.',
    }),
  })
  .strict()
  .meta({
    description:
      'Baja firmada: el índice borra el registro, recalcula el grupo y no acepta volver a registrar ese folio.',
  });
export type IndexWithdrawal = z.infer<typeof IndexWithdrawalSchema>;

export const IndexWithdrawalReceiptSchema = z
  .object({
    folioDigest: Sha256HexSchema,
    withdrawn: z.literal(true).meta({ description: 'Siempre true: la baja quedó aplicada.' }),
  })
  .strict()
  .meta({ description: 'Acuse de la baja.' });
export type IndexWithdrawalReceipt = z.infer<typeof IndexWithdrawalReceiptSchema>;

/** Avisos por página. */
export const INDEX_NOTICES_MAX_PAGE = 500;

export const IndexNoticeSchema = z
  .object({
    seq: z.number().int().min(1).meta({ description: 'Número del aviso para este nodo.' }),
    status: CorroborationStatusSchema,
  })
  .strict()
  .meta({ description: 'Aviso: cambió el estado de corroboración de una denuncia del nodo.' });
export type IndexNotice = z.infer<typeof IndexNoticeSchema>;

export const IndexNoticesPageSchema = z
  .object({
    notices: z
      .array(IndexNoticeSchema)
      .max(INDEX_NOTICES_MAX_PAGE)
      .meta({ description: 'Avisos en orden de número.' }),
  })
  .strict()
  .meta({ description: 'Avisos pendientes del nodo, del más antiguo al más reciente.' });
export type IndexNoticesPage = z.infer<typeof IndexNoticesPageSchema>;
