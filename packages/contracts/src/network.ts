// Red federada «un S5, muchas llaves» (ADR 0005): directorio de autoridades firmado por la operación
// y cofirmado por testigos m de n, enrutador ciego, registro de nodos y bitácora nacional.
import { z } from 'zod';
import { ComplaintStatusSchema, OffenseCodeSchema, StateCodeSchema } from './complaint.ts';
import { DirectoryCorroborationSchema } from './corroboration-key.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { SignedLedgerHeadSchema } from './ledger.ts';
import {
  Base64UrlSchema,
  DayDateSchema,
  HourDateSchema,
  KeyIdSchema,
  MonthPeriodSchema,
  Sha256HexSchema,
} from './primitives.ts';

/** Prefijo de las rutas de la red (enrutador y buzón de red de cada nodo). */
export const NETWORK_API_PREFIX = '/api/v1/red';

/** Rutas de la red. Las sirve el enrutador salvo `nodeInbox`, que la sirve cada nodo. */
export const NETWORK_ROUTES = {
  /** `GET`: directorio de autoridades vigente, firmado y cofirmado. */
  directory: `${NETWORK_API_PREFIX}/directory`,
  /** `POST`: sobre opaco con solo la autoridad destino; el enrutador lo entrega a su nodo. */
  relay: `${NETWORK_API_PREFIX}/relay`,
  /** `POST`: el nodo se registra con un mensaje firmado por su llave del directorio. */
  nodeRegistration: (nodeId: string) => `${NETWORK_API_PREFIX}/nodes/${nodeId}/registration`,
  /** `POST`: el nodo publica la cabeza firmada de su bitácora. */
  nodeHeads: (nodeId: string) => `${NETWORK_API_PREFIX}/nodes/${nodeId}/heads`,
  /** `GET`: última cabeza nacional con al menos m cofirmas de testigos. */
  nationalHead: `${NETWORK_API_PREFIX}/national/head`,
  /** `GET`: cabeza nacional más reciente, firmada por la operación y en espera de cofirmas. */
  nationalPending: `${NETWORK_API_PREFIX}/national/pending`,
  /** `POST`: un testigo entrega su cofirma de una cabeza nacional. */
  nationalCosignatures: `${NETWORK_API_PREFIX}/national/cosignatures`,
  /** `GET ?from=&limit=`: entradas de la bitácora nacional. */
  nationalEntries: `${NETWORK_API_PREFIX}/national/entries`,
  /** `GET ?nodeId=&seq=&hash=`: prueba de que una cabeza de nodo está en la bitácora nacional. */
  nationalInclusion: `${NETWORK_API_PREFIX}/national/inclusion`,
  /** `GET`: último corte nacional de datos abiertos (suma de los CSV públicos de los nodos). */
  nationalOpenData: `${NETWORK_API_PREFIX}/national/open-data`,
  /** `GET`: el mismo corte en CSV, con las columnas del CSV de cada nodo. */
  nationalOpenDataCsv: `${NETWORK_API_PREFIX}/national/open-data.csv`,
  /** `POST` en el nodo: recibe del enrutador un sobre de red y responde con un sobre de vuelta. */
  nodeInbox: `${NETWORK_API_PREFIX}/inbox`,
} as const;

/**
 * Tamaños permitidos del texto en claro (ya rellenado) de los sobres de red, en bytes. El
 * enrutador rechaza cualquier otro tamaño: así solo ve el tramo, no la longitud real.
 */
export const RELAY_PLAINTEXT_BUCKETS: readonly number[] = [4096, 65536, 1048576, 16777216];

/** Página máxima de la bitácora nacional y tramo máximo de una prueba de inclusión. */
export const NATIONAL_LEDGER_MAX_PAGE = 500;
export const NATIONAL_INCLUSION_MAX_CHAIN = 5000;

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';

export const NodeIdSchema = z
  .string()
  .regex(new RegExp(`^node\\.${SLUG}$`, 'u'), 'Identificador de nodo inválido')
  .meta({ description: 'Identificador estable del nodo.', examples: ['node.queretaro'] });

export const AuthorityIdSchema = z
  .string()
  .regex(new RegExp(`^authority\\.${SLUG}$`, 'u'), 'Identificador de autoridad inválido')
  .meta({
    description: 'Identificador estable de la autoridad.',
    examples: ['authority.oic-iffe'],
  });

