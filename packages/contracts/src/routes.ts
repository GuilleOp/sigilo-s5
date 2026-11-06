// Rutas de la API v1. Cliente y servidor importan estas constantes; no escribir rutas a mano.
export const API_PREFIX = '/api/v1';

const COMPLAINT = (folio: string) => `${API_PREFIX}/authority/complaints/${folio}`;

export const ROUTES = {
  keys: `${API_PREFIX}/keys`,
  /** `GET ?purpose=complaint|message`: reto de prueba de trabajo (ver `PowPurposeSchema`). */
  powChallenge: `${API_PREFIX}/pow/challenge`,
  evidenceUpload: `${API_PREFIX}/evidence`,
  complaints: `${API_PREFIX}/complaints`,
  tracking: `${API_PREFIX}/tracking`,
  trackingMessages: `${API_PREFIX}/tracking/messages`,
  /** `POST`: inconformidad contra la calificación de no grave (LGRA, arts. 102 a 110). */
  trackingAppeal: `${API_PREFIX}/tracking/appeal`,
  /** `POST`: inicio de sesión con la cuenta individual; responde el token de sesión. */
  authLogin: `${API_PREFIX}/auth/login`,
  /** `POST`: invalida la sesión en el servidor. */
  authLogout: `${API_PREFIX}/auth/logout`,
  /** `GET`: cuenta y vencimientos de la sesión vigente. */
  authSession: `${API_PREFIX}/auth/session`,
  /** `GET`: autoridades alojadas en el nodo (para turnar y reasignar). */
  authorityAuthorities: `${API_PREFIX}/authority/authorities`,
  /** `GET ?offset=&limit=`: listado paginado (100 por omisión, 500 como máximo). */
  authorityComplaints: `${API_PREFIX}/authority/complaints`,
  authorityComplaint: COMPLAINT,
  /** `POST`: acción del trámite (turnar, aceptar, reasignar, devolver, avanzar etapa o cerrar). */
  authorityProcedure: (folio: string) => `${COMPLAINT(folio)}/procedure`,
  /** `POST`: solicita abrir la identidad sellada (primera aprobación). */
  authorityIdentityRequests: (folio: string) => `${COMPLAINT(folio)}/identity/requests`,
  /** `POST`: aprobación de otra persona a una solicitud de apertura. */
  authorityIdentityApprovals: (folio: string, requestId: string) =>
    `${COMPLAINT(folio)}/identity/requests/${requestId}/approvals`,
  /** `POST`: entrega el sobre de identidad a quien aprobó, si se alcanzó el umbral. */
  authorityIdentityEnvelope: (folio: string, requestId: string) =>
    `${COMPLAINT(folio)}/identity/requests/${requestId}/envelope`,
  authorityMessages: (folio: string) => `${COMPLAINT(folio)}/messages`,
  /** `POST`: turnado a otro nodo con la denuncia re-cifrada en el navegador (SEC-19). */
  authorityTransfer: (folio: string) => `${COMPLAINT(folio)}/transfer`,
  /** `POST`: comprobante del nodo destino de un turnado, para avisar a la persona. */
  authorityTransferReceipt: (folio: string) => `${COMPLAINT(folio)}/transfer/receipt`,
  /** `POST`: la autoridad descarta los archivos de las pruebas de la denuncia (queda en la bitácora). */
  authorityEvidenceDiscard: (folio: string) => `${COMPLAINT(folio)}/evidence/discard`,
  authorityEvidence: (evidenceId: string) => `${API_PREFIX}/authority/evidence/${evidenceId}`,
  /** `GET ?offset=&limit=`: acuerdos de cierre en versión pública, para el auditor. */
  authorityClosures: `${API_PREFIX}/authority/closures`,
  /** `POST`: importa acuerdos recibidos por otros medios (Bases de la PDN, art. 58). */
  authorityClosureImports: `${API_PREFIX}/authority/closures/imports`,
  /** `GET`: conteos agregados de las señales del auditor por autoridad y regla (observatorio). */
  authorityAuditSummary: `${API_PREFIX}/authority/audit/summary`,
  /** `GET`: denuncias escaladas a la autoridad supervisora de la sesión. */
  authorityEscalations: `${API_PREFIX}/authority/escalations`,
  /** `POST`: entrega el sobre de escalamiento (segunda llave) de una denuncia escalada. */
  authorityEscalationEnvelope: (folio: string) =>
    `${API_PREFIX}/authority/escalations/${folio}/envelope`,
  ledgerHead: `${API_PREFIX}/ledger/head`,
  /**
   * `GET ?from=<seq>&limit=` o `GET ?since=AAAA-MM-DD&limit=`: con `since`, la página empieza en
   * el último evento anterior a ese día (su vecino, que acota el tramo) o en el génesis.
   */
  ledgerEvents: `${API_PREFIX}/ledger/events`,
  openDataCsv: `${API_PREFIX}/open-data/complaints.csv`,
} as const;

/** Umbral de supresión de celdas pequeñas en datos abiertos (conteo real menor que este valor). */
export const OPEN_DATA_MIN_CELL = 5;

/** Los conteos publicados en datos abiertos se redondean al múltiplo más cercano de este valor. */
export const OPEN_DATA_ROUNDING = 5;
