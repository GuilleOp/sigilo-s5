// Operaciones de la API v1 que forman el Estándar S5: método, ruta de `ROUTES`, esquemas,
// seguridad, parámetros y errores posibles. De aquí se genera `estandar/openapi.yaml`.
import type { z } from 'zod';
import {
  AccountIdSchema,
  AppealRequestSchema,
  AppealResponseSchema,
  ApproveIdentityRequestSchema,
  AuditSummarySchema,
  ImportClosuresRequestSchema,
  ImportClosuresResponseSchema,
  TransferComplaintRequestSchema,
  TransferComplaintResponseSchema,
  TransferReceiptRequestSchema,
  AuthorityAccountViewSchema,
  AuthorityFunctionSchema,
  AuthorityMessageRequestSchema,
  AuthorityProfileSchema,
  AuthoritySessionInfoSchema,
  AuthoritySessionSchema,
  ClosureRecordSchema,
  ClosureViewSchema,
  ComplaintDetailSchema,
  ComplaintSummarySchema,
  DeadlineViewSchema,
  DiscardEvidenceResponseSchema,
  EvidenceCustodySchema,
  EvidenceKeyGrantsRequestSchema,
  EvidenceKeyGrantsResponseSchema,
  EscalationContentSchema,
  EscalationDeliverySchema,
  EscalationSummarySchema,
  EvidenceDescriptorSchema,
  IdentityApprovalSchema,
  IdentityOpeningRequestViewSchema,
  LoginRequestSchema,
  OpenIdentityRequestSchema,
  OpenIdentityResponseSchema,
  ProcedureActionRequestSchema,
  ProcedureStateSchema,
  ProcedureStepSchema,
  ProcedureViewSchema,
  RuleTriggerViewSchema,
  SubmitComplaintRequestSchema,
  SubmitComplaintResponseSchema,
  TurnSemaphoreSchema,
} from '../index.ts';
import type { ApiErrorCode } from '../errors.ts';
import { ApiErrorSchema } from '../errors.ts';
import {
  RegistrationDecisionSchema,
  RegistrationListSchema,
  RegistrationReceiptSchema,
  RegistrationRequestSchema,
  RegistrationViewSchema,
} from '../registration.ts';
import { HpkeEnvelopeSchema } from '../envelope.ts';
import { IdentityBlockSchema, ReporterKeysSchema, ComplaintFactsSchema } from '../complaint.ts';
import { ComplaintModeSchema, ComplaintStatusSchema, SignedReceiptSchema } from '../complaint.ts';
import { PublicKeySetSchema } from '../keys.ts';
import {
  LedgerEventSchema,
  LedgerEventTypeSchema,
  LedgerPageSchema,
  SignedLedgerHeadSchema,
} from '../ledger.ts';
import { MailboxMessageSchema } from '../mailbox.ts';
import { PowChallengeSchema, PowPurposeSchema, POW_HEADER } from '../pow.ts';
import {
  ClosureReasonSchema,
  DeadlineKeySchema,
  DeadlineStatusSchema,
  DeadlineUnitSchema,
  EscalationRuleKeySchema,
  LegalStageSchema,
  LegalTrackSchema,
  ManagementStateSchema,
  OffenseSeveritySchema,
  ProcedureActionSchema,
  ProcedureActorSchema,
  RuleEffectSchema,
  TurnSemaphoreStatusSchema,
  TurnWaitSchema,
} from '../procedure.ts';
import { FOLIO_PATTERN } from '../primitives.ts';
import { ROUTES } from '../routes.ts';
import {
  EvidenceDiscardEntrySchema,
  IdentityAccessEntrySchema,
  ReporterMessageRequestSchema,
  TimelineEntrySchema,
  TrackingCredentialsSchema,
  TrackingViewSchema,
} from '../tracking.ts';
import type { StandardExampleName } from './examples.ts';

/**
 * Versión SemVer del Estándar S5 (independiente de la versión del software). Cambio mayor: una
 * ruta, campo o valor que deja de aceptarse; menor: algo nuevo y opcional; parche: textos.
 */
export const STANDARD_VERSION = '0.2.0';

/**
 * Esquemas con nombre propio en `components.schemas`. El resto se describe en línea dentro de
 * ellos. El orden es el del diccionario de datos.
 */
