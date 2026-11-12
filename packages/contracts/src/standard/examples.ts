// Ejemplos sintéticos de cada cuerpo de petición y respuesta del Estándar S5. Cumplen los esquemas
// pero no son criptográficamente válidos: firmas, sobres y digestos son valores de relleno.
import type {
  AppealRequest,
  AppealResponse,
  ApproveIdentityRequest,
  AuditSummary,
  ImportClosuresRequest,
  ImportClosuresResponse,
  TransferComplaintRequest,
  TransferComplaintResponse,
  TransferReceiptRequest,
  AuthorityAccountView,
  AuthorityMessageRequest,
  AuthorityProfile,
  AuthoritySession,
  AuthoritySessionInfo,
  ClosureRecord,
  ComplaintDetail,
  EscalationDelivery,
  EscalationSummary,
  IdentityOpeningRequestView,
  LoginRequest,
  ProcedureActionRequest,
  ProcedureState,
  ProcedureView,
  ComplaintSummary,
  DiscardEvidenceResponse,
  EvidenceDescriptor,
  HpkeEnvelope,
  IdentityBlock,
  LedgerEvent,
  LedgerPage,
  MailboxMessage,
  OpenIdentityRequest,
  OpenIdentityResponse,
  PowChallenge,
  PublicKeySet,
  ReporterMessageRequest,
  SignedLedgerHead,
  SignedReceipt,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
  TrackingCredentials,
  TrackingView,
  RegistrationRequest,
  RegistrationView,
} from '../index.ts';
import type { ApiError } from '../errors.ts';
import { HPKE_SUITE_V1 } from '../envelope.ts';

const FOLIO = 'K7Q2-M9XP-4RTD';
const AUTHORITY_KEY_ID = 'f7bc219ff223a248';
const SERVER_KEY_ID = 'c64189c912bb3ce1';
const SIGNATURE =
  '7XdDyy1y5I9NAnkJ3hfkF7WFG8Z-o-EFmjpe-32pN3oxmSg9vQ-yk29HmYt-zMLCE7ZjhW8EgUD3kdP-FtonOg';

function envelope(enc: string): HpkeEnvelope {
  return {
    v: 1,
    suite: HPKE_SUITE_V1,
    keyId: AUTHORITY_KEY_ID,
    enc,
    ct: 'StRzfWnAHU44irFcJi8Ovk2WchAogkFPTBaHqnM5Nr9BWGZk_sDbsz069mq6-8fAXMCKRxSTTNpoqQO9uuK4OPw1vvJ1TjyUFrjYzPjclJ0TaijqeyK5AOGlUB0iLJiatCZI4ds_k7PJdQime6RP4AmC3nEvo2Aoy8KfxbXQu-g',
  };
}

const publicKeySet: PublicKeySet = {
  server: { keyId: SERVER_KEY_ID, signingPublicKey: 'koU17lKEjuOFp0wedjlrUX_6_zjY4J6NAqum-6bZbV4' },
  authority: {
    keyId: AUTHORITY_KEY_ID,
    boxPublicKey: '59DzqAXh0GayVcyOxLXOPdmS40vlacHXPTju6YOEksA',
    signingPublicKey: 'LwOm2CURiB03_1by-45eeVVwt3X8LbWBghACfl8oU-I',
  },
};

const powChallenge: PowChallenge = {
  token: 'tpHur4SEBFgkV0Qx7zs7yaRNuCt0gk6E.uAXrUKi4UunPlnHDlkK-3uZkD6JBeKuENnTwWJiCIgs',
  bits: 18,
};

const evidence: EvidenceDescriptor = {
  evidenceId: '16ed88d6f3ea7c6c4841645c43cd2c79',
  mediaType: 'image/jpeg',
  sha256: '2fba3e8225db3948a2560e78ff0f3c161472b03d83f6505ee3b124ecc19405ed',
  sizeBytes: 482113,
};

const reporterKeys = {
  boxPublicKey: 'PCLP94gM6QhqKrW5rUxRyOkjYp_c20X88FzkKeeBPeE',
  signingPublicKey: '5C-TWh-HnoKNmmiGagV86aRffsRIHL0GRv7TbrS-CBU',
};

const facts = {
  stateCode: '22',
  municipalityCode: '014',
  entityId: 'VE-OBRAS',
  offenseCode: 'LGRA-52',
  occurredPeriod: '2026-09',
  accused: 'Servidor Ficticio Dos, jefe de licencias de la Secretaría de Obras de Villa Ejemplo',
  description:
    'Para agilizar un permiso de construcción pidieron un pago en efectivo fuera de la ventanilla. El pago no tenía recibo.',
};

