// Rutas de la API v1. Cliente y servidor importan estas constantes; no escribir rutas a mano.
export const API_PREFIX = '/api/v1';

export const ROUTES = {
  keys: `${API_PREFIX}/keys`,
  /** `GET ?purpose=complaint|evidence`: reto de prueba de trabajo de un solo uso. */
  powChallenge: `${API_PREFIX}/pow/challenge`,
  evidenceUpload: `${API_PREFIX}/evidence`,
  complaints: `${API_PREFIX}/complaints`,
  tracking: `${API_PREFIX}/tracking`,
  trackingMessages: `${API_PREFIX}/tracking/messages`,
  authorityComplaints: `${API_PREFIX}/authority/complaints`,
  authorityComplaint: (folio: string) => `${API_PREFIX}/authority/complaints/${folio}`,
  authorityIdentity: (folio: string) => `${API_PREFIX}/authority/complaints/${folio}/identity`,
  authorityStatus: (folio: string) => `${API_PREFIX}/authority/complaints/${folio}/status`,
  authorityMessages: (folio: string) => `${API_PREFIX}/authority/complaints/${folio}/messages`,
  authorityEvidence: (evidenceId: string) => `${API_PREFIX}/authority/evidence/${evidenceId}`,
  ledgerHead: `${API_PREFIX}/ledger/head`,
  ledgerEvents: `${API_PREFIX}/ledger/events`,
  openDataCsv: `${API_PREFIX}/open-data/complaints.csv`,
} as const;

/** Umbral de supresión de celdas pequeñas en datos abiertos (conteo real menor que este valor). */
export const OPEN_DATA_MIN_CELL = 5;

/** Los conteos publicados en datos abiertos se redondean al múltiplo más cercano de este valor. */
export const OPEN_DATA_ROUNDING = 5;
