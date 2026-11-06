// Grupo «Corroboración» del Estándar S5: evaluador OPRF e índice de coincidencias (ADR 0006 y
// 0010), con sus esquemas con nombre y ejemplos sintéticos. Son dos servicios con operación separada.
import type { z } from 'zod';
import {
  CORROBORATION_OPRF_SUITE,
  CorroborationEvaluatorKeySchema,
  CorroborationIdentifierKindSchema,
  DirectoryCorroborationSchema,
} from '../corroboration-key.ts';
import type { CorroborationEvaluatorKey } from '../corroboration-key.ts';
import {
  CORROBORATION_ROUTES,
  CorroborationConfirmationSchema,
  CorroborationEntrySchema,
  CorroborationEvaluationRequestSchema,
  CorroborationEvaluationResponseSchema,
  CorroborationFlagSchema,
  CorroborationStatusSchema,
  EvaluationCountsPageSchema,
  EvaluationDailyCountSchema,
  IndependenceSignalSchema,
  IndexConfirmationSchema,
  IndexNoticeSchema,
  IndexNoticesPageSchema,
  IndexNoticesRequestSchema,
  IndexRegistrationSchema,
  IndexWithdrawalReasonSchema,
  IndexWithdrawalReceiptSchema,
  IndexWithdrawalSchema,
} from '../corroboration.ts';
import type {
  CorroborationEvaluationRequest,
  CorroborationEvaluationResponse,
  CorroborationStatus,
  EvaluationCountsPage,
  IndexConfirmation,
  IndexNoticesPage,
  IndexNoticesRequest,
  IndexRegistration,
  IndexWithdrawal,
  IndexWithdrawalReceipt,
} from '../corroboration.ts';
import type { ApiErrorCode } from '../errors.ts';
import type { PowChallenge } from '../pow.ts';
import type { StandardComponentName, StandardParameter } from './operations.ts';

/** Esquemas con nombre propio del grupo «Corroboración», en el orden del diccionario. */
export const CORROBORATION_COMPONENTS = {
  CorroborationEvaluatorKey: CorroborationEvaluatorKeySchema,
  DirectoryCorroboration: DirectoryCorroborationSchema,
  CorroborationIdentifierKind: CorroborationIdentifierKindSchema,
  CorroborationEvaluationRequest: CorroborationEvaluationRequestSchema,
  CorroborationEvaluationResponse: CorroborationEvaluationResponseSchema,
  EvaluationDailyCount: EvaluationDailyCountSchema,
  EvaluationCountsPage: EvaluationCountsPageSchema,
  IndexRegistration: IndexRegistrationSchema,
  CorroborationEntry: CorroborationEntrySchema,
  CorroborationStatus: CorroborationStatusSchema,
  CorroborationConfirmation: CorroborationConfirmationSchema,
  IndexConfirmation: IndexConfirmationSchema,
  IndexWithdrawal: IndexWithdrawalSchema,
  IndexWithdrawalReason: IndexWithdrawalReasonSchema,
  IndexWithdrawalReceipt: IndexWithdrawalReceiptSchema,
  CorroborationFlag: CorroborationFlagSchema,
  IndependenceSignal: IndependenceSignalSchema,
  IndexNoticesRequest: IndexNoticesRequestSchema,
  IndexNotice: IndexNoticeSchema,
  IndexNoticesPage: IndexNoticesPageSchema,
} as const satisfies Record<string, z.ZodType>;

export type CorroborationComponentName = keyof typeof CORROBORATION_COMPONENTS;

/** Sección del estándar del grupo. */
export const CORROBORATION_TAG = {
  name: 'Corroboración',
  description:
    'Corroboración ciega con VOPRF (RFC 9497, ristretto255-SHA512): el navegador obtiene del evaluador OPRF una etiqueta del identificador sin revelarlo, y el índice de coincidencias cuenta fuentes independientes por etiqueta sin saber a quién se acusa. Son dos servicios que operan partes distintas; la coincidencia solo suma prioridad explicable.',
} as const;

const KEY_ID = '7c2e9a4b1d0f3856';
const SIGNING_KEY_ID = 'b51f0e3a9c7d2468';
const ELEMENT = 'yAPizGsF_BUGRUm1kgZZykp3ssym8E9rNXAJM1R2rU4';
const ELEMENT_2 = 'qo-gSHZNViOGhnlAL_YQjSUhiE-hOM1_nHZpqaAUJn4';
const PROOF =
  '3e-TdyaS5TXRpTkD2yQ2c1XMLMeN6Ts75aj_zGmF3QZtQ0ZCHRe_UReiof8Pyyp1n1ilOd--hXpAvOTPSexgDQ';