export const ObserverIdSchema = z
  .string()
  .regex(new RegExp(`^observer\\.${SLUG}$`, 'u'), 'Identificador de observador inválido')
  .meta({
    description: 'Identificador estable del observador.',
    examples: ['observer.cpc-queretaro'],
  });

export const WitnessIdSchema = z
  .string()
  .regex(new RegExp(`^(?:node|observer)\\.${SLUG}$`, 'u'), 'Identificador de testigo inválido')
  .meta({
    description: 'Testigo: un observador o un nodo del directorio.',
    examples: ['observer.university-ejemplo'],
  });

/** Clave INEGI de dos dígitos o clave `state.*` de una entidad sintética sin clave INEGI. */
export const NetworkStateKeySchema = z
  .string()
  .regex(new RegExp(`^(?:\\d{2}|state\\.${SLUG})$`, 'u'), 'Entidad inválida')
  .meta({
    description:
      'Entidad federativa: clave INEGI de dos dígitos o clave `state.*` de una entidad sintética sin clave INEGI.',
    examples: ['22'],
  });

const GovernmentLevelSchema = z
  .enum(['federal', 'estatal', 'municipal'])
  .meta({ description: 'Orden de gobierno: federal, estatal o municipal.' });

export const DirectoryNodeSchema = z
  .object({
    id: NodeIdSchema,
    name: z.string().min(1).max(200).meta({ description: 'Nombre del nodo.' }),
    baseUrl: z
      .string()
      .regex(/^https?:\/\/[^\s/?#]+$/u, 'URL base inválida')
      .meta({
        description: 'Origen público del nodo (esquema, host y puerto, sin ruta).',
        examples: ['https://denuncias.queretaro.example'],
      }),
    isCommonNode: z
      .boolean()
      .meta({ description: 'Si aloja a autoridades de entidades sin nodo propio.' }),
    boxKeyId: KeyIdSchema,
    boxPublicKey: Base64UrlSchema.meta({
      description: 'Llave pública X25519 del nodo: destinataria de los sobres de red.',
    }),
    signingKeyId: KeyIdSchema,
    signingPublicKey: Base64UrlSchema.meta({
      description:
        'Llave pública Ed25519 del nodo: firma la cabeza de su bitácora, su registro y, si es testigo, sus cofirmas.',
    }),
  })
  .strict()
  .meta({ description: 'Nodo de la red: estatal (SESEA) o común.' });
export type DirectoryNode = z.infer<typeof DirectoryNodeSchema>;

export const AuthorityRoleSchema = z.enum(['investigating', 'supervisory', 'prosecution']).meta({
  description:
    'Papel: investigating (investiga faltas), supervisory (supervisa y recibe escalamientos) o prosecution (fiscalía de hechos de corrupción).',
});
export type AuthorityRole = z.infer<typeof AuthorityRoleSchema>;

export const AuthorityCompetenceSchema = z
  .object({
    governmentLevels: z
      .array(GovernmentLevelSchema)
      .min(1)
      .meta({ description: 'Órdenes de gobierno de los entes que atiende.' }),
    stateCodes: z
      .array(NetworkStateKeySchema)
      .meta({ description: 'Entidades donde actúa; vacío significa todo el país.' }),
    entityIds: z.array(z.string().min(1).max(64)).meta({
      description:
        'Entes del catálogo que atiende de forma específica; vacío significa todos los del orden y la entidad.',
    }),
    laws: z
      .array(z.enum(['LGRA', 'CPF']))
      .min(1)
      .meta({
        description:
          'Leyes de las conductas que conoce: LGRA (faltas administrativas) o CPF (delitos).',
      }),
  })
  .strict()
  .meta({ description: 'Competencia declarada: con ella se propone la autoridad competente.' });
export type AuthorityCompetence = z.infer<typeof AuthorityCompetenceSchema>;

export const DirectoryAuthoritySchema = z
  .object({
    id: AuthorityIdSchema,
    name: z.string().min(1).max(300).meta({ description: 'Nombre de la autoridad.' }),
    nodeId: NodeIdSchema,
    governmentLevel: GovernmentLevelSchema,
    stateCode: NetworkStateKeySchema.nullable().meta({
      description: 'Entidad de la autoridad; null si es federal.',
    }),
    role: AuthorityRoleSchema,
    competence: AuthorityCompetenceSchema,
    keyId: KeyIdSchema,
    boxPublicKey: Base64UrlSchema.meta({
      description: 'Llave pública X25519 hacia la que se cifran hechos, identidad y mensajes.',
    }),
    signingPublicKey: Base64UrlSchema.meta({
      description: 'Llave pública Ed25519 con la que la autoridad firma sus mensajes.',
    }),
    supervisorId: AuthorityIdSchema.nullable().meta({
      description: 'Autoridad supervisora que recibe el sobre de escalamiento (ADR 0007), o null.',
    }),
    validFrom: DayDateSchema.meta({ description: 'Primer día de vigencia de las llaves.' }),
    validUntil: DayDateSchema.nullable().meta({
      description: 'Último día de vigencia de las llaves, o null si no tiene fecha de término.',
    }),
  })
  .strict()
  .meta({ description: 'Autoridad del directorio con su competencia y sus llaves públicas.' });
export type DirectoryAuthority = z.infer<typeof DirectoryAuthoritySchema>;

export const ObserverKindSchema = z
  .enum(['cpc', 'audit-institution', 'civil-society', 'academia'])
  .meta({
    description:
      'Tipo de observador: CPC, entidad de fiscalización superior, organización de la sociedad civil o academia.',
  });

export const DirectoryObserverSchema = z
  .object({
    id: ObserverIdSchema,
    name: z.string().min(1).max(300).meta({ description: 'Nombre del observador.' }),
    kind: ObserverKindSchema,
    signingKeyId: KeyIdSchema,
    signingPublicKey: Base64UrlSchema.meta({
      description: 'Llave pública Ed25519 con la que cofirma el directorio y la bitácora nacional.',
    }),
  })
  .strict()
  .meta({ description: 'Observador: ve solo la bitácora pública y cofirma como testigo.' });
export type DirectoryObserver = z.infer<typeof DirectoryObserverSchema>;

export const WitnessPolicySchema = z
  .object({
    threshold: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Número mínimo de cofirmas válidas de testigos distintos (m).' }),
    witnessIds: z
      .array(WitnessIdSchema)
      .min(1)
      .meta({ description: 'Testigos (n): observadores o nodos del directorio.' }),
  })
  .strict()
  .meta({ description: 'Política de testigos m de n.' });
export type WitnessPolicy = z.infer<typeof WitnessPolicySchema>;

export const AuthorityDirectorySchema = z
  .object({
    format: z.literal(1).meta({ description: 'Versión del formato del directorio.' }),
    serial: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Número de versión del directorio; crece en uno con cada cambio.' }),
    issuedOn: DayDateSchema.meta({ description: 'Día de emisión de esta versión.' }),
    validUntil: DayDateSchema.optional().meta({
      description:
        'Último día en que esta versión se acepta (H10). La operación reemite el directorio antes; una copia vieja deja de verificar.',
    }),
    previousDigest: Sha256HexSchema.meta({
      description:
        'Digesto de la versión anterior (64 ceros en la primera): las versiones forman una cadena.',
    }),
    operator: z
      .object({
        name: z.string().min(1).max(300).meta({ description: 'Quién opera la ventanilla única.' }),
        signingKeyId: KeyIdSchema,
        signingPublicKey: Base64UrlSchema.meta({
          description: 'Llave Ed25519 de la operación: firma el directorio y la cabeza nacional.',
        }),
      })
      .strict()
      .meta({ description: 'Operación de la ventanilla única y del enrutador.' }),
    nodes: z.array(DirectoryNodeSchema).min(1).meta({ description: 'Nodos de la red.' }),
    authorities: z
      .array(DirectoryAuthoritySchema)
      .min(1)
      .meta({ description: 'Autoridades registradas en la ventanilla única.' }),
    observers: z.array(DirectoryObserverSchema).meta({ description: 'Observadores.' }),
    witnessPolicy: WitnessPolicySchema,
    corroboration: DirectoryCorroborationSchema.optional().meta({
      description:
        'Servicios de la corroboración ciega (ADR 0006) con la llave pública del evaluador OPRF; si falta, la red no ofrece corroboración.',
    }),
  })
  .strict()
  .meta({
    description:
      'Directorio de autoridades: cada versión la firma la operación y la cofirman m de n testigos.',
  });
export type AuthorityDirectory = z.infer<typeof AuthorityDirectorySchema>;

export const WitnessSignatureSchema = z
  .object({
    witnessId: WitnessIdSchema,
    keyId: KeyIdSchema,
    signature: Base64UrlSchema.meta({ description: 'Firma Ed25519 del testigo.' }),
  })
  .strict()
  .meta({ description: 'Cofirma de un testigo.' });
export type WitnessSignature = z.infer<typeof WitnessSignatureSchema>;

export const SignedAuthorityDirectorySchema = z
  .object({
    directory: AuthorityDirectorySchema,
    digest: Sha256HexSchema.meta({
      description: 'SHA-256 de la forma canónica de `directory`.',
    }),
    operatorSignature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 de la operación sobre "sigilo/red/directory/operator/v1:" + digest.',
    }),
    witnessSignatures: z.array(WitnessSignatureSchema).meta({
      description: 'Cofirmas sobre "sigilo/red/directory/witness/v1:" + digest.',
    }),
  })
  .strict()
  .meta({ description: 'Directorio publicado con la firma de la operación y las cofirmas.' });
