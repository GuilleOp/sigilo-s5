// Grupo «Red» del Estándar S5: operaciones del enrutador ciego y del buzón de red de cada nodo,
// sus esquemas con nombre y ejemplos sintéticos. Va aparte de las operaciones del nodo para que la
// conformidad del servidor de referencia siga comparando solo sus propias rutas.
import type { z } from 'zod';
import { HPKE_SUITE_V1 } from '../envelope.ts';
import type { SignedLedgerHead } from '../ledger.ts';
import {
  AuthorityCompetenceSchema,
  AuthorityDirectorySchema,
  CosignedNationalHeadSchema,
  DirectoryAuthoritySchema,
  DirectoryNodeSchema,
  DirectoryObserverSchema,
  NETWORK_ROUTES,
  NationalCosignatureRequestSchema,
  NationalHeadSchema,
  NationalInclusionProofSchema,
  NationalLedgerEntrySchema,
  NationalLedgerPageSchema,
  NationalOpenDataCellSchema,
  NationalOpenDataNodeSchema,
  NationalOpenDataSchema,
  NetworkTrustAnchorSchema,
  NodeHeadAcceptanceSchema,
  NodeRegistrationReceiptSchema,
  NodeRegistrationSchema,
  RelayDeferralSchema,
  RelayQueueReceiptSchema,
  RelayRequestSchema,
  RelayResponseSchema,
  RoutedReplySchema,
  RoutedRequestSchema,
  SignedAuthorityDirectorySchema,
  WitnessPolicySchema,
  WitnessSignatureSchema,
} from '../network.ts';
import type {
  AuthorityDirectory,
  CosignedNationalHead,
  NationalCosignatureRequest,
  NationalInclusionProof,
  NationalLedgerEntry,
  NationalLedgerPage,
  NationalOpenData,
  NetworkTrustAnchor,
  NodeHeadAcceptance,
  NodeRegistration,
  NodeRegistrationReceipt,
  RelayQueueReceipt,
  RelayRequest,
  RelayResponse,
  RoutedReply,
  RoutedRequest,
  SignedAuthorityDirectory,
} from '../network.ts';
import type { ApiErrorCode } from '../errors.ts';
import type { StandardComponentName, StandardParameter } from './operations.ts';

/** Esquemas con nombre propio del grupo «Red», en el orden del diccionario. */
export const NETWORK_COMPONENTS = {
  SignedAuthorityDirectory: SignedAuthorityDirectorySchema,
  AuthorityDirectory: AuthorityDirectorySchema,
  DirectoryNode: DirectoryNodeSchema,
  DirectoryAuthority: DirectoryAuthoritySchema,
  AuthorityCompetence: AuthorityCompetenceSchema,
  DirectoryObserver: DirectoryObserverSchema,
  WitnessPolicy: WitnessPolicySchema,
  WitnessSignature: WitnessSignatureSchema,
  NetworkTrustAnchor: NetworkTrustAnchorSchema,
  RelayRequest: RelayRequestSchema,
  RelayDeferral: RelayDeferralSchema,
  RelayResponse: RelayResponseSchema,
  RelayQueueReceipt: RelayQueueReceiptSchema,
  RoutedRequest: RoutedRequestSchema,
  RoutedReply: RoutedReplySchema,
  NodeRegistration: NodeRegistrationSchema,
  NodeRegistrationReceipt: NodeRegistrationReceiptSchema,
  NodeHeadAcceptance: NodeHeadAcceptanceSchema,
  NationalLedgerEntry: NationalLedgerEntrySchema,
  NationalHead: NationalHeadSchema,
  CosignedNationalHead: CosignedNationalHeadSchema,
  NationalCosignatureRequest: NationalCosignatureRequestSchema,
  NationalLedgerPage: NationalLedgerPageSchema,
  NationalInclusionProof: NationalInclusionProofSchema,
  NationalOpenData: NationalOpenDataSchema,
  NationalOpenDataNode: NationalOpenDataNodeSchema,
  NationalOpenDataCell: NationalOpenDataCellSchema,
} as const satisfies Record<string, z.ZodType>;

export type NetworkComponentName = keyof typeof NETWORK_COMPONENTS;

