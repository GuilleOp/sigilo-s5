// Operaciones tipadas de la API v1. Todas las rutas salen de `ROUTES`; ninguna se escribe a mano.
import {
  AuthorityProfileSchema,
  AuthoritySessionSchema,
  AuthoritySessionInfoSchema,
  ComplaintDetailSchema,
  EscalationDeliverySchema,
  EscalationSummarySchema,
  IdentityOpeningRequestViewSchema,
  ComplaintSummarySchema,
  DiscardEvidenceResponseSchema,
  EvidenceKeyGrantsResponseSchema,
  EvidenceUploadResponseSchema,
  LedgerPageSchema,
  MailboxMessageSchema,
  OpenIdentityResponseSchema,
  POW_HEADER,
  PowChallengeSchema,
  RegistrationListSchema,
  RegistrationReceiptSchema,
  RegistrationViewSchema,
  ProcedureStateSchema,
  PublicKeySetSchema,
  ROUTES,
  SignedLedgerHeadSchema,
  SubmitComplaintResponseSchema,
  TrackingViewSchema,
  TransferComplaintResponseSchema,
  AppealResponseSchema,
} from '@sigilo/contracts';
import type {
  AuthorityMessageRequest,
  AuthorityProfile,
  AuthoritySession,
  AuthoritySessionInfo,
  ComplaintDetail,
  EscalationDelivery,
  EscalationSummary,
  ComplaintSummary,
  DiscardEvidenceResponse,
  EvidenceDescriptor,
  EvidenceKeyGrantsRequest,
  EvidenceKeyGrantsResponse,
  IdentityOpeningRequestView,
  LedgerPage,
  MailboxMessage,
  OpenIdentityResponse,
  PowChallenge,
  PowPurpose,
  RegistrationDecision,
  RegistrationList,
  RegistrationReceipt,
  RegistrationRequest,
  RegistrationView,
  ProcedureActionRequest,
  ProcedureState,
  PublicKeySet,
  ReporterMessageRequest,
  SignedLedgerHead,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
  TrackingCredentials,
  TrackingView,
  TransferComplaintRequest,
  TransferComplaintResponse,
  TransferReceiptRequest,
  AppealRequest,
  AppealResponse,
} from '@sigilo/contracts';
import { announce } from '../lib/announce.ts';
import { usageModesStore } from '../state/usage-modes.ts';
import { createApiClient } from './api-client.ts';

/** Reintentos de las consultas con el modo de poca conexión. */
export const LOW_CONNECTION_RETRIES = 4;

/** Aviso de reintento para la persona (lo lee el anunciador global). */
function announceRetry(attempt: number, retries: number): void {
  announce(`La conexión falló. Lo intentamos de nuevo (${attempt} de ${retries}).`);
}
import type { ApiClient } from './api-client.ts';

const SummaryListSchema = ComplaintSummarySchema.array();
const AuthorityListSchema = AuthorityProfileSchema.array();
const EscalationListSchema = EscalationSummarySchema.array();

/** Denuncias por página en el listado de la autoridad. */
export const AUTHORITY_PAGE_SIZE = 100;