export type SignedAuthorityDirectory = z.infer<typeof SignedAuthorityDirectorySchema>;

/**
 * Raíz de confianza que el navegador trae fijada: la llave de la operación y las de los testigos.
 * Nunca las de cada autoridad: esas salen del directorio verificado.
 */
export const NetworkTrustAnchorSchema = z
  .object({
    format: z.literal(1).meta({ description: 'Versión del formato.' }),
    operatorKeyId: KeyIdSchema.meta({ description: 'Identificador de la llave de la operación.' }),
    operatorSigningPublicKey: Base64UrlSchema.meta({
      description: 'Llave pública Ed25519 de la operación.',
    }),
    threshold: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Cofirmas de testigos distintos que se exigen (m).' }),
    witnesses: z
      .array(
        z
          .object({
            id: WitnessIdSchema,
            keyId: KeyIdSchema,
            signingPublicKey: Base64UrlSchema.meta({
              description: 'Llave pública Ed25519 del testigo.',
            }),
          })
          .strict()
          .meta({ description: 'Testigo fijado.' }),
      )
      .min(1)
      .meta({ description: 'Testigos fijados (n).' }),
    minDirectorySerial: z.number().int().min(1).optional().meta({
      description:
        'Serial mínimo del directorio que se acepta (H10): fijarlo al publicar una versión que revoca llaves impide volver a una anterior.',
    }),
    maxDirectoryAgeDays: z.number().int().min(1).optional().meta({
      description:
        'Días máximos desde `issuedOn` para aceptar el directorio (H10); exige que quien verifica conozca el día.',
    }),
  })
  .strict()
  .meta({
    description:
      'Raíz de confianza que el navegador trae fijada: la llave de la operación y las de los testigos, nunca las de cada autoridad.',
  });