export const STANDARD_COMPONENTS = {
  SubmitComplaintRequest: SubmitComplaintRequestSchema,
  ComplaintFacts: ComplaintFactsSchema,
  EscalationContent: EscalationContentSchema,
  ReporterKeys: ReporterKeysSchema,
  EvidenceDescriptor: EvidenceDescriptorSchema,
  HpkeEnvelope: HpkeEnvelopeSchema,
  IdentityBlock: IdentityBlockSchema,
  SubmitComplaintResponse: SubmitComplaintResponseSchema,
  SignedReceipt: SignedReceiptSchema,
  TrackingCredentials: TrackingCredentialsSchema,
  TrackingView: TrackingViewSchema,
  TimelineEntry: TimelineEntrySchema,
  IdentityAccessEntry: IdentityAccessEntrySchema,
  EvidenceDiscardEntry: EvidenceDiscardEntrySchema,
  ReporterMessageRequest: ReporterMessageRequestSchema,
  MailboxMessage: MailboxMessageSchema,
  ProcedureView: ProcedureViewSchema,
  ProcedureStep: ProcedureStepSchema,
  DeadlineView: DeadlineViewSchema,
  ClosureView: ClosureViewSchema,
  RuleTriggerView: RuleTriggerViewSchema,
  LoginRequest: LoginRequestSchema,
  AuthoritySession: AuthoritySessionSchema,
  AuthoritySessionInfo: AuthoritySessionInfoSchema,
  AuthorityAccountView: AuthorityAccountViewSchema,
  AuthorityProfile: AuthorityProfileSchema,
  ComplaintSummary: ComplaintSummarySchema,
  TurnSemaphore: TurnSemaphoreSchema,
  ComplaintDetail: ComplaintDetailSchema,
  ProcedureActionRequest: ProcedureActionRequestSchema,
  ProcedureState: ProcedureStateSchema,
  OpenIdentityRequest: OpenIdentityRequestSchema,
  ApproveIdentityRequest: ApproveIdentityRequestSchema,
  IdentityOpeningRequestView: IdentityOpeningRequestViewSchema,
  IdentityApproval: IdentityApprovalSchema,
  OpenIdentityResponse: OpenIdentityResponseSchema,
  ClosureRecord: ClosureRecordSchema,
  EscalationSummary: EscalationSummarySchema,
  EscalationDelivery: EscalationDeliverySchema,
  AppealRequest: AppealRequestSchema,
  AppealResponse: AppealResponseSchema,
  TransferComplaintRequest: TransferComplaintRequestSchema,
  TransferComplaintResponse: TransferComplaintResponseSchema,
  TransferReceiptRequest: TransferReceiptRequestSchema,
  ImportClosuresRequest: ImportClosuresRequestSchema,
  ImportClosuresResponse: ImportClosuresResponseSchema,
  AuditSummary: AuditSummarySchema,
  DiscardEvidenceResponse: DiscardEvidenceResponseSchema,
  EvidenceCustody: EvidenceCustodySchema,
  EvidenceKeyGrantsRequest: EvidenceKeyGrantsRequestSchema,
  EvidenceKeyGrantsResponse: EvidenceKeyGrantsResponseSchema,
  AuthorityMessageRequest: AuthorityMessageRequestSchema,
  LedgerPage: LedgerPageSchema,
  LedgerEvent: LedgerEventSchema,
  SignedLedgerHead: SignedLedgerHeadSchema,
  PublicKeySet: PublicKeySetSchema,
  PowChallenge: PowChallengeSchema,
  ApiError: ApiErrorSchema,
  ComplaintMode: ComplaintModeSchema,
  ComplaintStatus: ComplaintStatusSchema,
  LedgerEventType: LedgerEventTypeSchema,
  PowPurpose: PowPurposeSchema,
  ManagementState: ManagementStateSchema,
  ClosureReason: ClosureReasonSchema,
  LegalTrack: LegalTrackSchema,
  LegalStage: LegalStageSchema,
  ProcedureActor: ProcedureActorSchema,
  DeadlineKey: DeadlineKeySchema,
  DeadlineUnit: DeadlineUnitSchema,
  DeadlineStatus: DeadlineStatusSchema,
  TurnSemaphoreStatus: TurnSemaphoreStatusSchema,
  TurnWait: TurnWaitSchema,
  ProcedureAction: ProcedureActionSchema,
  OffenseSeverity: OffenseSeveritySchema,
  EscalationRuleKey: EscalationRuleKeySchema,
  RuleEffect: RuleEffectSchema,
  AuthorityFunction: AuthorityFunctionSchema,
  AccountId: AccountIdSchema,
  RegistrationRequest: RegistrationRequestSchema,
  RegistrationReceipt: RegistrationReceiptSchema,
  RegistrationList: RegistrationListSchema,
  RegistrationView: RegistrationViewSchema,
  RegistrationDecision: RegistrationDecisionSchema,
} as const satisfies Record<string, z.ZodType>;

export type StandardComponentName = keyof typeof STANDARD_COMPONENTS;

/** Sección del estándar en la que se agrupa una operación. */
export type StandardTag =
  | 'Denuncia'
  | 'Seguimiento'
  | 'Sesión de la autoridad'
  | 'Autoridad'
  | 'Bitácora pública'
  | 'Datos abiertos'
  | 'Alta de autoridades'
  | 'Llaves y retos';

/** Descripción de cada sección, en el orden en que se muestran. */
export const STANDARD_TAGS: readonly { name: StandardTag; description: string }[] = [
  {
    name: 'Denuncia',
    description: 'Recepción de denuncias y de sus pruebas, con prueba de trabajo y sin cuentas.',
  },
  {
    name: 'Seguimiento',
    description:
      'Consulta y buzón de la persona denunciante con su folio y la llave derivada de su recibo.',
  },
  {
    name: 'Sesión de la autoridad',
    description:
      'Inicio y cierre de sesión con cuentas individuales; la sesión vence por inactividad y por duración.',
  },
  {
    name: 'Autoridad',
    description:
      'Panel de la autoridad competente con la sesión de una cuenta individual. Cada ruta comprueba la función de la cuenta y la competencia por folio, y toda acción deja rastro con el seudónimo de la cuenta.',
  },
  {
    name: 'Bitácora pública',
    description: 'Registro de solo agregar, encadenado y firmado, que cualquiera puede verificar.',
  },
  { name: 'Datos abiertos', description: 'Conteos agregados con redondeo y supresión.' },
  {
    name: 'Alta de autoridades',
    description:
      'Solicitud pública de alta de una institución con su candado (solo llaves públicas) y bandeja de la cuenta de operación del nodo, que aprueba con la huella confirmada por teléfono o rechaza con motivo.',
  },
  {
    name: 'Llaves y retos',
    description: 'Llaves públicas del despliegue y retos de prueba de trabajo.',
  },
];