/** Sección del estándar del grupo. */
export const NETWORK_TAG = {
  name: 'Red',
  description:
    'Red federada «un S5, muchas llaves»: directorio de autoridades firmado y cofirmado por testigos, enrutador ciego que solo ve el nodo destino, registro de nodos y bitácora nacional cofirmada m de n. Las sirve el enrutador, salvo el buzón de red, que lo sirve cada nodo.',
} as const;

const KEY_ID = '5d1c2a9e8b7f3c40';
const KEY_ID_2 = '9a0be41c77d25f13';
const KEY_ID_3 = 'c3f8e2a1b0d94756';
const PUBLIC_KEY = 'Qm9vT0NfRmljdGljaWFfZGVfZWplbXBsb19wYXJhX2Rv';
const PUBLIC_KEY_2 = 'TGxhdmVfZmljdGljaWFfZGVfZWplbXBsb19kb3NfX19f';
const SIGNATURE =
  '7XdDyy1y5I9NAnkJ3hfkF7WFG8Z-o-EFmjpe-32pN3oxmSg9vQ-yk29HmYt-zMLCE7ZjhW8EgUD3kdP-FtonOg';
const DIGEST = '3b7e0f1c9a5d2e8b4f6a1c0d7e9b2a4c6f8e0d1b3a5c7e9f0a2b4c6d8e0f1a2b';
const HASH = 'a41f0c2e9b8d7a6c5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d';
const DAY = '2026-11-09';
const ENC = 'mL6vYr2bW1xVxH3tLq8m0J9cQk4nFj7sT2pZ5aR1uE0';
const CT =
  'StRzfWnAHU44irFcJi8Ovk2WchAogkFPTBaHqnM5Nr9BWGZk_sDbsz069mq6-8fAXMCKRxSTTNpoqQO9uuK4OPw';

const directory: AuthorityDirectory = {
  format: 1,
  serial: 1,
  issuedOn: DAY,
  previousDigest: '0'.repeat(64),
  operator: {
    name: 'Operación ficticia de la ventanilla única (demostración)',
    signingKeyId: KEY_ID,
    signingPublicKey: PUBLIC_KEY,
  },
  nodes: [
    {
      id: 'node.queretaro',
      name: 'Nodo estatal Querétaro',
      baseUrl: 'https://denuncias.queretaro.example',
      isCommonNode: false,
      boxKeyId: KEY_ID_2,
      boxPublicKey: PUBLIC_KEY_2,
      signingKeyId: KEY_ID_3,
      signingPublicKey: PUBLIC_KEY,
    },
  ],
  authorities: [
    {
      id: 'authority.comptroller-queretaro',
      name: 'Contraloría Estatal Ficticia de Querétaro',
      nodeId: 'node.queretaro',
      governmentLevel: 'estatal',
      stateCode: '22',
      role: 'investigating',
      competence: {
        governmentLevels: ['estatal'],
        stateCodes: ['22'],
        entityIds: [],
        laws: ['LGRA'],
      },
      keyId: KEY_ID_2,
      boxPublicKey: PUBLIC_KEY_2,
      signingPublicKey: PUBLIC_KEY,
      supervisorId: null,
      validFrom: DAY,
      validUntil: null,
    },
  ],
  observers: [
    {
      id: 'observer.cpc-queretaro',
      name: 'Comité de Participación Ciudadana Ficticio de Querétaro',
      kind: 'cpc',
      signingKeyId: KEY_ID_3,
      signingPublicKey: PUBLIC_KEY_2,
    },
  ],
  witnessPolicy: { threshold: 1, witnessIds: ['observer.cpc-queretaro', 'node.queretaro'] },
};

const signedDirectory: SignedAuthorityDirectory = {
  directory,
  digest: DIGEST,
  operatorSignature: SIGNATURE,
  witnessSignatures: [
    { witnessId: 'observer.cpc-queretaro', keyId: KEY_ID_3, signature: SIGNATURE },
  ],
};

const relayRequest: RelayRequest = {
  v: 2,
  node: 'node.queretaro',
  sealed: { v: 1, suite: HPKE_SUITE_V1, keyId: KEY_ID_2, enc: ENC, ct: CT },
};