export type NetworkTrustAnchor = z.infer<typeof NetworkTrustAnchorSchema>;

export const RelayRequestSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    to: AuthorityIdSchema.meta({
      description: 'Autoridad destino: lo único que lee el enrutador.',
    }),
    sealed: HpkeEnvelopeSchema.meta({
      description:
        'Sobre HPKE hacia la llave del nodo de esa autoridad, con texto en claro rellenado a un tramo fijo.',
    }),
  })
  .strict()
  .meta({ description: 'Sobre de red: el enrutador solo ve el destino y el tramo de tamaño.' });
export type RelayRequest = z.infer<typeof RelayRequestSchema>;

export const RelayResponseSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    sealed: HpkeEnvelopeSchema.meta({
      description:
        'Respuesta del nodo cifrada hacia la llave efímera del navegador; si no se pudo entregar, relleno indistinguible del mismo tamaño.',
    }),
  })
  .strict()
  .meta({
    description:
      'Respuesta del enrutador: igual en estatus, cabeceras y tamaño sin importar el destino ni el resultado.',
  });
export type RelayResponse = z.infer<typeof RelayResponseSchema>;

/** Operaciones del nodo que se pueden pedir a través del enrutador. */
export const ROUTABLE_OPERATIONS = [
  'getPowChallenge',
  'uploadEvidence',
  'submitComplaint',
  'getTracking',
  'sendReporterMessage',
  'fileAppeal',
] as const;