const authVerifier = '6H9gCXCtBR7tRa2GGz5vvMxJ5x3oaqb0mNjkfPnUav0';

const submitComplaintRequest: SubmitComplaintRequest = {
  version: 1,
  mode: 'sealed',
  facts,
  evidence: [evidence],
  sealedIdentity: envelope('fsOie5ivq9VBIaT8pAwSTHn5gXsdDbKhlGG6xR-D0mc'),
  protectionRequested: true,
  reporterKeys,
  authVerifier,
};

const receipt: SignedReceipt = {
  folio: FOLIO,
  submissionDigest: 'ccaf46406392ac527c992cdb4592f757519c398359ddd0ae89474357e96be6f2',
  receivedOn: '2026-11-05',
  payloadDigest: '06070e6e2bc7be88a3beecfb1b7ec80e2ee8d8fae2ae612e28e1c6347dc3d797',
  serverKeyId: SERVER_KEY_ID,
  signature: SIGNATURE,
};

const submitComplaintResponse: SubmitComplaintResponse = { folio: FOLIO, receipt };

const trackingCredentials: TrackingCredentials = {
  folio: FOLIO,
  authKey: 'J7zOVnJBT-PcVC-8lC-Uhe4QXFBo6KH8gBhwggzir9Y',
};

const authorityMessage: MailboxMessage = {
  messageId: 'f5be9aeda0aeee53fc6931ef3a7a7d99',
  from: 'authority',
  sequence: 0,
  sentOn: '2026-11-09T17:00Z',
  envelope: envelope('HqeQ13nw2-w2vRlVp7ccmEQsI9CmpwCJnrSSV6FVt0E'),
  signature: SIGNATURE,
};

const reporterMessage: MailboxMessage = {
  messageId: '786d36e4b9d5bf4415896de8add7334d',
  from: 'reporter',
  sequence: 0,
  sentOn: '2026-11-10T02:00Z',
  envelope: envelope('VR2RaKqXnAoOBwAnmH1PIPvsg6mOC-SpPlUvZxx3kuM'),
  signature: SIGNATURE,
};

const receivedEvent: LedgerEvent = {
  seq: 41,
  type: 'complaint.received',
  folioDigest: '1cadc826d104014d2ed7b5bb2fef5c22b8d940aeaa2f14d9f65fec049aa9e292',
  at: '2026-11-05',
  actorRole: 'system',
  payloadDigest: receipt.payloadDigest,
  prevHash: 'b7936c8777a5a5368179decf6377c150b30784676a633ff2229174d2852111b2',
  hash: 'cb37babe6ca52df9e33e426166e0ab21696e6fb2a7c51cdc2a49bbd103b69e8c',
};

const openingEvent: LedgerEvent = {
  seq: 42,
  type: 'identity.opened',
  folioDigest: receivedEvent.folioDigest,
  at: '2026-11-12',
  actorRole: 'authority',
  payloadDigest: '1c7384ae5d390020a47bd3cc14875e4575ff2d1d78cbb5dce6c038c92c9ef935',
  receiptTag: 'a2ac084c5fcf7fee50433c408248020dd7f0908de5beff4d22867d68bab0ed82',
  prevHash: receivedEvent.hash,
  hash: '55facaf606de06709ae5317fc22d0986f8c9d64723817cf39865a38c6561d4ed',
};

const legalBasis =
  'LGRA art. 91: se requiere la identidad para ofrecerla como testigo en el procedimiento del expediente sintético.';

const ACCOUNT_ID = 'acct-5f0c2a9d1e7b3c44';
const SECOND_ACCOUNT_ID = 'acct-9b21e07c4d6a8f13';
const AUTHORITY_ID = 'authority.oic-iffe';
const OPENING_ID = '345568f4c2d3291f6b1aa0d66a134f8e';

const agreement =
  'Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas se concluye la investigación del expediente sintético OIC-PRUEBA-0001: se requirió información a la unidad compradora y se comprobó la entrega completa de los bienes.';