const relayResponse: RelayResponse = {
  v: 2,
  sealed: { v: 1, suite: HPKE_SUITE_V1, keyId: 'e07d9c3b5a1f2846', enc: ENC, ct: CT },
  queued: null,
};

const deferral = { proof: 'cmV0by1maWN0aWNpby1kZS1sYS1jb2xh.firma:12345' };

const queueReceipt: RelayQueueReceipt = {
  v: 1,
  queueId: '7c1e0b9d8a6f4e3c2b1a0f9e8d7c6b5a',
  node: 'node.queretaro',
  acceptedOn: DAY,
  expiresOn: '2026-11-16',
  envelopeDigest: DIGEST,
  operatorKeyId: KEY_ID,
  signature: SIGNATURE,
};

const nodeHead: SignedLedgerHead = {
  seq: 41,
  hash: HASH,
  at: DAY,
  serverKeyId: KEY_ID_3,
  signature: SIGNATURE,
};

const registration: NodeRegistration = {
  v: 1,
  nodeId: 'node.queretaro',
  sequence: 1794268800,
  standardVersion: '0.1.0',
  acceptsRelay: true,
  signature: SIGNATURE,
};

const registrationReceipt: NodeRegistrationReceipt = {
  nodeId: 'node.queretaro',
  sequence: 1794268800,
  acceptsRelay: true,
  registeredOn: DAY,
};

const headAcceptance: NodeHeadAcceptance = {
  nodeId: 'node.queretaro',
  status: 'recorded',
  entrySeq: 1,
};

const directoryEntry: NationalLedgerEntry = {
  v: 1,
  seq: 0,
  type: 'directory.version',
  at: DAY,
  directorySerial: 1,
  directoryDigest: DIGEST,
  prevHash: '0'.repeat(64),
  hash: '6e1d0c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d',
};

const nodeEntry: NationalLedgerEntry = {
  v: 1,
  seq: 1,
  type: 'node.head',
  at: DAY,
  nodeId: 'node.queretaro',
  nodeHead,
  prevHash: directoryEntry.hash,
  hash: 'f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f',
};

const cosignedHead: CosignedNationalHead = {
  head: {
    v: 1,
    seq: 1,
    hash: nodeEntry.hash,
    at: DAY,
    directorySerial: 1,
    operatorKeyId: KEY_ID,
  },
  operatorSignature: SIGNATURE,
  cosignatures: [
    { witnessId: 'node.queretaro', keyId: KEY_ID_3, signature: SIGNATURE },
    { witnessId: 'observer.cpc-queretaro', keyId: KEY_ID_3, signature: SIGNATURE },
  ],
};

const cosignatureRequest: NationalCosignatureRequest = {
  seq: 1,
  hash: nodeEntry.hash,
  cosignature: { witnessId: 'observer.cpc-queretaro', keyId: KEY_ID_3, signature: SIGNATURE },
};

const page: NationalLedgerPage = { entries: [directoryEntry, nodeEntry], head: cosignedHead };

const inclusion: NationalInclusionProof = {
  entry: nodeEntry,
  chain: [nodeEntry],
  head: cosignedHead,
};

const routedRequest: RoutedRequest = {
  v: 2,
  to: 'authority.comptroller-queretaro',
  operationId: 'getPowChallenge',
  query: { purpose: 'complaint' },
  proofOfWork: null,
  body: { kind: 'none' },
  replyPublicKey: PUBLIC_KEY_2,
};

const routedReply: RoutedReply = {
  v: 1,
  status: 200,
  body: { kind: 'json', value: { token: 'reto-ficticio', bits: 18 } },
};

const trustAnchor: NetworkTrustAnchor = {
  format: 1,
  operatorKeyId: KEY_ID,
  operatorSigningPublicKey: PUBLIC_KEY,
  threshold: 2,
  witnesses: [
    { id: 'observer.cpc-queretaro', keyId: KEY_ID_3, signingPublicKey: PUBLIC_KEY_2 },
    { id: 'observer.university-ejemplo', keyId: KEY_ID_2, signingPublicKey: PUBLIC_KEY },
    { id: 'node.queretaro', keyId: KEY_ID, signingPublicKey: PUBLIC_KEY_2 },
  ],
};