export const RoutedBodySchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }).strict(),
    z.object({ kind: z.literal('json'), value: z.unknown() }).strict(),
    z
      .object({
        kind: z.literal('binary'),
        mediaType: z.string().min(1).max(100),
        data: z.string().regex(/^[A-Za-z0-9_-]*$/u),
      })
      .strict(),
  ])
  .meta({
    description:
      'Cuerpo: none (sin cuerpo), json (valor JSON) o binary (tipo de medio y bytes en Base64URL).',
  });
export type RoutedBody = z.infer<typeof RoutedBodySchema>;

/**
 * Contenido de un sobre de red, que solo abre el nodo: la operación del Estándar S5 que se pide,
 * con su cuerpo, su prueba de trabajo y la llave efímera para cifrar la respuesta.
 */
export const RoutedRequestSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    to: AuthorityIdSchema.meta({
      description: 'Autoridad destino; debe coincidir con la del encabezado externo.',
    }),
    operationId: z
      .enum(ROUTABLE_OPERATIONS)
      .meta({ description: 'Operación del Estándar S5 que se pide al nodo.' }),
    query: z
      .record(z.string().max(64), z.string().max(256))
      .meta({ description: 'Parámetros de consulta de la operación.' }),
    proofOfWork: z
      .string()
      .max(512)
      .nullable()
      .meta({ description: 'Valor de la cabecera de prueba de trabajo, o null.' }),
    body: RoutedBodySchema,
    replyPublicKey: Base64UrlSchema.meta({
      description: 'Llave pública X25519 efímera hacia la que el nodo cifra la respuesta.',
    }),
  })
  .strict()
  .meta({
    description:
      'Contenido de un sobre de red, que solo abre el nodo: la operación pedida, su cuerpo, su prueba de trabajo y la llave efímera de respuesta.',
  });
export type RoutedRequest = z.infer<typeof RoutedRequestSchema>;

/** Respuesta del nodo dentro del sobre de vuelta. */
export const RoutedReplySchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    status: z
      .number()
      .int()
      .min(100)
      .max(599)
      .meta({ description: 'Estatus HTTP que dio el nodo a la operación.' }),
    body: RoutedBodySchema,
  })
  .strict()
  .meta({ description: 'Respuesta del nodo dentro del sobre de vuelta.' });
export type RoutedReply = z.infer<typeof RoutedReplySchema>;

export const NodeRegistrationSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    nodeId: NodeIdSchema,
    sequence: z
      .number()
      .int()
      .min(1)
      .max(Number.MAX_SAFE_INTEGER)
      .meta({ description: 'Número creciente: un registro anterior no puede reenviarse.' }),
    standardVersion: z
      .string()
      .regex(/^\d+\.\d+\.\d+$/u)
      .meta({ description: 'Versión del Estándar S5 que implementa el nodo.' }),
    acceptsRelay: z
      .boolean()
      .meta({ description: 'Si el nodo ya recibe sobres de red en su buzón de red.' }),
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del nodo sobre "sigilo/red/node-registration/v1:" + forma canónica del registro sin este campo.',
    }),
  })
  .strict()
  .meta({
    description: 'Registro de un nodo ante el enrutador, firmado con su llave del directorio.',
  });
export type NodeRegistration = z.infer<typeof NodeRegistrationSchema>;

export const NodeRegistrationReceiptSchema = z
  .object({
    nodeId: NodeIdSchema,
    sequence: z.number().int().min(1).meta({ description: 'Secuencia aceptada.' }),
    acceptsRelay: z.boolean().meta({ description: 'Si el enrutador le entregará sobres.' }),
    registeredOn: DayDateSchema.meta({ description: 'Día del registro (UTC).' }),
  })
  .strict()
  .meta({ description: 'Acuse del registro.' });
export type NodeRegistrationReceipt = z.infer<typeof NodeRegistrationReceiptSchema>;

export const NodeHeadAcceptanceSchema = z
  .object({
    nodeId: NodeIdSchema,
    status: z
      .enum(['recorded', 'unchanged'])
      .meta({ description: 'recorded: se agregó a la bitácora nacional; unchanged: ya estaba.' }),
    entrySeq: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'Entrada de la bitácora nacional que contiene la cabeza.' }),
  })
  .strict()
  .meta({ description: 'Resultado de publicar la cabeza de un nodo.' });