const SIGNATURE =
  '7XdDyy1y5I9NAnkJ3hfkF7WFG8Z-o-EFmjpe-32pN3oxmSg9vQ-yk29HmYt-zMLCE7ZjhW8EgUD3kdP-FtonOg';
const TAG = '5f0c8e2b7a91d4c36e0f2a8b9d1c7e3f4a6b8c0d2e4f6a8b0c1d3e5f7a9b1c2d';
const FOLIO_DIGEST = '0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e';
const SIMILARITY =
  'c3VtYXJpb19kaWZ1c29fZmljdGljaW9fZGVfNjRfYnl0ZXNfcGFyYV9lbF9lamVtcGxvX2RlbF9lc3RhbmRhcg';
const DAY = '2026-11-12';

const evaluatorKey: CorroborationEvaluatorKey = {
  suite: CORROBORATION_OPRF_SUITE,
  epoch: 1,
  keyId: KEY_ID,
  publicKey: ELEMENT,
  signingKeyId: SIGNING_KEY_ID,
  signingPublicKey: 'TGxhdmVfZmljdGljaWFfZGVfZWplbXBsb19kb3NfX19f',
  validFrom: '2026-11-09',
};

const challenge: PowChallenge = { token: 'cmV0by1maWN0aWNpbw.ZmlybWEtZmljdGljaWE', bits: 18 };

const evaluationRequest: CorroborationEvaluationRequest = {
  v: 1,
  keyId: KEY_ID,
  blinded: ELEMENT_2,
};

const evaluationResponse: CorroborationEvaluationResponse = {
  v: 1,
  suite: CORROBORATION_OPRF_SUITE,
  epoch: 1,
  keyId: KEY_ID,
  evaluated: ELEMENT,
  proof: PROOF,
};

const counts: EvaluationCountsPage = {
  counts: [
    {
      v: 1,
      day: '2026-11-11',
      epoch: 1,
      evaluations: 7,
      signingKeyId: SIGNING_KEY_ID,
      signature: SIGNATURE,
    },
  ],
};

const registration: IndexRegistration = {
  v: 1,
  nodeId: 'node.federal',
  epoch: 1,
  tag: TAG,
  folioDigest: FOLIO_DIGEST,
  receivedAt: `${DAY}T16:20Z`,
  entry: 'direct',
  similarity: SIMILARITY,
  signature: SIGNATURE,
};

const status: CorroborationStatus = {
  folioDigest: FOLIO_DIGEST,
  confirmation: 'confirmed',
  isRevealed: true,
  groupId: '4b8e1f0a2c9d7e3651a0b4c8d2e6f193',
  complaints: 2,
  independentSources: 2,
  confirmedOtherSources: 1,
  sameOriginCount: 1,
  flags: [],
  signals: [],
};

const noticesRequest: IndexNoticesRequest = {
  v: 1,
  nodeId: 'node.federal',
  after: 0,
  requestedAt: `${DAY}T16:30Z`,
  signature: SIGNATURE,
};

const notices: IndexNoticesPage = { notices: [{ seq: 1, status }] };

const confirmation: IndexConfirmation = {
  v: 1,
  nodeId: 'node.federal',
  folioDigest: FOLIO_DIGEST,
  requestedAt: `${DAY}T16:30Z`,
  signature: SIGNATURE,
};

const withdrawal: IndexWithdrawal = {
  v: 1,
  nodeId: 'node.federal',
  folioDigest: FOLIO_DIGEST,
  reason: 'spam',
  requestedAt: `${DAY}T16:30Z`,
  signature: SIGNATURE,
};

const withdrawalReceipt: IndexWithdrawalReceipt = { folioDigest: FOLIO_DIGEST, withdrawn: true };

