// Operaciones tipadas de la API v1. Todas las rutas salen de `ROUTES`; ninguna se escribe a mano.
import {
  ComplaintDetailSchema,
  ComplaintSummarySchema,
  DiscardEvidenceResponseSchema,
  EvidenceUploadResponseSchema,
  LedgerPageSchema,
  MailboxMessageSchema,
  OpenIdentityResponseSchema,
  POW_HEADER,
  PowChallengeSchema,
  PublicKeySetSchema,
  ROUTES,
  SignedLedgerHeadSchema,
  SubmitComplaintResponseSchema,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type {
  AuthorityMessageRequest,
  ComplaintDetail,
  ComplaintStatus,
  ComplaintSummary,
  DiscardEvidenceResponse,
  EvidenceDescriptor,
  LedgerPage,
  MailboxMessage,
  OpenIdentityResponse,
  PowChallenge,
  PowPurpose,
  PublicKeySet,
  ReporterMessageRequest,
  SignedLedgerHead,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
  TrackingCredentials,
  TrackingView,
} from '@sigilo/contracts';
import { createApiClient } from './api-client.ts';
import type { ApiClient } from './api-client.ts';

const SummaryListSchema = ComplaintSummarySchema.array();

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
  /** Envía la denuncia; `proof` es el valor de `POW_HEADER` de un reto `complaint`. */
  submitComplaint(request: SubmitComplaintRequest, proof: string): Promise<SubmitComplaintResponse>;
  track(credentials: TrackingCredentials): Promise<TrackingView>;
  /** Envía la respuesta; `proof` es el valor de `POW_HEADER` de un reto `message`. */
  sendReporterMessage(request: ReporterMessageRequest, proof: string): Promise<MailboxMessage>;
  /** Página del listado de la autoridad (`offset` desde 0, `limit` hasta 500). */
  listComplaints(token: string, offset?: number, limit?: number): Promise<ComplaintSummary[]>;
  getComplaint(token: string, folio: string): Promise<ComplaintDetail>;
  openIdentity(token: string, folio: string, legalBasis: string): Promise<OpenIdentityResponse>;
  updateStatus(token: string, folio: string, status: ComplaintStatus): Promise<ComplaintSummary>;
  sendAuthorityMessage(
    token: string,
    folio: string,
    message: AuthorityMessageRequest,
  ): Promise<MailboxMessage>;
  getEvidence(token: string, evidenceId: string): Promise<Blob>;
  /** Descarta los archivos de las pruebas de la denuncia; queda en la bitácora y en el seguimiento. */
  discardEvidence(token: string, folio: string): Promise<DiscardEvidenceResponse>;
  getLedgerHead(): Promise<SignedLedgerHead>;
  getLedgerEvents(from: number, limit: number): Promise<LedgerPage>;
  /** Página desde el último evento anterior a `day` (`AAAA-MM-DD`), su vecino. */
  getLedgerSince(day: string, limit: number): Promise<LedgerPage>;
  getOpenDataCsv(): Promise<string>;
}

/** Crea la API sobre el cliente dado (por omisión, `fetch` del navegador). */
export function createSigiloApi(client: ApiClient = createApiClient()): SigiloApi {
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
    submitComplaint: (request, proof) =>
      client.json(ROUTES.complaints, SubmitComplaintResponseSchema, {
        json: request,
        headers: { [POW_HEADER]: proof },
      }),
    track: (credentials) => client.json(ROUTES.tracking, TrackingViewSchema, { json: credentials }),
    sendReporterMessage: (request, proof) =>
      client.json(ROUTES.trackingMessages, MailboxMessageSchema, {
        json: request,
        headers: { [POW_HEADER]: proof },
      }),
    listComplaints: (token, offset = 0, limit = AUTHORITY_PAGE_SIZE) =>
      client.json(ROUTES.authorityComplaints, SummaryListSchema, {
        bearer: token,
        query: { offset: String(offset), limit: String(limit) },
      }),
    getComplaint: (token, folio) =>
      client.json(ROUTES.authorityComplaint(folio), ComplaintDetailSchema, { bearer: token }),
    openIdentity: (token, folio, legalBasis) =>
      client.json(ROUTES.authorityIdentity(folio), OpenIdentityResponseSchema, {
        bearer: token,
        json: { legalBasis },
      }),
    updateStatus: (token, folio, status) =>
      client.json(ROUTES.authorityStatus(folio), ComplaintSummarySchema, {
        bearer: token,
        json: { status },
      }),
    sendAuthorityMessage: (token, folio, message) =>
      client.json(ROUTES.authorityMessages(folio), MailboxMessageSchema, {
        bearer: token,
        json: message,
      }),
    getEvidence: (token, evidenceId) =>
      client.blob(ROUTES.authorityEvidence(evidenceId), { bearer: token }),
    discardEvidence: (token, folio) =>
      client.json(ROUTES.authorityEvidenceDiscard(folio), DiscardEvidenceResponseSchema, {
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