export type NodeHeadAcceptance = z.infer<typeof NodeHeadAcceptanceSchema>;

export const NationalLedgerEntrySchema = z
  .discriminatedUnion('type', [
    z
      .object({
        v: z.literal(1),
        seq: z.number().int().nonnegative(),
        type: z.literal('node.head'),
        at: DayDateSchema,
        nodeId: NodeIdSchema,
        nodeHead: SignedLedgerHeadSchema,
        prevHash: Sha256HexSchema,
        hash: Sha256HexSchema,
      })
      .strict()
      .meta({ description: 'Cabeza firmada de la bitácora de un nodo.' }),
    z
      .object({
        v: z.literal(1),
        seq: z.number().int().nonnegative(),
        type: z.literal('directory.version'),
        at: DayDateSchema,
        directorySerial: z.number().int().min(1),
        directoryDigest: Sha256HexSchema,
        prevHash: Sha256HexSchema,
        hash: Sha256HexSchema,
      })
      .strict()
      .meta({ description: 'Versión publicada del directorio.' }),
  ])
  .meta({
    description:
      'Entrada de la bitácora nacional: `hash` es el SHA-256 de la forma canónica de la entrada sin ese campo y `prevHash` el de la anterior (64 ceros en la primera).',
  });
export type NationalLedgerEntry = z.infer<typeof NationalLedgerEntrySchema>;

export const NationalHeadSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    seq: z.number().int().nonnegative().meta({ description: 'Última entrada cubierta.' }),
    hash: Sha256HexSchema.meta({ description: 'Hash de esa entrada.' }),
    at: DayDateSchema.meta({ description: 'Día en que se emitió la cabeza.' }),
    directorySerial: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Versión del directorio vigente al emitirla.' }),
    operatorKeyId: KeyIdSchema,
  })
  .strict()
  .meta({ description: 'Cabeza de la bitácora nacional.' });
export type NationalHead = z.infer<typeof NationalHeadSchema>;

export const CosignedNationalHeadSchema = z
  .object({
    head: NationalHeadSchema,
    operatorSignature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 de la operación sobre "sigilo/red/national-head/operator/v1:" + forma canónica de head.',
    }),
    cosignatures: z.array(WitnessSignatureSchema).meta({
      description:
        'Cofirmas sobre "sigilo/red/national-head/witness/v1:" + forma canónica de head. Vale con m de n.',
    }),
  })
  .strict()
  .meta({ description: 'Cabeza nacional con la firma de la operación y las cofirmas.' });
export type CosignedNationalHead = z.infer<typeof CosignedNationalHeadSchema>;

export const NationalCosignatureRequestSchema = z
  .object({
    seq: z.number().int().nonnegative().meta({ description: 'Secuencia de la cabeza cofirmada.' }),
    hash: Sha256HexSchema.meta({ description: 'Hash de la cabeza cofirmada.' }),
    cosignature: WitnessSignatureSchema,
  })
  .strict()
  .meta({ description: 'Cofirma de un testigo sobre una cabeza nacional pendiente.' });
export type NationalCosignatureRequest = z.infer<typeof NationalCosignatureRequestSchema>;

export const NationalLedgerPageSchema = z
  .object({
    entries: z.array(NationalLedgerEntrySchema).meta({ description: 'Entradas en orden.' }),
    head: CosignedNationalHeadSchema.nullable().meta({
      description: 'Última cabeza con m cofirmas, o null si todavía no hay.',
    }),
  })
  .strict()
  .meta({ description: 'Página de la bitácora nacional.' });
export type NationalLedgerPage = z.infer<typeof NationalLedgerPageSchema>;

export const NationalInclusionProofSchema = z
  .object({
    entry: NationalLedgerEntrySchema,
    chain: z.array(NationalLedgerEntrySchema).meta({
      description: 'Tramo desde la entrada (incluida) hasta la de la cabeza, sin huecos.',
    }),
    head: CosignedNationalHeadSchema,
  })
  .strict()
  .meta({
    description:
      'Prueba de que la cabeza de un nodo está en la bitácora nacional: la entrada, el tramo hasta la cabeza y la cabeza cofirmada.',
  });
export type NationalInclusionProof = z.infer<typeof NationalInclusionProofSchema>;