/** Ejemplos sintéticos del grupo; cumplen los esquemas pero no son criptográficamente válidos. */
export const CORROBORATION_EXAMPLES = {
  'get-corroboration-evaluator-key.response': evaluatorKey,
  'get-corroboration-challenge.response': challenge,
  'evaluate-corroboration.request': evaluationRequest,
  'evaluate-corroboration.response': evaluationResponse,
  'list-evaluation-counts.response': counts,
  'register-corroboration.request': registration,
  'register-corroboration.response': status,
  'list-corroboration-notices.request': noticesRequest,
  'list-corroboration-notices.response': notices,
  'confirm-corroboration.request': confirmation,
  'confirm-corroboration.response': status,
  'withdraw-corroboration.request': withdrawal,
  'withdraw-corroboration.response': withdrawalReceipt,
} as const;

export type CorroborationExampleName = keyof typeof CORROBORATION_EXAMPLES;

/** Cuerpo JSON de una operación de la corroboración. */
export interface CorroborationBody {
  kind: 'json';
  component: CorroborationComponentName | StandardComponentName;
  isArray?: boolean;
  example: CorroborationExampleName;
}

/** Operación del grupo «Corroboración». `servedBy` dice qué servicio la implementa. */
export interface CorroborationOperation {
  operationId: string;
  method: 'get' | 'post';
  path: string;
  tag: 'Corroboración';
  servedBy: 'evaluator' | 'index';
  summary: string;
  description: string;
  security: 'none' | 'proofOfWork';
  parameters: readonly StandardParameter[];
  requestBody?: CorroborationBody;
  success: { status: 200; description: string; body: CorroborationBody };
  errors: readonly ApiErrorCode[];
}

const JSON_ERRORS: readonly ApiErrorCode[] = [
  'bad_request',
  'payload_too_large',
  'unsupported_media_type',
];