const procedureView: ProcedureView = {
  managementState: 'accepted',
  managementStateName: 'Aceptada',
  explanation:
    'La institución revisó tu denuncia y aceptó que le corresponde atenderla. Desde aquí empieza la investigación y corren los plazos legales.',
  legalStage: 'investigation',
  legalStageName: 'Investigación',
  steps: [
    {
      on: '2026-11-05',
      legalOn: '2026-11-05',
      action: 'received',
      managementState: 'received_in_inbox',
      title: 'Recibida',
      explanation:
        'Tu denuncia llegó al buzón general del sistema. Ahí se revisa para saber qué institución debe atenderla. Todavía nadie la investiga.',
    },
    {
      on: '2026-11-06',
      legalOn: '2026-11-06',
      action: 'routed',
      managementState: 'routed',
      title: 'Turnada a Órgano Interno de Control Ficticio',
      explanation:
        'Turnar significa enviar tu denuncia a la institución que puede investigarla. Esa institución todavía tiene que aceptarla.',
    },
    {
      on: '2026-11-09',
      legalOn: '2026-11-09',
      action: 'stage_advanced',
      managementState: 'accepted',
      legalStage: 'investigation',
      title: 'Etapa: Investigación',
      explanation: 'La autoridad investigadora reúne información y pruebas.',
      note: 'Se pidió información a la unidad compradora ficticia.',
    },
  ],
  deadlines: [
    {
      key: 'prescription_serious',
      name: 'Prescripción de faltas graves',
      explanation:
        'La facultad para sancionar una falta grave o una falta de particulares prescribe en 7 años.',
      startsOn: '2026-09-01',
      dueOn: '2033-09-01',
      status: 'running',
      remaining: 2492,
      remainingUnit: 'natural_days',
      legalBasis: ['Ley General de Responsabilidades Administrativas, art. 74'],
    },
  ],
  rules: [],
};

const sessionAccount: AuthorityAccountView = {
  accountId: ACCOUNT_ID,
  authorityId: AUTHORITY_ID,
  functions: ['intake', 'investigation'],
};

const authorityProfile: AuthorityProfile = {
  authorityId: AUTHORITY_ID,
  name: 'Órgano Interno de Control Ficticio',
  supervisorId: 'authority.oversight-federal',
  isInbox: false,
};

const loginRequest: LoginRequest = {
  username: 'oic-equipamiento.persona1',
  password: 'contraseña-sintética-de-ejemplo',
};

const authoritySession: AuthoritySession = {
  token: 'Yk3m9Q0bVZ2r7f8Lw1xT5cN4pH6aJdS0uEoRiGkMnBq',
  idleTimeoutSeconds: 900,
  absoluteTimeoutSeconds: 28800,
  account: sessionAccount,
};

const sessionInfo: AuthoritySessionInfo = {
  account: sessionAccount,
  authority: authorityProfile,
  idleTimeoutSeconds: 900,
  absoluteTimeoutSeconds: 28800,
};

const procedureRequest: ProcedureActionRequest = {
  action: 'close',
  reason: 'attended',
  legalBasis: 'LGRA, art. 100: conclusión de la investigación con elementos.',
  agreement,
};

const procedureState: ProcedureState = {
  folio: FOLIO,
  status: 'resolved',
  managementState: 'closed',
  legalStage: 'investigation',
  closureReason: 'attended',
  assignedAuthorityId: AUTHORITY_ID,
};

const identityRequestView: IdentityOpeningRequestView = {
  requestId: OPENING_ID,
  requestedOn: '2026-11-12',
  legalBasis,
  status: 'approved',
  approvals: [
    { accountId: ACCOUNT_ID, on: '2026-11-12', legalBasis },
    {
      accountId: SECOND_ACCOUNT_ID,
      on: '2026-11-12',
      legalBasis:
        'Coincido: el testimonio es necesario en el expediente sintético (LGRA, art. 91).',
    },
  ],
  threshold: 2,
  expiresOn: '2026-11-19',
  purpose: 'authority',
};

const pendingRequestView: IdentityOpeningRequestView = {
  ...identityRequestView,
  status: 'pending',
  approvals: identityRequestView.approvals.slice(0, 1),
};

const approveIdentityRequest: ApproveIdentityRequest = {
  legalBasis: 'Coincido: el testimonio es necesario en el expediente sintético (LGRA, art. 91).',
};

const ruleView = {
  on: '2026-12-06',
  ruleKey: 'escalation.grave-stalled' as const,
  name: 'Falta grave sin iniciar el procedimiento a los 30 días',
  explanation:
    'Si la autoridad no inicia el procedimiento correspondiente ante una posible falta grave en 30 días naturales, pasa a la autoridad supervisora.',
  effect: 'escalate' as const,
  dueOn: '2026-12-05',
};