const nationalOpenData: NationalOpenData = {
  v: 1,
  cutAt: '2026-11-09T17:00Z',
  closedBefore: '2026-11',
  directorySerial: 1,
  minCell: 5,
  rounding: 5,
  nodes: [
    {
      nodeId: 'node.queretaro',
      name: 'Nodo estatal Querétaro',
      status: 'included',
      rejection: null,
      cells: 2,
      total: 25,
      ledgerHead: nodeHead,
      nationalEntrySeq: 1,
    },
    {
      nodeId: 'node.federal',
      name: 'Nodo Federal y común',
      status: 'unreachable',
      rejection: null,
      cells: 0,
      total: 0,
      ledgerHead: null,
      nationalEntrySeq: null,
    },
  ],
  cells: [
    {
      stateCode: '22',
      offenseCode: 'LGRA-52',
      month: '2026-10',
      status: 'investigating',
      count: 10,
    },
    { stateCode: '22', offenseCode: 'LGRA-57', month: '2026-10', status: 'archived', count: 10 },
  ],
  suppressed: 5,
};

/** Ejemplos sintéticos del grupo; cumplen los esquemas pero no son criptográficamente válidos. */
export const NETWORK_EXAMPLES = {
  'get-network-directory.response': signedDirectory,
  'relay-envelope.request': relayRequest,
  'relay-envelope.response': relayResponse,
  'get-queue-challenge.response': { token: 'cmV0by1maWN0aWNpby1kZS1sYS1jb2xh.firma', bits: 18 },
  'relay-queue-receipt.content': queueReceipt,
  'relay-deferral.content': deferral,
  'register-node.request': registration,
  'register-node.response': registrationReceipt,
  'publish-node-head.request': nodeHead,
  'publish-node-head.response': headAcceptance,
  'get-national-head.response': cosignedHead,
  'get-pending-national-head.response': { ...cosignedHead, cosignatures: [] },
  'cosign-national-head.request': cosignatureRequest,
  'cosign-national-head.response': cosignedHead,
  'list-national-entries.response': page,
  'get-node-head-inclusion.response': inclusion,
  'get-national-open-data.response': nationalOpenData,
  'receive-routed-envelope.request': relayRequest,
  'receive-routed-envelope.response': relayResponse,
  'routed-request.content': routedRequest,
  'routed-reply.content': routedReply,
  'network-trust-anchor.content': trustAnchor,
} as const;

export type NetworkExampleName = keyof typeof NETWORK_EXAMPLES;

/** Ejemplos de componentes que no son cuerpo de ninguna operación. */
export const NETWORK_EXTRA_EXAMPLES: Partial<Record<NetworkComponentName, NetworkExampleName>> = {
  RelayQueueReceipt: 'relay-queue-receipt.content',
  RelayDeferral: 'relay-deferral.content',
  RoutedRequest: 'routed-request.content',
  RoutedReply: 'routed-reply.content',
  NetworkTrustAnchor: 'network-trust-anchor.content',
};

/** Cuerpo de una operación de la red: JSON con su componente, o texto (el CSV nacional). */
export type NetworkBody =
  | {
      kind: 'json';
      component: NetworkComponentName | StandardComponentName;
      isArray?: boolean;
      example: NetworkExampleName;
    }
  | { kind: 'text'; mediaType: string; description: string; example: string };

/** Operación del grupo «Red». `servedBy` dice quién la implementa. */
export interface NetworkOperation {
  operationId: string;
  method: 'get' | 'post';
  path: string;
  tag: 'Red';
  servedBy: 'router' | 'node';
  summary: string;
  description: string;
  security: 'none';
  parameters: readonly StandardParameter[];
  requestBody?: NetworkBody;
  success: { status: 200; description: string; body: NetworkBody };
  errors: readonly ApiErrorCode[];
}

const NODE_ID_PARAMETER: StandardParameter = {
  name: 'nodeId',
  in: 'path',
  required: true,
  description: 'Identificador del nodo en el directorio.',
  schema: { type: 'string', pattern: '^node\\.[a-z0-9]+(?:-[a-z0-9]+)*$' },
};