/** API de SIGILO sobre un cliente HTTP. */
export interface SigiloApi {
  getKeys(): Promise<PublicKeySet>;
  /** Reto de prueba de trabajo de un solo uso para `purpose`. */
  getPowChallenge(purpose: PowPurpose): Promise<PowChallenge>;
  /**
   * Sube una prueba limpia; `proof` es el valor de `POW_HEADER` del reto `complaint` de la
   * denuncia (el mismo sirve para sus pruebas y para el envío).
   */
  uploadEvidence(
    image: Blob,
    mediaType: 'image/jpeg' | 'image/png',
    proof: string,
  ): Promise<EvidenceDescriptor>;
  /**
   * Envía la denuncia; `proof` es el valor de `POW_HEADER` de un reto `complaint` y `folio`, el que
   * eligió el navegador (las pruebas se cifran con el folio en el AAD antes de enviarla).
   */
  submitComplaint(
    request: SubmitComplaintRequest,
    proof: string,
    folio?: string,
  ): Promise<SubmitComplaintResponse>;
  track(credentials: TrackingCredentials): Promise<TrackingView>;
  /** Envía la respuesta; `proof` es el valor de `POW_HEADER` de un reto `message`. */
  sendReporterMessage(request: ReporterMessageRequest, proof: string): Promise<MailboxMessage>;
  /** Inconformidad contra la calificación de no grave; `proof` es de un reto `message`. */
  fileAppeal(request: AppealRequest, proof: string): Promise<AppealResponse>;
  /** Solicitud de alta de una institución; `proof` es de un reto `registration`. */
  submitRegistration(request: RegistrationRequest, proof: string): Promise<RegistrationReceipt>;
  /** Solicitudes de alta del nodo (solo la cuenta de operación). */
  listRegistrations(token: string): Promise<RegistrationList>;
  /** Aprueba con la huella confirmada o rechaza con motivo una solicitud de alta. */
  decideRegistration(
    token: string,
    requestId: string,
    decision: RegistrationDecision,
  ): Promise<RegistrationView>;
  /** Inicio de sesión con la cuenta individual de la autoridad. */
  login(username: string, password: string): Promise<AuthoritySession>;
  /**
   * Datos de la sesión vigente. Es la petición autenticada más ligera: renueva la sesión por
   * inactividad («Seguir conectada»).
   */
  getSession(token: string): Promise<AuthoritySessionInfo>;
  /** Cierra la sesión en el servidor. */
  logout(token: string): Promise<void>;
  /** Autoridades del nodo, para turnar y reasignar. */
  listAuthorities(token: string): Promise<AuthorityProfile[]>;
  /** Página del listado de la autoridad (`offset` desde 0, `limit` hasta 500). */
  listComplaints(token: string, offset?: number, limit?: number): Promise<ComplaintSummary[]>;
  getComplaint(token: string, folio: string): Promise<ComplaintDetail>;
  /** Acción del trámite: turnar, aceptar, reasignar, devolver, avanzar etapa o cerrar. */
  applyProcedure(
    token: string,
    folio: string,
    request: ProcedureActionRequest,
  ): Promise<ProcedureState>;
  /** Solicitud de apertura de la identidad (primera aprobación). */
  requestIdentityOpening(
    token: string,
    folio: string,
    legalBasis: string,
  ): Promise<IdentityOpeningRequestView>;
  /** Aprobación de otra persona a una solicitud de apertura. */
  approveIdentityOpening(
    token: string,
    folio: string,
    requestId: string,
    legalBasis: string,
  ): Promise<IdentityOpeningRequestView>;
  /** Sobre de identidad de una solicitud aprobada, para quien la aprobó. */
  releaseIdentityEnvelope(
    token: string,
    folio: string,
    requestId: string,
  ): Promise<OpenIdentityResponse>;
  sendAuthorityMessage(
    token: string,
    folio: string,
    message: AuthorityMessageRequest,
  ): Promise<MailboxMessage>;
  /** Contenedor cifrado de una prueba; se abre en este navegador con la llave de la autoridad. */
  getEvidence(token: string, evidenceId: string): Promise<Blob>;
  /** Llaves de los archivos de prueba re-cifradas hacia otra autoridad del nodo. */
  grantEvidenceKeys(
    token: string,
    folio: string,
    request: EvidenceKeyGrantsRequest,
  ): Promise<EvidenceKeyGrantsResponse>;
  /** Descarta los archivos de las pruebas de la denuncia; queda en la bitácora y en el seguimiento. */
  discardEvidence(token: string, folio: string): Promise<DiscardEvidenceResponse>;
  /** Turnado a otro nodo con la denuncia ya re-cifrada en este navegador (SEC-19). */
  transferComplaint(
    token: string,
    folio: string,
    request: TransferComplaintRequest,
  ): Promise<TransferComplaintResponse>;
  /** Comprobante del nodo destino, para que la persona vea su folio nuevo. */
  confirmTransfer(token: string, folio: string, request: TransferReceiptRequest): Promise<void>;
  /** Denuncias escaladas a la supervisora de la sesión (solo cuentas de supervisión). */
  listEscalations(token: string): Promise<EscalationSummary[]>;
  /**
   * Sobre de escalamiento de una denuncia escalada (segunda llave). Cada entrega queda en el
   * registro de seguridad del nodo.
   */
  deliverEscalation(token: string, folio: string): Promise<EscalationDelivery>;
  getLedgerHead(): Promise<SignedLedgerHead>;
  getLedgerEvents(from: number, limit: number): Promise<LedgerPage>;
  /** Página desde el último evento anterior a `day` (`AAAA-MM-DD`), su vecino. */
  getLedgerSince(day: string, limit: number): Promise<LedgerPage>;
  getOpenDataCsv(): Promise<string>;
}