const escalationSummary: EscalationSummary = {
  folio: FOLIO,
  escalatedOn: '2026-12-06',
  fromAuthorityId: AUTHORITY_ID,
  rules: [ruleView],
};

const closureRecord: ClosureRecord = {
  folio: FOLIO,
  authorityId: AUTHORITY_ID,
  on: '2026-11-20',
  legalOn: '2026-11-20',
  reason: 'attended',
  legalBasis: 'LGRA, art. 100: conclusión de la investigación con elementos.',
  agreement,
  agreementDigest: '0f2b5c1e9a7d43b8a6e1c0d9f8b7a6e5d4c3b2a1908f7e6d5c4b3a2918f7e6d5',
  actorId: ACCOUNT_ID,
};

const sealedForNode: HpkeEnvelope = {
  v: 1,
  suite: HPKE_SUITE_V1,
  keyId: 'b2e64c0d9a3f1758',
  enc: 'fD2h8rS0q9Jw3kZb7nT1uYc6vX4mL5aEoP8gH2iR0sQ',
  ct: 'Ue7Q0yZb5lTnV2cXk9Wm3jR8hD1fA6oS4gP0qL7tE2iN5uB8wC3vY9xK6zM1rJ4h',
};

const transferRequest: TransferComplaintRequest = {
  toAuthorityId: 'authority.oic-iffe',
  relay: { v: 2, node: 'node.federal', sealed: sealedForNode },
  note: 'Los hechos son de un ente federal: la turnamos al Órgano Interno de Control competente.',
};

const transferResponse: TransferComplaintResponse = {
  relay: { v: 2, sealed: { ...sealedForNode, keyId: 'e07d9c3b5a1f2846' }, queued: null },
  transferId: '5b1e0c9d8a7f6e5d4c3b2a1908f7e6d5',
};

const transferReceipt: TransferReceiptRequest = {
  transferId: '5b1e0c9d8a7f6e5d4c3b2a1908f7e6d5',
  receipt: { ...receipt, folio: 'P3W8-H2NC-6FJV' },
  request: submitComplaintRequest,
};

const importClosuresRequest: ImportClosuresRequest = {
  acts: [
    {
      fileNumber: 'OIC-IFFE-INV-2026-014',
      issuedOn: '2026-10-02',
      reason: 'insufficient_information',
      agreement,
    },
  ],
};

const importClosuresResponse: ImportClosuresResponse = {
  imported: 1,
  skipped: 0,
  batchDigest: '8c1f3e5a7b9d2c4e6f8a0b1c3d5e7f9a2b4c6d8e0f1a3b5c7d9e2f4a6b8c0d1e',
};

const auditSummary: AuditSummary = [
  { authorityId: AUTHORITY_ID, ruleId: 'AUD-01', count: 3 },
  { authorityId: AUTHORITY_ID, ruleId: 'AUD-02', count: 1 },
];

const appealRequest: AppealRequest = {
  folio: FOLIO,
  authKey: 'Hn3wX0c4bq9Lr2kVt7yZp1mQ6sDf8gJa5uEo0iNc3wI',
  reasons:
    'La conducta es una contratación indebida, que la ley califica como falta grave; el acuerdo no explica por qué la califica como no grave.',
  revealIdentityForAppeal: true,
};

const appealResponse: AppealResponse = {
  filedOn: '2026-12-14',
  openingId: '9c2f4e6a8b0d1f3e5a7c9e1b3d5f7a9c',
  resolutionDueOn: '2027-01-27',
};

const trackingView: TrackingView = {
  folio: FOLIO,
  mode: 'sealed',
  status: 'investigating',
  timeline: [
    { status: 'received', on: '2026-11-05' },
    { status: 'routed', on: '2026-11-06' },
    { status: 'investigating', on: '2026-11-09' },
  ],
  identityAccess: [
    {
      on: '2026-11-12',
      actorRole: 'authority',
      legalBasis,
      openingId: OPENING_ID,
      approvalCount: 2,
    },
  ],
  evidenceDiscards: [],
  messages: [authorityMessage, reporterMessage],
  receipt,
  receivedEvent,
  procedure: procedureView,
};

const reporterMessageRequest: ReporterMessageRequest = {
  ...trackingCredentials,
  sequence: 1,
  envelope: envelope('VR2RaKqXnAoOBwAnmH1PIPvsg6mOC-SpPlUvZxx3kuM'),
  signature: SIGNATURE,
};