const JSON_ERRORS: readonly ApiErrorCode[] = [
  'bad_request',
  'payload_too_large',
  'unsupported_media_type',
];

export const NETWORK_OPERATIONS: readonly NetworkOperation[] = [
  {
    operationId: 'getNetworkDirectory',
    method: 'get',
    path: NETWORK_ROUTES.directory,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Directorio de autoridades firmado',
    description:
      'Versión vigente del directorio con la firma de la operación y las cofirmas de los testigos. El navegador lo verifica con la llave de la operación y las de los testigos que trae fijadas (m de n) y solo entonces toma de ahí las llaves de la autoridad. Al estar firmado, cualquier nodo puede servir una copia.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Directorio firmado y cofirmado.',
      body: {
        kind: 'json',
        component: 'SignedAuthorityDirectory',
        example: 'get-network-directory.response',
      },
    },
    errors: [],
  },
  {
    operationId: 'relayEnvelope',
    method: 'post',
    path: NETWORK_ROUTES.relay,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Enviar un sobre por el enrutador ciego',
    description:
      'Sobre v2: el enrutador lee solo el nodo destino (la autoridad va cifrada dentro del sobre), comprueba que el sobre vaya a la llave de ese nodo y que mida uno de los tramos fijos, y lo reenvía al buzón de red del nodo sin cabeceras de quien envía. No guarda el sobre, la dirección IP ni las cabeceras. Responde `200` con la misma forma y tamaño para cualquier destino; si no pudo entregar, el sobre de vuelta es relleno que el navegador no podrá abrir. Un sobre v1 (con `to` en el encabezado) se rechaza con `400` y un mensaje que pide actualizar la ventanilla. Cola de entrega: si el sobre lleva `deferral` (una denuncia sin pruebas, con la solución del reto `getQueueChallenge`) y el nodo no responde, el enrutador guarda el sobre cerrado (no puede abrirlo), responde con relleno y un acuse firmado en `queued`, y reintenta con espera exponencial hasta entregarlo o hasta que venza a los 7 días; al entregarlo lo borra. Responde `428` si la solución falta o no vale, y `429` si la cola de ese nodo está llena.',
    security: 'none',
    parameters: [],
    requestBody: { kind: 'json', component: 'RelayRequest', example: 'relay-envelope.request' },
    success: {
      status: 200,
      description: 'Sobre de vuelta cifrado hacia la llave efímera del navegador.',
      body: { kind: 'json', component: 'RelayResponse', example: 'relay-envelope.response' },
    },
    errors: [...JSON_ERRORS, 'rate_limited', 'proof_required'],
  },
  {
    operationId: 'getQueueChallenge',
    method: 'get',
    path: NETWORK_ROUTES.queueChallenge,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Reto para dejar una denuncia en la cola de entrega',
    description:
      'Reto de prueba de trabajo del enrutador (firmado con su propia llave HMAC, con vencimiento y de un solo uso). Lo pide la ventanilla cuando el nodo destino no responde: la solución va en `deferral.proof` del sobre. El enrutador no puede pedirle al nodo caído su reto, así que la cola se protege con el suyo.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Reto vigente.',
      body: { kind: 'json', component: 'PowChallenge', example: 'get-queue-challenge.response' },
    },
    errors: [],
  },
  {
    operationId: 'registerNode',
    method: 'post',
    path: NETWORK_ROUTES.nodeRegistration('{nodeId}'),
    tag: 'Red',
    servedBy: 'router',
    summary: 'Registrar un nodo',
    description:
      'El nodo prueba que tiene la llave de firma del directorio y declara si ya recibe sobres de red. La secuencia debe crecer: un registro anterior reenviado se rechaza.',
    security: 'none',
    parameters: [NODE_ID_PARAMETER],
    requestBody: { kind: 'json', component: 'NodeRegistration', example: 'register-node.request' },
    success: {
      status: 200,
      description: 'Registro aceptado.',
      body: {
        kind: 'json',
        component: 'NodeRegistrationReceipt',
        example: 'register-node.response',
      },
    },
    errors: [...JSON_ERRORS, 'not_found'],
  },
  {
    operationId: 'publishNodeHead',
    method: 'post',
    path: NETWORK_ROUTES.nodeHeads('{nodeId}'),
    tag: 'Red',
    servedBy: 'router',
    summary: 'Publicar la cabeza de un nodo',
    description:
      'Agrega a la bitácora nacional la cabeza firmada de la bitácora del nodo (`SignedLedgerHead`), si está firmada con la llave del nodo en el directorio y avanza. Una cabeza que retrocede o repite la secuencia con otro hash se rechaza. El enrutador también recoge las cabezas por su cuenta en `GET /api/v1/ledger/head` de cada nodo.',
    security: 'none',
    parameters: [NODE_ID_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'SignedLedgerHead',
      example: 'publish-node-head.request',
    },
    success: {
      status: 200,
      description: 'Cabeza registrada o ya presente.',
      body: {
        kind: 'json',
        component: 'NodeHeadAcceptance',
        example: 'publish-node-head.response',
      },
    },
    errors: [...JSON_ERRORS, 'not_found'],
  },
  {
    operationId: 'getNationalHead',
    method: 'get',
    path: NETWORK_ROUTES.nationalHead,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Cabeza nacional cofirmada',
    description:
      'Última cabeza de la bitácora nacional con la firma de la operación y al menos m cofirmas válidas de testigos distintos. Responde `404` si todavía no hay ninguna.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Cabeza nacional cofirmada.',
      body: {
        kind: 'json',
        component: 'CosignedNationalHead',
        example: 'get-national-head.response',
      },
    },
    errors: ['not_found'],
  },
  {
    operationId: 'getPendingNationalHead',
    method: 'get',
    path: NETWORK_ROUTES.nationalPending,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Cabeza nacional pendiente',
    description:
      'Última cabeza emitida por la operación, con las cofirmas que tenga. Los testigos la verifican contra la bitácora antes de cofirmar.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Cabeza pendiente.',
      body: {
        kind: 'json',
        component: 'CosignedNationalHead',
        example: 'get-pending-national-head.response',
      },
    },
    errors: ['not_found'],
  },
  {
    operationId: 'cosignNationalHead',
    method: 'post',
    path: NETWORK_ROUTES.nationalCosignatures,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Cofirmar la cabeza nacional',
    description:
      'Un testigo entrega su cofirma después de comprobar que la bitácora solo creció desde su última cofirma y que cada cabeza de nodo es válida. Una cofirma que no verifica con la llave del testigo en el directorio se rechaza.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'NationalCosignatureRequest',
      example: 'cosign-national-head.request',
    },
    success: {
      status: 200,
      description: 'Cabeza con la cofirma agregada.',
      body: {
        kind: 'json',
        component: 'CosignedNationalHead',
        example: 'cosign-national-head.response',
      },
    },
    errors: JSON_ERRORS,
  },
  {
    operationId: 'listNationalEntries',
    method: 'get',
    path: NETWORK_ROUTES.nationalEntries,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Entradas de la bitácora nacional',
    description:
      'Entradas desde la secuencia `from`, con la última cabeza cofirmada. Cualquiera puede recalcular la cadena.',
    security: 'none',
    parameters: [
      {
        name: 'from',
        in: 'query',
        required: false,
        description: 'Secuencia inicial; 0 por omisión.',
        schema: { type: 'integer', minimum: 0, maximum: 999999999999999 },
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Tamaño de página: 100 por omisión y 500 como máximo.',
        schema: { type: 'integer', minimum: 1, maximum: 999999999999999, default: 100 },
      },
    ],
    success: {
      status: 200,
      description: 'Página de entradas.',
      body: {
        kind: 'json',
        component: 'NationalLedgerPage',
        example: 'list-national-entries.response',
      },
    },
    errors: ['bad_request'],
  },
  {
    operationId: 'getNodeHeadInclusion',
    method: 'get',
    path: NETWORK_ROUTES.nationalInclusion,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Prueba de inclusión de una cabeza de nodo',
    description:
      'Entrada que contiene exactamente esa cabeza del nodo, el tramo hasta la última cabeza cofirmada y esa cabeza. Responde `404` si la cabeza no está, o si todavía no la cubre una cabeza con m cofirmas.',
    security: 'none',
    parameters: [
      {
        name: 'nodeId',
        in: 'query',
        required: true,
        description: 'Nodo de la cabeza.',
        schema: { type: 'string', pattern: '^node\\.[a-z0-9]+(?:-[a-z0-9]+)*$' },
      },
      {
        name: 'seq',
        in: 'query',
        required: true,
        description: 'Secuencia de la cabeza del nodo.',
        schema: { type: 'integer', minimum: 0, maximum: 999999999999999 },
      },
      {
        name: 'hash',
        in: 'query',
        required: true,
        description: 'Hash de la cabeza del nodo.',
        schema: { type: 'string', pattern: '^[0-9a-f]{64}$' },
      },
    ],
    success: {
      status: 200,
      description: 'Prueba de inclusión.',
      body: {
        kind: 'json',
        component: 'NationalInclusionProof',
        example: 'get-node-head-inclusion.response',
      },
    },
    errors: ['bad_request', 'not_found', 'payload_too_large'],
  },
  {
    operationId: 'getNationalOpenData',
    method: 'get',
    path: NETWORK_ROUTES.nationalOpenData,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Corte nacional de datos abiertos',
    description:
      'Suma por entidad, conducta, mes y estatus de los CSV públicos de datos abiertos de cada nodo del directorio (Bases de la PDN, arts. 60 y 61). El enrutador descarga cada CSV en `GET /api/v1/open-data/complaints.csv`, lo valida (encabezado, catálogos, solo meses anteriores al mes en curso, conteos múltiplos de 5 y de al menos 5, sin celdas repetidas y con su fila de suprimidas) y descarta completo el que no cumpla. Después de sumar vuelve a aplicar la celda mínima. Un nodo que no responde aparece como `unreachable`: sin datos de ese nodo en este corte. Cada nodo lleva la cabeza de su bitácora vigente en la bitácora nacional, como referencia; los conteos no están firmados ni se pueden comprobar con ella: se comprueban rehaciendo la suma con los CSV de los nodos. Responde `404` hasta el primer corte.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Último corte nacional.',
      body: {
        kind: 'json',
        component: 'NationalOpenData',
        example: 'get-national-open-data.response',
      },
    },
    errors: ['not_found'],
  },
  {
    operationId: 'downloadNationalOpenData',
    method: 'get',
    path: NETWORK_ROUTES.nationalOpenDataCsv,
    tag: 'Red',
    servedBy: 'router',
    summary: 'Corte nacional de datos abiertos en CSV',
    description:
      'Las celdas del último corte nacional con las mismas columnas que el CSV de cada nodo y su fila final de suprimidas. Qué nodos se sumaron está en la versión JSON. Responde `404` hasta el primer corte.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Archivo CSV en UTF-8.',
      body: {
        kind: 'text',
        mediaType: 'text/csv',
        description: 'Columnas: entidad, conducta, mes_recepcion, estatus, denuncias.',
        example:
          'entidad,conducta,mes_recepcion,estatus,denuncias\n22,LGRA-52,2026-10,investigating,10\nsuprimidas,,,,5\n',
      },
    },
    errors: ['not_found'],
  },
  {
    operationId: 'receiveRoutedEnvelope',
    method: 'post',
    path: NETWORK_ROUTES.nodeInbox,
    tag: 'Red',
    servedBy: 'node',
    summary: 'Buzón de red del nodo',
    description:
      'La sirve cada nodo, no el enrutador. Abre el sobre con la llave X25519 del nodo (el AAD lo liga al nodo del encabezado), comprueba que la autoridad interna (`RoutedRequest.to`) esté alojada en el nodo y vigente, ejecuta la operación pedida como si llegara a su ruta v1 y cifra la respuesta (`RoutedReply`) hacia la llave efímera. Un sobre que no abre, de otro nodo o hacia una autoridad que el nodo no aloja responde `400` sin decir por qué.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'RelayRequest',
      example: 'receive-routed-envelope.request',
    },
    success: {
      status: 200,
      description: 'Sobre de vuelta.',
      body: {
        kind: 'json',
        component: 'RelayResponse',
        example: 'receive-routed-envelope.response',
      },
    },
    errors: JSON_ERRORS,
  },
];