/** Requisito de seguridad de una operación. */
export type StandardSecurity = 'none' | 'proofOfWork' | 'authorityBearer';

/** Parámetro de ruta o de consulta. */
export interface StandardParameter {
  name: string;
  in: 'path' | 'query';
  required: boolean;
  description: string;
  schema: Record<string, unknown>;
}

/** Cuerpo de una petición o una respuesta. */
export type StandardBody =
  | {
      kind: 'json';
      component: StandardComponentName;
      isArray?: boolean;
      example: StandardExampleName;
    }
  | { kind: 'binary'; mediaTypes: readonly string[]; description: string }
  | { kind: 'text'; mediaType: string; description: string; example: string };

/** Operación del estándar. `path` usa la notación de OpenAPI (`{folio}`). */
export interface StandardOperation {
  operationId: string;
  method: 'get' | 'post';
  path: string;
  tag: StandardTag;
  summary: string;
  description: string;
  security: StandardSecurity;
  parameters: readonly StandardParameter[];
  requestBody?: StandardBody;
  /** `body` falta solo en una respuesta 204 sin contenido. */
  success: { status: 200 | 201 | 204; description: string; body?: StandardBody };
  /** Errores posibles además de `internal`, que aplica a todas. */
  errors: readonly ApiErrorCode[];
}

const FOLIO_PARAMETER: StandardParameter = {
  name: 'folio',
  in: 'path',
  required: true,
  description: 'Folio de la denuncia.',
  schema: { type: 'string', pattern: FOLIO_PATTERN.source },
};

const REQUEST_ID_PARAMETER: StandardParameter = {
  name: 'requestId',
  in: 'path',
  required: true,
  description: 'Identificador de la solicitud de apertura (16 bytes en hexadecimal).',
  schema: { type: 'string', pattern: '^[0-9a-f]{32}$' },
};

const REGISTRATION_ID_PARAMETER: StandardParameter = {
  name: 'requestId',
  in: 'path',
  required: true,
  description: 'Folio de la solicitud de alta.',
  schema: { type: 'string', pattern: '^ALTA-[0-9A-F]{12}$' },
};

const PAGE_PARAMETERS: readonly StandardParameter[] = [
  {
    name: 'offset',
    in: 'query',
    required: false,
    description: 'Desplazamiento; 0 por omisión.',
    schema: { type: 'integer', minimum: 0, maximum: 999999999, default: 0 },
  },
  {
    name: 'limit',
    in: 'query',
    required: false,
    description: 'Tamaño de página: 100 por omisión y 500 como máximo.',
    schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
  },
];

const JSON_ERRORS: readonly ApiErrorCode[] = [
  'bad_request',
  'payload_too_large',
  'unsupported_media_type',
];

/** Ruta de `ROUTES` con los parámetros en notación de OpenAPI. */
function templated(route: (value: string) => string, name: string): string {
  return route(`{${name}}`);
}