const summary: ComplaintSummary = {
  folio: FOLIO,
  mode: 'sealed',
  status: 'investigating',
  receivedOn: '2026-11-05',
  stateCode: '22',
  offenseCode: 'LGRA-52',
  protectionRequested: true,
  managementState: 'accepted',
  assignedAuthorityId: AUTHORITY_ID,
};

const anonymousSummary: ComplaintSummary = {
  folio: 'H3VN-8C2W-QZ5B',
  mode: 'anonymous',
  status: 'received',
  receivedOn: '2026-11-04',
  stateCode: '09',
  offenseCode: 'LGRA-54',
  protectionRequested: false,
};

/** Denuncia que cumplió un día hábil sin turnar: el semáforo la marca «por vencer». */
const inboxSummary: ComplaintSummary = {
  folio: 'K7PD-2M4X-RT9C',
  mode: 'sealed',
  status: 'received',
  receivedOn: '2026-11-04',
  stateCode: '22',
  offenseCode: 'LGRA-54',
  protectionRequested: false,
  managementState: 'received_in_inbox',
  assignedAuthorityId: 'authority.buzon-general',
  turnSemaphore: {
    waitingFor: 'routing',
    status: 'por_vencer',
    sinceOn: '2026-11-04',
    elapsedDays: 1,
    warningOn: '2026-11-05',
    overdueOn: '2026-11-06',
  },
};

const complaintDetail: ComplaintDetail = {
  summary,
  version: 1,
  facts,
  evidence: [evidence],
  reporterKeys,
  authVerifier,
  sealedIdentityDigest: '9015d201942088281d9f674cb0dac7e2180d135935478dd35b0a4289730abf35',
  receivedEventSeq: 41,
  storedEvidenceCount: 1,
  messages: [authorityMessage, reporterMessage],
  identityOpenedCount: 1,
  procedure: procedureView,
  identityRequests: [identityRequestView],
};

const openIdentityRequest: OpenIdentityRequest = { legalBasis };

const openIdentityResponse: OpenIdentityResponse = {
  sealedIdentity: envelope('fsOie5ivq9VBIaT8pAwSTHn5gXsdDbKhlGG6xR-D0mc'),
  openingId: OPENING_ID,
};

const escalationDelivery: EscalationDelivery = {
  folio: FOLIO,
  escalationEnvelope: {
    ...envelope('Q1b3x9dW0eR5tY7uI2oP4aS6dF8gH0jK1lZ3xC5vB7n'),
    keyId: 'a71c03d5e9f2b648',
  },
  authVerifier,
  reporterKeys,
  sealedIdentityDigest: '9015d201942088281d9f674cb0dac7e2180d135935478dd35b0a4289730abf35',
  receivedEventSeq: 41,
  rules: [ruleView],
};

const discardEvidenceResponse: DiscardEvidenceResponse = { discarded: 1 };

const authorityMessageRequest: AuthorityMessageRequest = {
  sequence: 1,
  envelope: envelope('HqeQ13nw2-w2vRlVp7ccmEQsI9CmpwCJnrSSV6FVt0E'),
  signature: SIGNATURE,
};

const ledgerHead: SignedLedgerHead = {
  seq: 42,
  hash: openingEvent.hash,
  at: '2026-11-12',
  serverKeyId: SERVER_KEY_ID,
  signature: SIGNATURE,
};

const ledgerPage: LedgerPage = { events: [receivedEvent, openingEvent], head: ledgerHead };

const identityBlock: IdentityBlock = {
  fullName: 'Persona Denunciante Uno',
  contact: 'nadie@example.org',
  witnesses: ['Persona Testigo Tres, ventanilla de licencias'],
  originalEvidenceSha256: ['772eb534f39e6363695c70f180aff6846e8b6a603c18d31a702104ce9a38429d'],
};

const apiError: ApiError = {
  error: { code: 'proof_required', message: 'Falta una prueba de trabajo válida y vigente.' },
};

const registrationRequest: RegistrationRequest = {
  institutionName: 'Secretaría de la Contraloría Ficticia de Oaxaca',
  stateCode: '20',
  governmentLevel: 'estatal',
  role: 'investigating',
  laws: ['LGRA'],
  supervisorId: null,
  applicant: {
    fullName: 'Persona Solicitante Ficticia',
    position: 'Titular del área de quejas, denuncias e investigación',
    appointment: 'Oficio SCF/001/2026 del 2 de enero de 2026',
  },
  people: [
    { fullName: 'Persona Ficticia Uno', functions: ['intake', 'investigation'] },
    { fullName: 'Persona Ficticia Dos', functions: ['substantiation'] },
  ],
  padlock: {
    keyId: 'f7bc219ff223a248',
    boxPublicKey: 'NiZznjyLNeraA7JAp19_XZP3tcTRLjBYKE30lDFWPDA',
    signingPublicKey: 'Q0aLh_n4f3OsAUbnPW7TArxa9GZSaFogin9tSn2xGcA',
  },
};