export const NationalOpenDataCellSchema = z
  .object({
    stateCode: StateCodeSchema,
    offenseCode: OffenseCodeSchema,
    month: MonthPeriodSchema.meta({ description: 'Mes de recepción (AAAA-MM), ya cerrado.' }),
    status: ComplaintStatusSchema,
    count: z.number().int().min(1).meta({
      description:
        'Suma de los conteos publicados por los nodos (ya redondeados): múltiplo del redondeo y al menos la celda mínima.',
    }),
  })
  .strict()
  .meta({ description: 'Celda del corte nacional: entidad, conducta, mes y estatus.' });
export type NationalOpenDataCell = z.infer<typeof NationalOpenDataCellSchema>;

/** Por qué el agregador descartó el CSV de un nodo en un corte. */
export const NATIONAL_OPEN_DATA_REJECTIONS = [
  'too-large',
  'header',
  'row',
  'open-month',
  'rounding',
  'min-cell',
  'duplicate',
  'suppressed-row',
] as const;

export const NationalOpenDataNodeSchema = z
  .object({
    nodeId: NodeIdSchema,
    name: z.string().min(1).max(200).meta({ description: 'Nombre del nodo en el directorio.' }),
    status: z.enum(['included', 'unreachable', 'rejected']).meta({
      description:
        'included: su CSV se sumó; unreachable: no respondió (sin datos de ese nodo en este corte); rejected: su CSV no cumplió las reglas y no se sumó.',
    }),
    rejection: z.enum(NATIONAL_OPEN_DATA_REJECTIONS).nullable().meta({
      description:
        'Regla que no cumplió el CSV: too-large, header, row, open-month (mes no cerrado), rounding, min-cell, duplicate o suppressed-row; null si no se rechazó.',
    }),
    cells: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'Filas publicadas que aportó el nodo (0 si no se sumó).' }),
    total: z.number().int().nonnegative().meta({
      description: 'Denuncias que aportó el nodo: sus filas más su fila de suprimidas.',
    }),
    ledgerHead: SignedLedgerHeadSchema.nullable().meta({
      description:
        'Cabeza firmada de la bitácora del nodo vigente en la bitácora nacional al hacer el corte, como referencia de integridad; null si aún no hay. No prueba los conteos.',
    }),
    nationalEntrySeq: z.number().int().nonnegative().nullable().meta({
      description: 'Entrada de la bitácora nacional que contiene esa cabeza, o null.',
    }),
  })
  .strict()
  .meta({ description: 'Participación de un nodo en el corte nacional.' });
export type NationalOpenDataNode = z.infer<typeof NationalOpenDataNodeSchema>;

export const NationalOpenDataSchema = z
  .object({
    v: z.literal(1).meta({ description: 'Versión del formato.' }),
    cutAt: HourDateSchema.meta({ description: 'Hora del corte (UTC).' }),
    closedBefore: MonthPeriodSchema.meta({
      description:
        'Mes en curso al hacer el corte: solo se aceptan meses anteriores (cerrados y congelados en cada nodo).',
    }),
    directorySerial: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Versión del directorio con la que se eligieron los nodos.' }),
    minCell: z
      .number()
      .int()
      .min(1)
      .meta({ description: 'Celda mínima, aplicada en cada nodo y otra vez después de sumar.' }),
    rounding: z.number().int().min(1).meta({ description: 'Múltiplo de los conteos publicados.' }),
    nodes: z.array(NationalOpenDataNodeSchema).meta({
      description: 'Todos los nodos del directorio, sumados o no, en el orden del directorio.',
    }),
    cells: z.array(NationalOpenDataCellSchema).meta({
      description: 'Celdas nacionales ordenadas por mes, entidad, conducta y estatus.',
    }),
    suppressed: z.number().int().nonnegative().meta({
      description:
        'Suprimidas: la suma de la fila de suprimidas de cada nodo más las celdas que quedaron bajo la celda mínima después de sumar.',
    }),
  })
  .strict()
  .meta({
    description:
      'Corte nacional de datos abiertos: suma por entidad, conducta, mes y estatus de los CSV públicos de los nodos. Solo números: ninguna denuncia, folio ni persona. No está firmado; cualquiera puede rehacerlo con los CSV de cada nodo.',
  });
export type NationalOpenData = z.infer<typeof NationalOpenDataSchema>;