export const CORROBORATION_OPERATIONS: readonly CorroborationOperation[] = [
  {
    operationId: 'getCorroborationEvaluatorKey',
    method: 'get',
    path: CORROBORATION_ROUTES.evaluatorKey,
    tag: 'Corroboración',
    servedBy: 'evaluator',
    summary: 'Llave pública del evaluador OPRF',
    description:
      'Llave pública vigente del evaluador. Es informativa: el navegador debe usar la que publica el directorio firmado (`corroboration.evaluator`), porque una llave servida por el propio evaluador no protege contra una llave distinta por persona.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Llave pública del evaluador.',
      body: {
        kind: 'json',
        component: 'CorroborationEvaluatorKey',
        example: 'get-corroboration-evaluator-key.response',
      },
    },
    errors: [],
  },
  {
    operationId: 'getCorroborationChallenge',
    method: 'get',
    path: CORROBORATION_ROUTES.evaluatorChallenge,
    tag: 'Corroboración',
    servedBy: 'evaluator',
    summary: 'Reto de prueba de trabajo para una evaluación',
    description:
      'Reto opaco firmado con HMAC por el evaluador, de un solo uso y con vencimiento. La dificultad la fija la operación del evaluador y encarece la enumeración de identificadores.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Reto de prueba de trabajo.',
      body: {
        kind: 'json',
        component: 'PowChallenge',
        example: 'get-corroboration-challenge.response',
      },
    },
    errors: [],
  },
  {
    operationId: 'evaluateCorroboration',
    method: 'post',
    path: CORROBORATION_ROUTES.evaluations,
    tag: 'Corroboración',
    servedBy: 'evaluator',
    summary: 'Evaluar un elemento cegado',
    description:
      'Evalúa con la llave privada un elemento cegado por el navegador (VOPRF, RFC 9497, sección 3.3.2) y devuelve el resultado con la prueba DLEQ. Exige la cabecera `X-Sigilo-Pow` con un reto de `getCorroborationChallenge`. El evaluador no guarda el elemento, el resultado ni la dirección de quien pide; solo suma uno al conteo del día.',
    security: 'proofOfWork',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'CorroborationEvaluationRequest',
      example: 'evaluate-corroboration.request',
    },
    success: {
      status: 200,
      description: 'Elemento evaluado y prueba DLEQ.',
      body: {
        kind: 'json',
        component: 'CorroborationEvaluationResponse',
        example: 'evaluate-corroboration.response',
      },
    },
    errors: [...JSON_ERRORS, 'proof_required', 'rate_limited'],
  },
  {
    operationId: 'listEvaluationCounts',
    method: 'get',
    path: CORROBORATION_ROUTES.evaluationCounts,
    tag: 'Corroboración',
    servedBy: 'evaluator',
    summary: 'Conteos diarios de evaluaciones',
    description:
      'Conteos firmados de días ya cerrados (nunca el del día en curso, para no delatar el momento de cada consulta). La bitácora nacional los publica junto al número de denuncias: si las evaluaciones superan por mucho a las denuncias, hay enumeración.',
    security: 'none',
    parameters: [
      {
        name: 'from',
        in: 'query',
        required: false,
        description: 'Primer día (AAAA-MM-DD); por omisión, los últimos 30 días cerrados.',
        schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
    ],
    success: {
      status: 200,
      description: 'Conteos diarios firmados.',
      body: {
        kind: 'json',
        component: 'EvaluationCountsPage',
        example: 'list-evaluation-counts.response',
      },
    },
    errors: ['bad_request'],
  },
  {
    operationId: 'registerCorroboration',
    method: 'post',
    path: CORROBORATION_ROUTES.indexRegistrations,
    tag: 'Corroboración',
    servedBy: 'index',
    summary: 'Registrar la etiqueta de una denuncia',
    description:
      'El nodo registra, firmado con su llave del directorio, la etiqueta de una denuncia con su folio opaco y las señales de independencia. Mientras la denuncia no esté confirmada (ni envejecida ni en custodia), el índice responde el estado de una denuncia sola (`isRevealed: false`) y no la cuenta para las demás: registrar no sirve para saber si hay denuncias contra alguien ni para inflar fuentes. Las marcas de posible mismo origen o posible campaña sí se devuelven. Registrar dos veces el mismo folio devuelve el mismo estado; un folio dado de baja no se acepta.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'IndexRegistration',
      example: 'register-corroboration.request',
    },
    success: {
      status: 200,
      description: 'Estado de corroboración de la denuncia.',
      body: {
        kind: 'json',
        component: 'CorroborationStatus',
        example: 'register-corroboration.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized'],
  },
  {
    operationId: 'confirmCorroboration',
    method: 'post',
    path: CORROBORATION_ROUTES.indexConfirmations,
    tag: 'Corroboración',
    servedBy: 'index',
    summary: 'Confirmar que la autoridad aceptó la denuncia',
    description:
      'El nodo la llama cuando la autoridad acepta la denuncia (estado «aceptada» del trámite) y lo registra en su bitácora. Desde entonces la denuncia cuenta como fuente independiente para las demás de su etiqueta y su estado incluye el grupo. Sin confirmación ni baja, la denuncia cuenta sola a los 30 días naturales de su registro según el reloj del índice (`aged`). Responde `404` si el folio no está registrado por ese nodo.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'IndexConfirmation',
      example: 'confirm-corroboration.request',
    },
    success: {
      status: 200,
      description: 'Estado de corroboración, ya revelado.',
      body: {
        kind: 'json',
        component: 'CorroborationStatus',
        example: 'confirm-corroboration.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'not_found'],
  },
  {
    operationId: 'withdrawCorroboration',
    method: 'post',
    path: CORROBORATION_ROUTES.indexWithdrawals,
    tag: 'Corroboración',
    servedBy: 'index',
    summary: 'Dar de baja una denuncia del índice',
    description:
      'El nodo la llama al cerrar una denuncia como spam, improcedente o acumulada. El índice borra el registro (etiqueta, hora y resumen), recalcula el grupo y avisa a los demás nodos si su estado cambia; solo conserva el folio opaco con el motivo para no aceptarlo de nuevo. Es idempotente.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'IndexWithdrawal',
      example: 'withdraw-corroboration.request',
    },
    success: {
      status: 200,
      description: 'Baja aplicada.',
      body: {
        kind: 'json',
        component: 'IndexWithdrawalReceipt',
        example: 'withdraw-corroboration.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized'],
  },
  {
    operationId: 'listCorroborationNotices',
    method: 'post',
    path: CORROBORATION_ROUTES.indexNotices,
    tag: 'Corroboración',
    servedBy: 'index',
    summary: 'Avisos de corroboración para un nodo',
    description:
      'Petición firmada por el nodo. Devuelve los cambios de estado de los grupos donde el nodo tiene denuncias (por ejemplo, una coincidencia nueva con una denuncia archivada: posible nuevo indicio, LGRA, art. 100). Nunca dice qué otros nodos ni qué folios forman el grupo.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'IndexNoticesRequest',
      example: 'list-corroboration-notices.request',
    },
    success: {
      status: 200,
      description: 'Avisos pendientes.',
      body: {
        kind: 'json',
        component: 'IndexNoticesPage',
        example: 'list-corroboration-notices.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized'],
  },
];