/** Crea la API sobre el cliente dado (por omisión, `fetch` del navegador). */
export function createSigiloApi(
  client: ApiClient = createApiClient(undefined, {
    onRetry: announceRetry,
    // H15: el modo de poca conexión hace lo que promete: más reintentos y más espera.
    retries: () => (usageModesStore.get().isLowConnection ? LOW_CONNECTION_RETRIES : 2),
    delayMs: (attempt) =>
      usageModesStore.get().isLowConnection ? attempt * 3000 : attempt === 1 ? 1000 : 3000,
  }),
): SigiloApi {
  return {
    getKeys: () => client.json(ROUTES.keys, PublicKeySetSchema),
    getPowChallenge: (purpose) =>
      client.json(ROUTES.powChallenge, PowChallengeSchema, { query: { purpose } }),
    uploadEvidence: (image, mediaType, proof) =>
      client.json(ROUTES.evidenceUpload, EvidenceUploadResponseSchema, {
        binary: image,
        contentType: mediaType,
        headers: { [POW_HEADER]: proof },
      }),
    submitComplaint: (request, proof, folio) =>
      client.json(ROUTES.complaints, SubmitComplaintResponseSchema, {
        json: request,
        headers: { [POW_HEADER]: proof },
        ...(folio === undefined ? {} : { query: { folio } }),
      }),
    track: (credentials) => client.json(ROUTES.tracking, TrackingViewSchema, { json: credentials }),
    sendReporterMessage: (request, proof) =>
      client.json(ROUTES.trackingMessages, MailboxMessageSchema, {
        json: request,
        headers: { [POW_HEADER]: proof },
      }),
    fileAppeal: (request, proof) =>
      client.json(ROUTES.trackingAppeal, AppealResponseSchema, {
        json: request,
        headers: { [POW_HEADER]: proof },
      }),
    submitRegistration: (request, proof) =>
      client.json(ROUTES.registrationRequests, RegistrationReceiptSchema, {
        json: request,
        headers: { [POW_HEADER]: proof },
      }),
    listRegistrations: (token) =>
      client.json(ROUTES.operationRegistrations, RegistrationListSchema, { bearer: token }),
    decideRegistration: (token, requestId, decision) =>
      client.json(ROUTES.operationRegistrationDecision(requestId), RegistrationViewSchema, {
        bearer: token,
        json: decision,
      }),
    login: (username, password) =>
      client.json(ROUTES.authLogin, AuthoritySessionSchema, { json: { username, password } }),
    getSession: (token) =>
      client.json(ROUTES.authSession, AuthoritySessionInfoSchema, { bearer: token }),
    logout: async (token) => {
      await client.text(ROUTES.authLogout, { bearer: token, method: 'POST' });
    },
    listAuthorities: (token) =>
      client.json(ROUTES.authorityAuthorities, AuthorityListSchema, { bearer: token }),
    listComplaints: (token, offset = 0, limit = AUTHORITY_PAGE_SIZE) =>
      client.json(ROUTES.authorityComplaints, SummaryListSchema, {
        bearer: token,
        query: { offset: String(offset), limit: String(limit) },
      }),
    getComplaint: (token, folio) =>
      client.json(ROUTES.authorityComplaint(folio), ComplaintDetailSchema, { bearer: token }),
    applyProcedure: (token, folio, request) =>
      client.json(ROUTES.authorityProcedure(folio), ProcedureStateSchema, {
        bearer: token,
        json: request,
      }),
    requestIdentityOpening: (token, folio, legalBasis) =>
      client.json(ROUTES.authorityIdentityRequests(folio), IdentityOpeningRequestViewSchema, {
        bearer: token,
        json: { legalBasis },
      }),
    approveIdentityOpening: (token, folio, requestId, legalBasis) =>
      client.json(
        ROUTES.authorityIdentityApprovals(folio, requestId),
        IdentityOpeningRequestViewSchema,
        { bearer: token, json: { legalBasis } },
      ),
    releaseIdentityEnvelope: (token, folio, requestId) =>
      client.json(ROUTES.authorityIdentityEnvelope(folio, requestId), OpenIdentityResponseSchema, {
        bearer: token,
        method: 'POST',
      }),
    sendAuthorityMessage: (token, folio, message) =>
      client.json(ROUTES.authorityMessages(folio), MailboxMessageSchema, {
        bearer: token,
        json: message,
      }),
    getEvidence: (token, evidenceId) =>
      client.blob(ROUTES.authorityEvidence(evidenceId), { bearer: token }),
    grantEvidenceKeys: (token, folio, request) =>
      client.json(ROUTES.authorityEvidenceKeys(folio), EvidenceKeyGrantsResponseSchema, {
        bearer: token,
        json: request,
      }),
    discardEvidence: (token, folio) =>
      client.json(ROUTES.authorityEvidenceDiscard(folio), DiscardEvidenceResponseSchema, {
        bearer: token,
        method: 'POST',
      }),
    transferComplaint: (token, folio, request) =>
      client.json(ROUTES.authorityTransfer(folio), TransferComplaintResponseSchema, {
        bearer: token,
        json: request,
      }),
    confirmTransfer: async (token, folio, request) => {
      await client.text(ROUTES.authorityTransferReceipt(folio), { bearer: token, json: request });
    },
    listEscalations: (token) =>
      client.json(ROUTES.authorityEscalations, EscalationListSchema, { bearer: token }),
    deliverEscalation: (token, folio) =>
      client.json(ROUTES.authorityEscalationEnvelope(folio), EscalationDeliverySchema, {
        bearer: token,
        method: 'POST',
      }),
    getLedgerHead: () => client.json(ROUTES.ledgerHead, SignedLedgerHeadSchema),
    getLedgerEvents: (from, limit) =>
      client.json(ROUTES.ledgerEvents, LedgerPageSchema, {
        query: { from: String(from), limit: String(limit) },
      }),
    getLedgerSince: (day, limit) =>
      client.json(ROUTES.ledgerEvents, LedgerPageSchema, {
        query: { since: day, limit: String(limit) },
      }),
    getOpenDataCsv: () => client.text(ROUTES.openDataCsv),
  };
}

/** Instancia por omisión para la aplicación. */
export const api: SigiloApi = createSigiloApi();