const registrationView: RegistrationView = {
  requestId: 'ALTA-3F2A9C01B7E4',
  receivedOn: '2026-11-09',
  status: 'approved',
  request: registrationRequest,
  decision: { on: '2026-11-10', accountId: ACCOUNT_ID, reason: null },
  directoryEntry: {
    id: 'authority.secretaria-de-la-contraloria-ficticia-de-oaxaca',
    name: registrationRequest.institutionName,
    nodeId: 'node.federal',
    governmentLevel: 'estatal',
    stateCode: '20',
    role: 'investigating',
    competence: {
      governmentLevels: ['estatal'],
      stateCodes: ['20'],
      entityIds: [],
      laws: ['LGRA'],
    },
    keyId: registrationRequest.padlock.keyId,
    boxPublicKey: registrationRequest.padlock.boxPublicKey,
    signingPublicKey: registrationRequest.padlock.signingPublicKey,
    supervisorId: null,
    validFrom: '2026-11-10',
    validUntil: null,
  },
};

/**
 * Ejemplo de cada cuerpo, por nombre de archivo en `estandar/ejemplos/` (sin `.json`). La prueba del
 * estándar valida cada uno con el esquema de su operación.
 */
export const STANDARD_EXAMPLES = {
  'submit-registration.request': registrationRequest,
  'submit-registration.response': {
    requestId: 'ALTA-3F2A9C01B7E4',
    fingerprint: '3f2a 9c01 b7e4 55d0',
  },
  'list-registrations.response': { nodeId: 'node.federal', registrations: [registrationView] },
  'decide-registration.request': { decision: 'approve', fingerprint: '3f2a 9c01 b7e4 55d0' },
  'decide-registration.response': registrationView,
  'get-public-keys.response': publicKeySet,
  'get-pow-challenge.response': powChallenge,
  'upload-evidence.response': evidence,
  'submit-complaint.request': submitComplaintRequest,
  'submit-complaint.response': submitComplaintResponse,
  'get-tracking.request': trackingCredentials,
  'get-tracking.response': trackingView,
  'file-appeal.request': appealRequest,
  'file-appeal.response': appealResponse,
  'send-reporter-message.request': reporterMessageRequest,
  'send-reporter-message.response': { ...reporterMessage, sequence: 1 },
  'list-authority-complaints.response': [inboxSummary, summary, anonymousSummary],
  'get-authority-complaint.response': complaintDetail,
  'login.request': loginRequest,
  'login.response': authoritySession,
  'get-session.response': sessionInfo,
  'list-authorities.response': [
    authorityProfile,
    {
      authorityId: 'authority.oversight-federal',
      name: 'Unidad Ficticia de Supervisión',
      isInbox: false,
    },
  ],
  'apply-procedure-action.request': procedureRequest,
  'apply-procedure-action.response': procedureState,
  'request-identity-opening.request': openIdentityRequest,
  'request-identity-opening.response': pendingRequestView,
  'approve-identity-opening.request': approveIdentityRequest,
  'approve-identity-opening.response': identityRequestView,
  'release-identity-envelope.response': openIdentityResponse,
  'list-closures.response': [closureRecord],
  'list-escalations.response': [escalationSummary],
  'import-closures.request': importClosuresRequest,
  'import-closures.response': importClosuresResponse,
  'get-audit-summary.response': auditSummary,
  'transfer-complaint.request': transferRequest,
  'transfer-complaint.response': transferResponse,
  'confirm-transfer.request': transferReceipt,
  'deliver-escalation-envelope.response': escalationDelivery,
  'send-authority-message.request': authorityMessageRequest,
  'send-authority-message.response': { ...authorityMessage, sequence: 1 },
  'discard-evidence.response': discardEvidenceResponse,
  'get-ledger-head.response': ledgerHead,
  'list-ledger-events.response': ledgerPage,
  'sealed-identity.content': identityBlock,
  error: apiError,
} as const;

export type StandardExampleName = keyof typeof STANDARD_EXAMPLES;
