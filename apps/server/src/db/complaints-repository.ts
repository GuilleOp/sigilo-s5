// Repositorio de denuncias: hechos legibles, sobre de identidad, llaves y comprobante.
import type { DatabaseSync } from 'node:sqlite';
import {
  primaryOffenseCode,
  ComplaintFactsSchema,
  ComplaintModeSchema,
  ComplaintStatusSchema,
  HpkeEnvelopeSchema,
  SignedReceiptSchema,
} from '@sigilo/contracts';
import type {
  ComplaintFacts,
  ComplaintMode,
  ComplaintStatus,
  ComplaintSummary,
  HpkeEnvelope,
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
}

/** Celda agregada para datos abiertos. */
export interface OpenDataCell {
  stateCode: string;
  offenseCode: string;
  month: string;
  status: ComplaintStatus;
  count: number;
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
  updateStatus(folio: string, status: ComplaintStatus): void;
  /** Conteos por celda del mes de recepción `month` (`AAAA-MM`), con la clave principal. */
  countCellsOfMonth(month: string): OpenDataCell[];
  /**
   * Meses de recepción (`AAAA-MM`) anteriores a `beforeMonth` que tienen denuncias, en orden.
   * Usa el índice del mes saltando de un mes al siguiente: no recorre las denuncias.
   */
  listMonthsBefore(beforeMonth: string): string[];
}

const SUMMARY_COLUMNS =
  'folio, mode, status, received_on, state_code, offense_code, protection_requested';

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
  };
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
       reporter_signing_public_key, auth_verifier, receipt_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const findStatement = db.prepare('SELECT * FROM complaints WHERE folio = ?');
  // Dentro del mismo día se ordena por folio (aleatorio) para no revelar el orden de llegada.
  const listStatement = db.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM complaints ORDER BY received_on DESC, folio LIMIT ? OFFSET ?`,
  );
  const updateStatusStatement = db.prepare('UPDATE complaints SET status = ? WHERE folio = ?');
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
      );
    },
    find: (folio) => {
      const row = findStatement.get(folio);
      return row === undefined ? null : toRecord(row);
    },
    listSummaries: (offset, limit) => listStatement.all(limit, offset).map(toSummary),
    updateStatus: (folio, status) => {
      updateStatusStatement.run(status, folio);
    },
    countCellsOfMonth: (month) => cellsStatement.all(month).map(toCell),
    listMonthsBefore: (beforeMonth) =>
      monthsStatement.all(beforeMonth, beforeMonth).map((row) => readText(row, 'month')),
  };
}