export const STANDARD_OPERATIONS: readonly StandardOperation[] = [
  {
    operationId: 'getPublicKeys',
    method: 'get',
    path: ROUTES.keys,
    tag: 'Llaves y retos',
    summary: 'Llaves públicas del despliegue',
    description:
      'Devuelve la llave de firma del servidor y las llaves de cifrado y firma de la autoridad. El cliente debe compararlas con las que trae fijadas antes de cifrar nada.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Llaves públicas vigentes.',
      body: { kind: 'json', component: 'PublicKeySet', example: 'get-public-keys.response' },
    },
    errors: [],
  },
  {
    operationId: 'getPowChallenge',
    method: 'get',
    path: ROUTES.powChallenge,
    tag: 'Llaves y retos',
    summary: 'Reto de prueba de trabajo',
    description:
      'Entrega un reto firmado y con vencimiento. Un reto `complaint` sirve para las hasta 10 subidas de pruebas de una denuncia y para su envío; uno `message`, para un mensaje. La dificultad sube con la carga.',
    security: 'none',
    parameters: [
      {
        name: 'purpose',
        in: 'query',
        required: true,
        description: 'Propósito del reto.',
        schema: { type: 'string', enum: PowPurposeSchema.options },
      },
    ],
    success: {
      status: 200,
      description: 'Reto vigente.',
      body: { kind: 'json', component: 'PowChallenge', example: 'get-pow-challenge.response' },
    },
    errors: ['bad_request'],
  },
  {
    operationId: 'uploadEvidence',
    method: 'post',
    path: ROUTES.evidenceUpload,
    tag: 'Denuncia',
    summary: 'Subir una prueba',
    description:
      'Recibe el contenedor cifrado de una imagen ya limpia en el navegador (sin metadatos; los PDF llegan convertidos a imagen) como cuerpo binario. El navegador la cifra hacia la llave de la autoridad competente (HPKE con el folio y la autoridad en el AAD); el nodo solo comprueba el formato del contenedor y guarda su tamaño, su tipo declarado, su digesto y el compromiso de su cabecera. Usa el reto `complaint` de la denuncia. La prueba queda pendiente hasta que se envía la denuncia que la cita.',
    security: 'proofOfWork',
    parameters: [],
    requestBody: {
      kind: 'binary',
      mediaTypes: ['image/jpeg', 'image/png'],
      description:
        'Contenedor cifrado (formato SGEV v1) de la imagen limpia, de hasta 10 MiB más 165 bytes del cifrado. El tipo de contenido es el de la imagen cifrada.',
    },
    success: {
      status: 201,
      description: 'Prueba guardada.',
      body: { kind: 'json', component: 'EvidenceDescriptor', example: 'upload-evidence.response' },
    },
    errors: [
      'bad_request',
      'payload_too_large',
      'unsupported_media_type',
      'proof_required',
      'storage_full',
    ],
  },
  {
    operationId: 'submitComplaint',
    method: 'post',
    path: ROUTES.complaints,
    tag: 'Denuncia',
    summary: 'Enviar una denuncia',
    description:
      'Recibe los hechos legibles y, en modo `sealed`, la identidad cifrada hacia la autoridad; con `escalationEnvelope`, la segunda llave hacia la supervisora (solo hechos, pruebas y las llaves de sus archivos). Rechaza campos desconocidos y caracteres invisibles en el texto libre. No pide cuenta ni datos de contacto. Responde con el folio y un comprobante firmado; los eventos `complaint.received` y, si trae pruebas, `evidence.received` (digestos y compromisos de las pruebas cifradas) se publican en la bitácora al cerrar el día.',
    security: 'proofOfWork',
    parameters: [
      {
        name: 'folio',
        in: 'query',
        required: false,
        description:
          'Folio que eligió el navegador al azar, porque las pruebas se cifran con el folio en el AAD antes de enviar la denuncia. Si ya existe, responde 400. Sin él, el nodo elige uno.',
        schema: { type: 'string', pattern: FOLIO_PATTERN.source },
      },
    ],
    requestBody: {
      kind: 'json',
      component: 'SubmitComplaintRequest',
      example: 'submit-complaint.request',
    },
    success: {
      status: 201,
      description: 'Denuncia recibida.',
      body: {
        kind: 'json',
        component: 'SubmitComplaintResponse',
        example: 'submit-complaint.response',
      },
    },
    errors: [...JSON_ERRORS, 'proof_required', 'ledger_day_full'],
  },
  {
    operationId: 'getTracking',
    method: 'post',
    path: ROUTES.tracking,
    tag: 'Seguimiento',
    summary: 'Consultar el seguimiento',
    description:
      'La persona denunciante envía su folio y la llave derivada de su recibo (nunca el recibo). Si alguno es incorrecto, la respuesta es la misma `404 not_found`, sin decir cuál falló. Los fallos por folio están limitados.',
    security: 'none',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'TrackingCredentials',
      example: 'get-tracking.request',
    },
    success: {
      status: 200,
      description: 'Estatus, línea de tiempo, aperturas de identidad, descartes y buzón.',
      body: { kind: 'json', component: 'TrackingView', example: 'get-tracking.response' },
    },
    errors: [...JSON_ERRORS, 'not_found', 'rate_limited'],
  },
  {
    operationId: 'sendReporterMessage',
    method: 'post',
    path: ROUTES.trackingMessages,
    tag: 'Seguimiento',
    summary: 'Responder por el buzón',
    description:
      'Mensaje de la persona denunciante, cifrado hacia la autoridad y firmado con la llave derivada de su recibo. Exige un reto `message`.',
    security: 'proofOfWork',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'ReporterMessageRequest',
      example: 'send-reporter-message.request',
    },
    success: {
      status: 201,
      description: 'Mensaje guardado.',
      body: {
        kind: 'json',
        component: 'MailboxMessage',
        example: 'send-reporter-message.response',
      },
    },
    errors: [...JSON_ERRORS, 'not_found', 'rate_limited', 'proof_required', 'ledger_day_full'],
  },
  {
    operationId: 'fileAppeal',
    method: 'post',
    path: ROUTES.trackingAppeal,
    tag: 'Seguimiento',
    summary: 'Inconformarse contra la calificación de no grave',
    description:
      'Recurso de inconformidad de la persona denunciante contra la calificación de los hechos como falta no grave (LGRA, arts. 102 a 110), ante la autoridad investigadora que calificó (art. 104), dentro de los 5 días hábiles siguientes a la notificación (art. 103). La ley pide nombre, domicilio y firma (art. 109): la persona acepta abrir su identidad sellada solo para el recurso y la autoridad competente puede pedir el sobre sin la aprobación 2 de 3. Registra `appeal.filed` e `identity.opened` (con la etiqueta del recibo). Responde `409` si no hay calificación de no grave, si ya se presentó, si venció el plazo o si la denuncia es anónima. Exige un reto `message`.',
    security: 'proofOfWork',
    parameters: [],
    requestBody: { kind: 'json', component: 'AppealRequest', example: 'file-appeal.request' },
    success: {
      status: 201,
      description: 'Inconformidad registrada.',
      body: { kind: 'json', component: 'AppealResponse', example: 'file-appeal.response' },
    },
    errors: [...JSON_ERRORS, 'not_found', 'conflict', 'proof_required', 'ledger_day_full'],
  },
  {
    operationId: 'login',
    method: 'post',
    path: ROUTES.authLogin,
    tag: 'Sesión de la autoridad',
    summary: 'Iniciar sesión',
    description:
      'Cada persona de la autoridad inicia sesión con su cuenta propia; no hay cuentas ni tokens compartidos. Un usuario inexistente y una contraseña equivocada responden el mismo `401`. Tras 10 fallos de un usuario en 15 minutos, ese usuario responde `429` hasta que vence la ventana. Cada intento queda en el registro de seguridad sin IP.',
    security: 'none',
    parameters: [],
    requestBody: { kind: 'json', component: 'LoginRequest', example: 'login.request' },
    success: {
      status: 200,
      description: 'Sesión abierta: token, vencimientos y cuenta.',
      body: { kind: 'json', component: 'AuthoritySession', example: 'login.response' },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'rate_limited'],
  },
  {
    operationId: 'logout',
    method: 'post',
    path: ROUTES.authLogout,
    tag: 'Sesión de la autoridad',
    summary: 'Cerrar sesión',
    description:
      'Invalida en el servidor la sesión del token de `Authorization: Bearer` (sin cuerpo). Responde `204` aunque el token ya no exista, para no confirmar nada.',
    security: 'none',
    parameters: [],
    success: { status: 204, description: 'Sesión cerrada.' },
    errors: [],
  },
  {
    operationId: 'getSession',
    method: 'get',
    path: ROUTES.authSession,
    tag: 'Sesión de la autoridad',
    summary: 'Sesión vigente',
    description: 'Cuenta, autoridad y vencimientos de la sesión; renueva la inactividad.',
    security: 'authorityBearer',
    parameters: [],
    success: {
      status: 200,
      description: 'Sesión vigente.',
      body: { kind: 'json', component: 'AuthoritySessionInfo', example: 'get-session.response' },
    },
    errors: ['unauthorized'],
  },
  {
    operationId: 'listAuthorities',
    method: 'get',
    path: ROUTES.authorityAuthorities,
    tag: 'Autoridad',
    summary: 'Autoridades del nodo',
    description: 'Autoridades alojadas en el nodo, para turnar y reasignar.',
    security: 'authorityBearer',
    parameters: [],
    success: {
      status: 200,
      description: 'Autoridades del nodo.',
      body: {
        kind: 'json',
        component: 'AuthorityProfile',
        isArray: true,
        example: 'list-authorities.response',
      },
    },
    errors: ['unauthorized'],
  },
  {
    operationId: 'listAuthorityComplaints',
    method: 'get',
    path: ROUTES.authorityComplaints,
    tag: 'Autoridad',
    summary: 'Listado de denuncias',
    description:
      'Resúmenes paginados de las denuncias que tiene la autoridad de la cuenta (competencia por folio), sin identidad ni texto libre.',
    security: 'authorityBearer',
    parameters: PAGE_PARAMETERS,
    success: {
      status: 200,
      description: 'Página de resúmenes.',
      body: {
        kind: 'json',
        component: 'ComplaintSummary',
        isArray: true,
        example: 'list-authority-complaints.response',
      },
    },
    errors: ['bad_request', 'unauthorized'],
  },
  {
    operationId: 'getAuthorityComplaint',
    method: 'get',
    path: templated(ROUTES.authorityComplaint, 'folio'),
    tag: 'Autoridad',
    summary: 'Detalle de una denuncia',
    description:
      'Hechos, pruebas, buzón, trámite, solicitudes de apertura y datos para recalcular el contexto del sobre de identidad. La identidad sellada no viene aquí. Una denuncia de otra autoridad responde `404`, igual que una inexistente.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    success: {
      status: 200,
      description: 'Detalle de la denuncia.',
      body: {
        kind: 'json',
        component: 'ComplaintDetail',
        example: 'get-authority-complaint.response',
      },
    },
    errors: ['unauthorized', 'not_found'],
  },
  {
    operationId: 'applyProcedureAction',
    method: 'post',
    path: templated(ROUTES.authorityProcedure, 'folio'),
    tag: 'Autoridad',
    summary: 'Acción del trámite',
    description:
      'Turnar (`route`, solo recepción y turnado del buzón general), aceptar, reasignar o devolver al buzón general (recepción y turnado de la autoridad que la tiene), avanzar de etapa legal (investigación) o cerrar con uno de los seis motivos, su fundamento y la versión pública del acuerdo. Cada acción registra `complaint.status_changed` con el seudónimo de la cuenta y, si lleva nota, la persona denunciante la lee en su seguimiento. Responde `403` si la función no puede, `404` si la denuncia es de otra autoridad y `409` si el flujo no admite la acción (`conflict`) o si la denuncia ya se reasignó 3 veces, el tope del S5 (`reassignment_limit`). Turnar exige el motivo (`note`, al menos 10 caracteres).',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'ProcedureActionRequest',
      example: 'apply-procedure-action.request',
    },
    success: {
      status: 200,
      description: 'Estado del trámite después de la acción.',
      body: {
        kind: 'json',
        component: 'ProcedureState',
        example: 'apply-procedure-action.response',
      },
    },
    errors: [
      ...JSON_ERRORS,
      'unauthorized',
      'forbidden',
      'not_found',
      'conflict',
      'reassignment_limit',
    ],
  },
  {
    operationId: 'requestIdentityOpening',
    method: 'post',
    path: templated(ROUTES.authorityIdentityRequests, 'folio'),
    tag: 'Autoridad',
    summary: 'Solicitar abrir la identidad sellada',
    description:
      'Crea una solicitud de apertura con su fundamento, que cuenta como la primera de las dos aprobaciones de personas distintas de la autoridad competente (investigación o supervisión; nunca recepción y turnado). Registra `identity.approved`. El sobre no se entrega todavía.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'OpenIdentityRequest',
      example: 'request-identity-opening.request',
    },
    success: {
      status: 201,
      description: 'Solicitud pendiente de la segunda aprobación.',
      body: {
        kind: 'json',
        component: 'IdentityOpeningRequestView',
        example: 'request-identity-opening.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'forbidden', 'not_found'],
  },
  {
    operationId: 'approveIdentityOpening',
    method: 'post',
    path: ROUTES.authorityIdentityApprovals('{folio}', '{requestId}'),
    tag: 'Autoridad',
    summary: 'Aprobar una apertura de identidad',
    description:
      'Aprobación de otra persona de la autoridad competente, con su propio fundamento (`identity.approved`). Al llegar a dos aprobaciones distintas se registra `identity.opened` y la persona denunciante ve la apertura de inmediato. Responde `409` si la cuenta ya aprobó, si la solicitud ya se aprobó o si venció (7 días).',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER, REQUEST_ID_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'ApproveIdentityRequest',
      example: 'approve-identity-opening.request',
    },
    success: {
      status: 200,
      description: 'Solicitud con sus aprobaciones.',
      body: {
        kind: 'json',
        component: 'IdentityOpeningRequestView',
        example: 'approve-identity-opening.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'forbidden', 'not_found', 'conflict'],
  },
  {
    operationId: 'releaseIdentityEnvelope',
    method: 'post',
    path: ROUTES.authorityIdentityEnvelope('{folio}', '{requestId}'),
    tag: 'Autoridad',
    summary: 'Recibir el sobre de identidad',
    description:
      'Entrega el sobre de identidad (sin cuerpo) solo a una persona que aprobó una solicitud que alcanzó el umbral, mientras sigue vigente; cada entrega queda en el registro de seguridad. El sobre se abre en el navegador de la autoridad con el contexto recalculado desde el detalle: el nodo nunca descifra.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER, REQUEST_ID_PARAMETER],
    success: {
      status: 200,
      description: 'Sobre de identidad e identificador de la apertura.',
      body: {
        kind: 'json',
        component: 'OpenIdentityResponse',
        example: 'release-identity-envelope.response',
      },
    },
    errors: ['unauthorized', 'forbidden', 'not_found', 'conflict'],
  },
  {
    operationId: 'sendAuthorityMessage',
    method: 'post',
    path: templated(ROUTES.authorityMessages, 'folio'),
    tag: 'Autoridad',
    summary: 'Escribir por el buzón',
    description:
      'Mensaje de la autoridad cifrado hacia la llave del buzón de la persona denunciante y firmado por la autoridad.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'AuthorityMessageRequest',
      example: 'send-authority-message.request',
    },
    success: {
      status: 201,
      description: 'Mensaje guardado.',
      body: {
        kind: 'json',
        component: 'MailboxMessage',
        example: 'send-authority-message.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'forbidden', 'not_found'],
  },
  {
    operationId: 'discardEvidence',
    method: 'post',
    path: templated(ROUTES.authorityEvidenceDiscard, 'folio'),
    tag: 'Autoridad',
    summary: 'Descartar las pruebas',
    description:
      'Borra los archivos de las pruebas guardadas (sin cuerpo). Se registra `evidence.discarded` y la persona denunciante lo ve en su seguimiento. Los descriptores se conservan.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    success: {
      status: 200,
      description: 'Número de archivos borrados.',
      body: {
        kind: 'json',
        component: 'DiscardEvidenceResponse',
        example: 'discard-evidence.response',
      },
    },
    errors: ['unauthorized', 'forbidden', 'not_found'],
  },
  {
    operationId: 'grantEvidenceKeys',
    method: 'post',
    path: templated(ROUTES.authorityEvidenceKeys, 'folio'),
    tag: 'Autoridad',
    summary: 'Compartir las llaves de las pruebas',
    description:
      'Guarda la llave de cada archivo de prueba re-cifrada en el navegador de la autoridad competente hacia otra autoridad del mismo nodo, antes de turnarla o reasignarla. El contenedor no cambia; el nodo solo comprueba que cada sobre vaya hacia la llave publicada de esa autoridad y no puede abrirlo.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'EvidenceKeyGrantsRequest',
      example: 'grant-evidence-keys.request',
    },
    success: {
      status: 200,
      description: 'Número de llaves guardadas.',
      body: {
        kind: 'json',
        component: 'EvidenceKeyGrantsResponse',
        example: 'grant-evidence-keys.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'forbidden', 'not_found'],
  },
  {
    operationId: 'downloadEvidence',
    method: 'get',
    path: templated(ROUTES.authorityEvidence, 'evidenceId'),
    tag: 'Autoridad',
    summary: 'Descargar una prueba',
    description:
      'Devuelve el contenedor cifrado de la prueba como descarga opaca (`application/octet-stream`, `Content-Disposition: attachment`, `nosniff`); el navegador de la autoridad lo abre con su llave (o la supervisora, con la llave del archivo del sobre de escalamiento). Las pruebas pendientes, borradas, descartadas o cedidas a otro nodo responden `404`.',
    security: 'authorityBearer',
    parameters: [
      {
        name: 'evidenceId',
        in: 'path',
        required: true,
        description: 'Identificador de la prueba.',
        schema: { type: 'string', pattern: '^[0-9a-f]{32}$' },
      },
    ],
    success: {
      status: 200,
      description: 'Archivo de la prueba.',
      body: {
        kind: 'binary',
        mediaTypes: ['application/octet-stream'],
        description: 'Bytes del contenedor cifrado.',
      },
    },
    errors: ['unauthorized', 'not_found'],
  },
  {
    operationId: 'listClosures',
    method: 'get',
    path: ROUTES.authorityClosures,
    tag: 'Autoridad',
    summary: 'Acuerdos de cierre',
    description:
      'Acuerdos de cierre en versión pública de la autoridad de la cuenta y de las que supervisa, con su motivo, fundamento, digesto y el seudónimo de quien cerró. Solo supervisión; es la entrada del auditor.',
    security: 'authorityBearer',
    parameters: PAGE_PARAMETERS,
    success: {
      status: 200,
      description: 'Página de acuerdos.',
      body: {
        kind: 'json',
        component: 'ClosureRecord',
        isArray: true,
        example: 'list-closures.response',
      },
    },
    errors: ['bad_request', 'unauthorized', 'forbidden'],
  },
  {
    operationId: 'importClosures',
    method: 'post',
    path: ROUTES.authorityClosureImports,
    tag: 'Autoridad',
    summary: 'Importar acuerdos de cierre',
    description:
      'Registra un lote de hasta 1000 acuerdos de cierre recibidos por otros medios (Bases de la PDN, art. 58), ya en versión pública, para que el auditor los revise junto con los del nodo. Un expediente que ya estaba se omite. El lote queda en la bitácora como un solo evento `closures.imported` con su digesto. Recepción y turnado o investigación.',
    security: 'authorityBearer',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'ImportClosuresRequest',
      example: 'import-closures.request',
    },
    success: {
      status: 201,
      description: 'Acuerdos importados y omitidos, con el digesto del lote.',
      body: {
        kind: 'json',
        component: 'ImportClosuresResponse',
        example: 'import-closures.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'forbidden'],
  },
  {
    operationId: 'getAuditSummary',
    method: 'get',
    path: ROUTES.authorityAuditSummary,
    tag: 'Autoridad',
    summary: 'Conteos del auditor',
    description:
      'Conteo de señales del auditor (AUD-01 a AUD-08) por autoridad y regla, sin folios ni texto: la entrada agregada del observatorio. Cualquier cuenta con sesión.',
    security: 'authorityBearer',
    parameters: [],
    success: {
      status: 200,
      description: 'Conteos por autoridad y regla.',
      body: { kind: 'json', component: 'AuditSummary', example: 'get-audit-summary.response' },
    },
    errors: ['unauthorized'],
  },
  {
    operationId: 'transferComplaint',
    method: 'post',
    path: templated(ROUTES.authorityTransfer, 'folio'),
    tag: 'Autoridad',
    summary: 'Turnar a otro nodo',
    description:
      'Turna la denuncia a una autoridad de otro nodo de la red (SEC-19). El navegador de la autoridad descifra la denuncia y la vuelve a cifrar hacia la autoridad destino en un sobre del enrutador ciego; el nodo solo lo transporta al enrutador, registra `complaint.transferred` con el digesto del sobre y el seudónimo de la cuenta, y devuelve la respuesta cifrada, que solo abre ese navegador. Solo recepción y turnado de la autoridad que la tiene. Responde `400` si el destino no es una autoridad de otro nodo del directorio o el sobre no va hacia ella, y `409` si el nodo no está en una red con enrutador o la denuncia ya se cerró.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'TransferComplaintRequest',
      example: 'transfer-complaint.request',
    },
    success: {
      status: 200,
      description: 'Sobre de respuesta del nodo destino y el identificador del turnado.',
      body: {
        kind: 'json',
        component: 'TransferComplaintResponse',
        example: 'transfer-complaint.response',
      },
    },
    errors: [
      ...JSON_ERRORS,
      'unauthorized',
      'forbidden',
      'not_found',
      'conflict',
      'payload_too_large',
    ],
  },
  {
    operationId: 'confirmTransfer',
    method: 'post',
    path: templated(ROUTES.authorityTransferReceipt, 'folio'),
    tag: 'Autoridad',
    summary: 'Entregar el comprobante del turnado',
    description:
      'Entrega el comprobante firmado que el nodo destino emitió al recibir la denuncia turnada. El nodo lo verifica con la llave de firma de ese nodo en el directorio y avisa a la persona denunciante, en su seguimiento, del folio nuevo: sus mismas 8 palabras sirven allá. Solo la autoridad que turnó, una vez (`409` la segunda).',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'TransferReceiptRequest',
      example: 'confirm-transfer.request',
    },
    success: { status: 204, description: 'Turnado confirmado y aviso registrado.' },
    errors: [...JSON_ERRORS, 'unauthorized', 'forbidden', 'not_found', 'conflict'],
  },
  {
    operationId: 'listEscalations',
    method: 'get',
    path: ROUTES.authorityEscalations,
    tag: 'Autoridad',
    summary: 'Denuncias escaladas',
    description:
      'Denuncias que una regla pública de escalamiento entregó a la autoridad supervisora de la cuenta, y las que tienen un aviso para supervisión (turnado vencido, `effect: alert`, sin sobre), sin contenido. Solo supervisión de la supervisora.',
    security: 'authorityBearer',
    parameters: [],
    success: {
      status: 200,
      description: 'Denuncias escaladas con sus reglas.',
      body: {
        kind: 'json',
        component: 'EscalationSummary',
        isArray: true,
        example: 'list-escalations.response',
      },
    },
    errors: ['unauthorized', 'forbidden'],
  },
  {
    operationId: 'deliverEscalationEnvelope',
    method: 'post',
    path: templated(ROUTES.authorityEscalationEnvelope, 'folio'),
    tag: 'Autoridad',
    summary: 'Recibir la segunda llave',
    description:
      'Entrega (sin cuerpo) el sobre de escalamiento que la persona cifró al enviar hacia la supervisora, solo si una regla de escalamiento se cumplió; antes responde `404`. Trae lo necesario para comprobar, después de abrirlo, que es el que se envió. Nunca trae la identidad. Cada entrega queda en el registro de seguridad.',
    security: 'authorityBearer',
    parameters: [FOLIO_PARAMETER],
    success: {
      status: 200,
      description: 'Sobre de escalamiento y datos para verificarlo.',
      body: {
        kind: 'json',
        component: 'EscalationDelivery',
        example: 'deliver-escalation-envelope.response',
      },
    },
    errors: ['unauthorized', 'forbidden', 'not_found'],
  },
  {
    operationId: 'getLedgerHead',
    method: 'get',
    path: ROUTES.ledgerHead,
    tag: 'Bitácora pública',
    summary: 'Cabeza firmada de la bitácora',
    description:
      'Último evento del último día publicado completo, firmado por el servidor. Se ancla fuera del sistema para detectar reescrituras.',
    security: 'none',
    parameters: [],
    success: {
      status: 200,
      description: 'Cabeza firmada.',
      body: { kind: 'json', component: 'SignedLedgerHead', example: 'get-ledger-head.response' },
    },
    errors: [],
  },
  {
    operationId: 'listLedgerEvents',
    method: 'get',
    path: ROUTES.ledgerEvents,
    tag: 'Bitácora pública',
    summary: 'Eventos de la bitácora',
    description:
      'Página de eventos desde `from` (secuencia) o desde `since` (día; la página empieza en el último evento anterior a ese día). `from` y `since` no se combinan.',
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
        name: 'since',
        in: 'query',
        required: false,
        description: 'Día inicial (AAAA-MM-DD); no se combina con `from`.',
        schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      },
      {
        name: 'limit',
        in: 'query',
        required: false,
        description: 'Tamaño de página: 100 por omisión y 500 como máximo.',
        schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 },
      },
    ],
    success: {
      status: 200,
      description: 'Página de eventos y cabeza firmada.',
      body: { kind: 'json', component: 'LedgerPage', example: 'list-ledger-events.response' },
    },
    errors: ['bad_request'],
  },
  {
    operationId: 'downloadOpenData',
    method: 'get',
    path: ROUTES.openDataCsv,
    tag: 'Datos abiertos',
    summary: 'Conteos agregados en CSV',
    description:
      'Denuncias por entidad, conducta, mes de recepción y estatus, solo de meses cerrados. Cada conteo se redondea al azar a un múltiplo de 5 y lo menor que 5 se suprime y se suma en la fila `suprimidas`.',
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
          'entidad,conducta,mes_recepcion,estatus,denuncias\n22,LGRA-52,2026-09,investigating,10\nsuprimidas,,,,5\n',
      },
    },
    errors: [],
  },
  {
    operationId: 'submitRegistration',
    method: 'post',
    path: ROUTES.registrationRequests,
    tag: 'Alta de autoridades',
    summary: 'Solicitar el alta de una institución',
    description:
      'Recibe la institución, su competencia, quien solicita con su nombramiento, las personas que tendrán cuenta y el candado (llaves públicas X25519 y Ed25519 con su `keyId`). Rechaza campos desconocidos, cualquier llave privada y un candado inconsistente. Responde el folio y la huella del candado, que la institución leerá por teléfono.',
    security: 'proofOfWork',
    parameters: [],
    requestBody: {
      kind: 'json',
      component: 'RegistrationRequest',
      example: 'submit-registration.request',
    },
    success: {
      status: 201,
      description: 'Solicitud recibida.',
      body: {
        kind: 'json',
        component: 'RegistrationReceipt',
        example: 'submit-registration.response',
      },
    },
    errors: [...JSON_ERRORS, 'proof_required'],
  },
  {
    operationId: 'listRegistrations',
    method: 'get',
    path: ROUTES.operationRegistrations,
    tag: 'Alta de autoridades',
    summary: 'Solicitudes de alta del nodo',
    description:
      'Solo para la cuenta de operación del nodo, que nunca ve denuncias. Incluye, para las aprobadas, la entrada propuesta del directorio.',
    security: 'authorityBearer',
    parameters: [],
    success: {
      status: 200,
      description: 'Solicitudes de la más reciente a la más antigua.',
      body: { kind: 'json', component: 'RegistrationList', example: 'list-registrations.response' },
    },
    errors: ['unauthorized', 'forbidden'],
  },
  {
    operationId: 'decideRegistration',
    method: 'post',
    path: templated(ROUTES.operationRegistrationDecision, 'requestId'),
    tag: 'Alta de autoridades',
    summary: 'Aprobar o rechazar una solicitud de alta',
    description:
      'Aprobar exige la huella que la institución leyó por teléfono; si no coincide con la del candado responde `409` y no cambia nada. Rechazar exige motivo. Una solicitud resuelta no se vuelve a resolver. Firmar el directorio y crear las cuentas son pasos aparte.',
    security: 'authorityBearer',
    parameters: [REGISTRATION_ID_PARAMETER],
    requestBody: {
      kind: 'json',
      component: 'RegistrationDecision',
      example: 'decide-registration.request',
    },
    success: {
      status: 200,
      description: 'Solicitud resuelta.',
      body: {
        kind: 'json',
        component: 'RegistrationView',
        example: 'decide-registration.response',
      },
    },
    errors: [...JSON_ERRORS, 'unauthorized', 'forbidden', 'not_found', 'conflict'],
  },
];

/** Cabecera de la prueba de trabajo, para el esquema de seguridad. */
export const STANDARD_POW_HEADER = POW_HEADER;
