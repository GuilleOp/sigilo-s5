// Repositorio de denuncias: hechos legibles, sobre de identidad, llaves y comprobante.
import type { DatabaseSync } from 'node:sqlite';
import {
  primaryOffenseCode,
  ClosureReasonSchema,
  ComplaintFactsSchema,
  ComplaintModeSchema,
  ComplaintStatusSchema,
  HpkeEnvelopeSchema,
  LegalStageSchema,
  ManagementStateSchema,
  SignedReceiptSchema,
} from '@sigilo/contracts';
import type {
  ClosureReason,
  ComplaintFacts,
  ComplaintMode,
  ComplaintStatus,
  ComplaintSummary,
  HpkeEnvelope,
  LegalStage,
  ManagementState,
  ReporterKeys,
  SignedReceipt,
} from '@sigilo/contracts';
import { readInteger, readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/**
 * Denuncia tal como se almacena. `facts` son los hechos tal como se enviaron (forman parte del
 * contexto de la identidad y del digesto del envío); la columna de conducta guarda la clave
 * principal, que es la que usan el listado y los datos abiertos.
 */
export interface ComplaintRecord {
  folio: string;
  mode: ComplaintMode;
  status: ComplaintStatus;
  receivedOn: string;
  facts: ComplaintFacts;
  protectionRequested: boolean;
  sealedIdentity: HpkeEnvelope | null;
  reporterKeys: ReporterKeys;
  authVerifier: string;
  receipt: SignedReceipt;
  /** Día legal de recepción (hora del centro de México), con el que corren los plazos. */
  receivedLegalOn: string;
  /** Autoridad que tiene la denuncia; `null` en denuncias anteriores, que están en el buzón. */
  assignedAuthorityId: string | null;
  managementState: ManagementState;
  legalStage: LegalStage | null;
  closureReason: ClosureReason | null;
  /** Segunda llave: sobre de escalamiento hacia la supervisora, si la persona lo envió. */
  escalationEnvelope: HpkeEnvelope | null;
  /** Digesto de la corroboración ciega, si la persona la pidió (la etiqueta no se guarda aquí). */
  corroborationDigest: string | null;
}

/** Estado del trámite que cambia con cada acción de la autoridad. */
export interface ProcedureFields {
  status: ComplaintStatus;
  assignedAuthorityId: string;
  managementState: ManagementState;
  legalStage: LegalStage | null;
  closureReason: ClosureReason | null;
}

/** Celda agregada para datos abiertos. */
export interface OpenDataCell {
  stateCode: string;
  offenseCode: string;
  month: string;
  status: ComplaintStatus;
  count: number;
}

/** Resumen del listado con el día en que la denuncia entró a su estado de gestión actual. */
export interface ListedComplaint {
  summary: ComplaintSummary;
  /**
   * Día legal del último paso que dejó la denuncia en el buzón, turnada o reasignada (recepción,
   * turno, reasignación o devolución); el día legal de recepción si no hay pasos.
   */
  stateSinceOn: string;
}

/** Operaciones sobre la tabla `complaints`. */
export interface ComplaintsRepository {
  exists(folio: string): boolean;
  /** Indica si algún recibo ya usa este verificador. */
  hasAuthVerifier(authVerifier: string): boolean;
  /**
   * Solo el `authVerifier` del folio, o `null` si no existe.
   * Seguridad: es una consulta ligera para que el tiempo de un intento fallido no dependa de
   * cargar y validar el registro completo.
   */
  findAuthVerifier(folio: string): string | null;
  insert(record: ComplaintRecord): void;
  find(folio: string): ComplaintRecord | null;
  /** Resúmenes de los más recientes a los más antiguos, desde `offset`, a lo más `limit`. */
  listSummaries(offset: number, limit: number): ComplaintSummary[];
  /**
   * Resúmenes de las denuncias que tiene `authorityId` (las de autoridad `null` cuentan como del
   * buzón general `inboxAuthorityId`), de las más recientes a las más antiguas.
   */
  listSummariesForAuthority(
    authorityId: string,
    inboxAuthorityId: string,
    offset: number,
    limit: number,
  ): ComplaintSummary[];
  /** Como `listSummariesForAuthority`, con el día de entrada al estado (semáforo de turnado). */
  listForAuthority(
    authorityId: string,
    inboxAuthorityId: string,
    offset: number,
    limit: number,
  ): ListedComplaint[];
  updateStatus(folio: string, status: ComplaintStatus): void;
  /** Guarda el estado del trámite después de una acción. */
  updateProcedure(folio: string, fields: ProcedureFields): void;
  /**
   * Folios que todavía pueden cumplir una regla pública: los no cerrados y los archivados por
   * información insuficiente.
   */
  listFoliosForRules(): string[];
  /** Conteos por celda del mes de recepción `month` (`AAAA-MM`), con la clave principal. */
  countCellsOfMonth(month: string): OpenDataCell[];
  /**
   * Meses de recepción (`AAAA-MM`) anteriores a `beforeMonth` que tienen denuncias, en orden.
   * Usa el índice del mes saltando de un mes al siguiente: no recorre las denuncias.
   */
  listMonthsBefore(beforeMonth: string): string[];
}

const SUMMARY_COLUMNS =
  'folio, mode, status, received_on, state_code, offense_code, protection_requested, management_state, assigned_authority';

function toSummary(row: Row): ComplaintSummary {
  return {
    folio: readText(row, 'folio'),
    mode: ComplaintModeSchema.parse(readText(row, 'mode')),
    status: ComplaintStatusSchema.parse(readText(row, 'status')),
    receivedOn: readText(row, 'received_on'),
    stateCode: readText(row, 'state_code'),
    offenseCode: readText(row, 'offense_code'),
    protectionRequested: readInteger(row, 'protection_requested') === 1,
  };
}

function toListedSummary(row: Row, inboxAuthorityId: string): ComplaintSummary {
  return {
    ...toSummary(row),
    managementState: ManagementStateSchema.parse(readText(row, 'management_state')),
    assignedAuthorityId: readOptionalText(row, 'assigned_authority') ?? inboxAuthorityId,
  };
}

function toRecord(row: Row): ComplaintRecord {
  const summary = toSummary(row);
  const sealed = readOptionalText(row, 'sealed_identity_json');
  return {
    folio: summary.folio,
    mode: summary.mode,
    status: summary.status,
    receivedOn: summary.receivedOn,
    protectionRequested: summary.protectionRequested,
    facts: ComplaintFactsSchema.parse(JSON.parse(readText(row, 'facts_json'))),
    sealedIdentity: sealed === null ? null : HpkeEnvelopeSchema.parse(JSON.parse(sealed)),
    reporterKeys: {
      boxPublicKey: readText(row, 'reporter_box_public_key'),
      signingPublicKey: readText(row, 'reporter_signing_public_key'),
    },
    authVerifier: readText(row, 'auth_verifier'),
    receipt: SignedReceiptSchema.parse(JSON.parse(readText(row, 'receipt_json'))),
    receivedLegalOn: readOptionalText(row, 'received_legal_on') ?? summary.receivedOn,
    assignedAuthorityId: readOptionalText(row, 'assigned_authority'),
    managementState: ManagementStateSchema.parse(readText(row, 'management_state')),
    legalStage: parseOptional(readOptionalText(row, 'legal_stage'), LegalStageSchema.parse),
    closureReason: parseOptional(
      readOptionalText(row, 'closure_reason'),
      ClosureReasonSchema.parse,
    ),
    escalationEnvelope: parseOptional(readOptionalText(row, 'escalation_envelope_json'), (text) =>
      HpkeEnvelopeSchema.parse(JSON.parse(text)),
    ),
    corroborationDigest: readOptionalText(row, 'corroboration_digest'),
  };
}

function parseOptional<T>(value: string | null, parse: (text: string) => T): T | null {
  return value === null ? null : parse(value);
}

function toCell(row: Row): OpenDataCell {
  return {
    stateCode: readText(row, 'state_code'),
    offenseCode: readText(row, 'offense_code'),
    month: readText(row, 'month'),
    status: ComplaintStatusSchema.parse(readText(row, 'status')),
    count: readInteger(row, 'total'),
  };
}

/** Crea el repositorio de denuncias sobre `db`. */
export function createComplaintsRepository(db: DatabaseSync): ComplaintsRepository {
  const existsStatement = db.prepare('SELECT 1 AS found FROM complaints WHERE folio = ?');
  const verifierExistsStatement = db.prepare(
    'SELECT 1 AS found FROM complaints WHERE auth_verifier = ?',
  );
  const verifierStatement = db.prepare('SELECT auth_verifier FROM complaints WHERE folio = ?');
  const insertStatement = db.prepare(
    `INSERT INTO complaints (folio, mode, status, received_on, state_code, offense_code,
       protection_requested, facts_json, sealed_identity_json, reporter_box_public_key,
       reporter_signing_public_key, auth_verifier, receipt_json, received_legal_on,
       assigned_authority, management_state, legal_stage, closure_reason, escalation_envelope_json,
       corroboration_digest)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const findStatement = db.prepare('SELECT * FROM complaints WHERE folio = ?');
  // Dentro del mismo día se ordena por folio (aleatorio) para no revelar el orden de llegada.
  const listStatement = db.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM complaints ORDER BY received_on DESC, folio LIMIT ? OFFSET ?`,
  );
  // Dentro del mismo día se ordena por folio (aleatorio) para no revelar el orden de llegada.
  const listForAuthorityStatement = db.prepare(
    `SELECT ${SUMMARY_COLUMNS},
       COALESCE(
         (SELECT legal_on FROM procedure_steps AS step
          WHERE step.folio = complaints.folio
            AND step.action IN ('received', 'routed', 'reassigned', 'returned_to_inbox')
          ORDER BY step.position DESC LIMIT 1),
         received_legal_on, received_on) AS state_since_on
     FROM complaints
     WHERE COALESCE(assigned_authority, ?) = ?
     ORDER BY received_on DESC, folio LIMIT ? OFFSET ?`,
  );
  const updateStatusStatement = db.prepare('UPDATE complaints SET status = ? WHERE folio = ?');
  const updateProcedureStatement = db.prepare(
    `UPDATE complaints SET status = ?, assigned_authority = ?, management_state = ?,
       legal_stage = ?, closure_reason = ?
     WHERE folio = ?`,
  );
  const rulesStatement = db.prepare(
    `SELECT folio FROM complaints
     WHERE management_state <> 'closed'
       OR closure_reason IN ('insufficient_information', 'channeled', 'inadmissible', 'joined')
     ORDER BY folio`,
  );
  const cellsStatement = db.prepare(
    `SELECT state_code, offense_code, received_month AS month, status, COUNT(*) AS total
     FROM complaints
     WHERE received_month = ?
     GROUP BY state_code, offense_code, month, status
     ORDER BY state_code, offense_code, month, status`,
  );
  // Recorrido por saltos sobre el índice del mes: una búsqueda por mes distinto.
  // Parámetros posicionales simples: el SQLite de Node 22 no acepta reutilizar `?1`.
  const monthsStatement = db.prepare(
    `WITH RECURSIVE months(month) AS (
       SELECT MIN(received_month) FROM complaints WHERE received_month < ?
       UNION ALL
       SELECT (SELECT MIN(received_month) FROM complaints
               WHERE received_month > months.month AND received_month < ?)
       FROM months WHERE months.month IS NOT NULL
     )
     SELECT month FROM months WHERE month IS NOT NULL`,
  );

  return {
    exists: (folio) => existsStatement.get(folio) !== undefined,
    hasAuthVerifier: (authVerifier) => verifierExistsStatement.get(authVerifier) !== undefined,
    findAuthVerifier: (folio) => {
      const row = verifierStatement.get(folio);
      return row === undefined ? null : readText(row, 'auth_verifier');
    },
    insert: (record) => {
      insertStatement.run(
        record.folio,
        record.mode,
        record.status,
        record.receivedOn,
        record.facts.stateCode,
        // Seguridad: una misma conducta no debe repartirse en dos celdas de datos abiertos.
        primaryOffenseCode(record.facts.offenseCode) ?? record.facts.offenseCode,
        record.protectionRequested ? 1 : 0,
        JSON.stringify(record.facts),
        record.sealedIdentity === null ? null : JSON.stringify(record.sealedIdentity),
        record.reporterKeys.boxPublicKey,
        record.reporterKeys.signingPublicKey,
        record.authVerifier,
        JSON.stringify(record.receipt),
        record.receivedLegalOn,
        record.assignedAuthorityId,
        record.managementState,
        record.legalStage,
        record.closureReason,
        record.escalationEnvelope === null ? null : JSON.stringify(record.escalationEnvelope),
        record.corroborationDigest,
      );
    },
    find: (folio) => {
      const row = findStatement.get(folio);
      return row === undefined ? null : toRecord(row);
    },
    listSummaries: (offset, limit) => listStatement.all(limit, offset).map(toSummary),
    listSummariesForAuthority: (authorityId, inboxAuthorityId, offset, limit) =>
      listForAuthorityStatement
        .all(inboxAuthorityId, authorityId, limit, offset)
        .map((row) => toListedSummary(row, inboxAuthorityId)),
    listForAuthority: (authorityId, inboxAuthorityId, offset, limit) =>
      listForAuthorityStatement.all(inboxAuthorityId, authorityId, limit, offset).map((row) => ({
        summary: toListedSummary(row, inboxAuthorityId),
        stateSinceOn: readText(row, 'state_since_on'),
      })),
    updateStatus: (folio, status) => {
      updateStatusStatement.run(status, folio);
    },
    updateProcedure: (folio, fields) => {
      updateProcedureStatement.run(
        fields.status,
        fields.assignedAuthorityId,
        fields.managementState,
        fields.legalStage,
        fields.closureReason,
        folio,
      );
    },
    listFoliosForRules: () => rulesStatement.all().map((row) => readText(row, 'folio')),
    countCellsOfMonth: (month) => cellsStatement.all(month).map(toCell),
    listMonthsBefore: (beforeMonth) =>
      monthsStatement.all(beforeMonth, beforeMonth).map((row) => readText(row, 'month')),
  };
}
