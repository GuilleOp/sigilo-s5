// Registros de la integración con la red, la PDN, el auditor y la corroboración: revisiones de
// conflicto, verificaciones de sanciones, señales del auditor, corroboración y turnados.
import type { DatabaseSync } from 'node:sqlite';
import { readInteger, readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/** Revisión de conflicto de interés guardada (el resultado completo va en `checkJson`). */
export interface StoredConflictReview {
  authorityId: string;
  checkedOn: string;
  legalOn: string;
  outcome: string;
  requiresResponse: boolean;
  checkJson: string;
}

/** Verificación de una sanción declarada. */
export interface StoredSanctionCheck {
  checkedOn: string;
  outcome: 'confirmed' | 'contradicted' | 'no_coverage';
  explanation: string;
  unverifiable: boolean;
  claimJson: string;
}

/** Señal del auditor guardada. */
export interface StoredAuditSignal {
  signalId: string;
  subjectKey: string;
  folio: string | null;
  authorityId: string;
  ruleId: string;
  signalKey: string;
  flaggedOn: string;
  signalJson: string;
  recordDigest: string;
}

/** Registro pendiente o hecho en el índice de corroboración. */
export interface StoredCorroborationRegistration {
  folio: string;
  epoch: number;
  tag: string;
  similarity: string | null;
  receivedAt: string;
  entry: 'relay' | 'direct';
  folioDigest: string;
  registered: boolean;
  /** El nodo confirmó ante el índice que la autoridad aceptó la denuncia (H3). */
  confirmed?: boolean;
  /** Baja pedida al cerrarla como improcedente o acumulada, y si ya se aplicó. */
  withdrawalReason?: 'spam' | 'inadmissible' | 'duplicate' | null;
  withdrawn?: boolean;
}

/** Estado de corroboración según el índice. */
export interface StoredCorroborationStatus {
  updatedOn: string;
  complaints: number;
  independentSources: number;
  isPossibleCampaign: boolean;
  newIndicationOn: string | null;
}

/** Turnado a otro nodo. */
export interface StoredTransfer {
  transferId: string;
  folio: string;
  toAuthority: string;
  toNode: string;
  transferredOn: string;
  relayDigest: string;
  actorId: string;
  targetFolio: string | null;
  /** Nota pública de quien turnó; se muestra al llegar el comprobante. */
  note: string | null;
}

/** Acuerdo recibido por otros medios e importado (Bases de la PDN, art. 58). */
export interface StoredImportedAct {
  actId: string;
  authorityId: string;
  fileNumber: string;
  issuedOn: string;
  reason: string | null;
  qualification: 'serious' | 'non_serious' | null;
  agreement: string;
  batchId: string;
}

/** Operaciones sobre las tablas de la migración 8. */
export interface IntegrationRepository {
  /** Importa un acuerdo; `false` si ya había uno con ese expediente en la autoridad. */
  insertImportedAct(act: StoredImportedAct): boolean;
  listImportedActs(): StoredImportedAct[];
  insertConflictReview(folio: string, review: StoredConflictReview): void;
  lastConflictReview(folio: string): StoredConflictReview | null;
  insertSanctionCheck(folio: string, check: StoredSanctionCheck): void;
  lastSanctionCheck(folio: string): StoredSanctionCheck | null;
  /** Folios cuya última verificación de sanción quedó sin cobertura (se reintenta). */
  listPendingSanctionFolios(): string[];
  /** Registra la señal; `false` si ya estaba (misma regla, sujeto y clave). */
  insertAuditSignal(signal: StoredAuditSignal): boolean;
  listAuditSignalsByFolio(folio: string): StoredAuditSignal[];
  listAuditSignalsByAuthority(authorityId: string): StoredAuditSignal[];
  /** Conteo de señales por autoridad y regla, para el observatorio. */
  countAuditSignals(): { authorityId: string; ruleId: string; count: number }[];
  insertCorroborationRegistration(registration: StoredCorroborationRegistration): void;
  listUnregisteredCorroborations(limit: number): StoredCorroborationRegistration[];
  markCorroborationRegistered(folio: string): void;
  /** Registro de corroboración de la denuncia, o `null`. */
  findCorroborationRegistration(folio: string): StoredCorroborationRegistration | null;
  markCorroborationConfirmed(folio: string): void;
  requestCorroborationWithdrawal(
    folio: string,
    reason: 'spam' | 'inadmissible' | 'duplicate',
  ): void;
  markCorroborationWithdrawn(folio: string): void;
  /** Registradas sin confirmar ni retirar. */
  listUnconfirmedCorroborations(limit: number): StoredCorroborationRegistration[];
  /** Registradas con una baja pedida que aún no se aplica. */
  listPendingWithdrawals(limit: number): StoredCorroborationRegistration[];
  folioOfCorroborationDigest(folioDigest: string): string | null;
  insertCorroborationStatus(folio: string, status: StoredCorroborationStatus): void;
  lastCorroborationStatus(folio: string): StoredCorroborationStatus | null;
  corroborationCursor(): number;
  setCorroborationCursor(after: number): void;
  insertTransfer(transfer: StoredTransfer, targetReceiptJson: string | null): void;
  findTransfer(transferId: string): StoredTransfer | null;
  completeTransfer(transferId: string, targetFolio: string, receiptJson: string): void;
  listTransfers(folio: string): StoredTransfer[];
}

function toConflict(row: Row): StoredConflictReview {
  return {
    authorityId: readText(row, 'authority_id'),
    checkedOn: readText(row, 'checked_on'),
    legalOn: readText(row, 'legal_on'),
    outcome: readText(row, 'outcome'),
    requiresResponse: readInteger(row, 'requires_response') === 1,
    checkJson: readText(row, 'check_json'),
  };
}

function toSanction(row: Row): StoredSanctionCheck {
  const outcome = readText(row, 'outcome');
  if (outcome !== 'confirmed' && outcome !== 'contradicted' && outcome !== 'no_coverage') {
    throw new Error('Resultado de sanción desconocido.');
  }
  return {
    checkedOn: readText(row, 'checked_on'),
    outcome,
    explanation: readText(row, 'explanation'),
    unverifiable: readInteger(row, 'unverifiable') === 1,
    claimJson: readText(row, 'claim_json'),
  };
}

function toSignal(row: Row): StoredAuditSignal {
  return {
    signalId: readText(row, 'signal_id'),
    subjectKey: readText(row, 'subject_key'),
    folio: readOptionalText(row, 'folio'),
    authorityId: readText(row, 'authority_id'),
    ruleId: readText(row, 'rule_id'),
    signalKey: readText(row, 'signal_key'),
    flaggedOn: readText(row, 'flagged_on'),
    signalJson: readText(row, 'signal_json'),
    recordDigest: readText(row, 'record_digest'),
  };
}

function toRegistration(row: Row): StoredCorroborationRegistration {
  const entry = readText(row, 'entry');
  return {
    folio: readText(row, 'folio'),
    epoch: readInteger(row, 'epoch'),
    tag: readText(row, 'tag'),
    similarity: readOptionalText(row, 'similarity'),
    receivedAt: readText(row, 'received_at'),
    entry: entry === 'relay' ? 'relay' : 'direct',
    folioDigest: readText(row, 'folio_digest'),
    registered: readInteger(row, 'registered') === 1,
    confirmed: readInteger(row, 'confirmed') === 1,
    withdrawalReason: withdrawalReasonOf(readOptionalText(row, 'withdrawal_reason')),
    withdrawn: readInteger(row, 'withdrawn') === 1,
  };
}

function toTransfer(row: Row): StoredTransfer {
  return {
    transferId: readText(row, 'transfer_id'),
    folio: readText(row, 'folio'),
    toAuthority: readText(row, 'to_authority'),
    toNode: readText(row, 'to_node'),
    transferredOn: readText(row, 'transferred_on'),
    relayDigest: readText(row, 'relay_digest'),
    actorId: readText(row, 'actor_id'),
    targetFolio: readOptionalText(row, 'target_folio'),
    note: readOptionalText(row, 'note'),
  };
}

function withdrawalReasonOf(value: string | null): 'spam' | 'inadmissible' | 'duplicate' | null {
  return value === 'spam' || value === 'inadmissible' || value === 'duplicate' ? value : null;
}

function qualificationOf(value: string | null): 'serious' | 'non_serious' | null {
  return value === 'serious' || value === 'non_serious' ? value : null;
}

const NEXT_POSITION = (table: string) =>
  `(SELECT COALESCE(MAX(position) + 1, 0) FROM ${table} WHERE folio = ?)`;

/** Crea el repositorio de la integración sobre `db`. */
export function createIntegrationRepository(db: DatabaseSync): IntegrationRepository {
  const insertConflict = db.prepare(
    `INSERT INTO conflict_reviews (folio, position, authority_id, checked_on, legal_on, outcome,
       requires_response, check_json) VALUES (?, ${NEXT_POSITION('conflict_reviews')}, ?, ?, ?, ?, ?, ?)`,
  );
  const lastConflict = db.prepare(
    'SELECT * FROM conflict_reviews WHERE folio = ? ORDER BY position DESC LIMIT 1',
  );
  const insertSanction = db.prepare(
    `INSERT INTO sanction_checks (folio, position, checked_on, outcome, explanation, unverifiable,
       claim_json) VALUES (?, ${NEXT_POSITION('sanction_checks')}, ?, ?, ?, ?, ?)`,
  );
  const lastSanction = db.prepare(
    'SELECT * FROM sanction_checks WHERE folio = ? ORDER BY position DESC LIMIT 1',
  );
  const pendingSanctions = db.prepare(
    `SELECT s.folio FROM sanction_checks AS s
     WHERE s.position = (SELECT MAX(position) FROM sanction_checks WHERE folio = s.folio)
       AND s.outcome = 'no_coverage' AND s.unverifiable = 0`,
  );
  const insertSignal = db.prepare(
    `INSERT OR IGNORE INTO audit_signals (signal_id, subject_key, folio, authority_id, rule_id,
       signal_key, flagged_on, signal_json, record_digest) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const signalsByFolio = db.prepare(
    'SELECT * FROM audit_signals WHERE folio = ? ORDER BY flagged_on, rule_id, signal_id',
  );
  const signalsByAuthority = db.prepare(
    'SELECT * FROM audit_signals WHERE authority_id = ? ORDER BY flagged_on, rule_id, signal_id',
  );
  const countSignals = db.prepare(
    `SELECT authority_id, rule_id, COUNT(*) AS total FROM audit_signals
     GROUP BY authority_id, rule_id ORDER BY authority_id, rule_id`,
  );
  const insertRegistration = db.prepare(
    `INSERT INTO corroboration_registrations (folio, epoch, tag, similarity, received_at, entry,
       folio_digest, registered) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  );
  const unregistered = db.prepare(
    'SELECT * FROM corroboration_registrations WHERE registered = 0 AND withdrawal_reason IS NULL ORDER BY folio LIMIT ?',
  );
  const findRegistration = db.prepare('SELECT * FROM corroboration_registrations WHERE folio = ?');
  const markConfirmed = db.prepare(
    'UPDATE corroboration_registrations SET confirmed = 1 WHERE folio = ?',
  );
  const requestWithdrawal = db.prepare(
    'UPDATE corroboration_registrations SET withdrawal_reason = ? WHERE folio = ?',
  );
  const markWithdrawn = db.prepare(
    'UPDATE corroboration_registrations SET withdrawn = 1 WHERE folio = ?',
  );
  const unconfirmed = db.prepare(
    `SELECT * FROM corroboration_registrations
     WHERE registered = 1 AND confirmed = 0 AND withdrawal_reason IS NULL ORDER BY folio LIMIT ?`,
  );
  const pendingWithdrawals = db.prepare(
    `SELECT * FROM corroboration_registrations
     WHERE registered = 1 AND withdrawn = 0 AND withdrawal_reason IS NOT NULL
     ORDER BY folio LIMIT ?`,
  );
  const markRegistered = db.prepare(
    'UPDATE corroboration_registrations SET registered = 1 WHERE folio = ?',
  );
  const folioByDigest = db.prepare(
    'SELECT folio FROM corroboration_registrations WHERE folio_digest = ?',
  );
  const insertStatus = db.prepare(
    `INSERT INTO corroboration_status (folio, position, updated_on, complaints,
       independent_sources, is_possible_campaign, new_indication_on)
     VALUES (?, ${NEXT_POSITION('corroboration_status')}, ?, ?, ?, ?, ?)`,
  );
  const lastStatus = db.prepare(
    'SELECT * FROM corroboration_status WHERE folio = ? ORDER BY position DESC LIMIT 1',
  );
  const readCursor = db.prepare('SELECT after_seq FROM corroboration_cursor WHERE id = 1');
  const writeCursor = db.prepare(
    `INSERT INTO corroboration_cursor (id, after_seq) VALUES (1, ?)
     ON CONFLICT (id) DO UPDATE SET after_seq = excluded.after_seq`,
  );
  const insertTransfer = db.prepare(
    `INSERT INTO transfers (transfer_id, folio, to_authority, to_node, transferred_on,
       relay_digest, actor_id, target_folio, target_receipt_json, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  );
  const findTransfer = db.prepare('SELECT * FROM transfers WHERE transfer_id = ?');
  const completeTransfer = db.prepare(
    `UPDATE transfers SET target_folio = ?, target_receipt_json = ?
     WHERE transfer_id = ? AND target_folio IS NULL`,
  );
  const transfersByFolio = db.prepare(
    'SELECT * FROM transfers WHERE folio = ? ORDER BY transferred_on, transfer_id',
  );
  const insertImported = db.prepare(
    `INSERT OR IGNORE INTO imported_acts (act_id, authority_id, file_number, issued_on, reason,
       agreement, batch_id, qualification) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listImported = db.prepare('SELECT * FROM imported_acts ORDER BY authority_id, file_number');
  return {
    insertImportedAct: (act) =>
      Number(
        insertImported.run(
          act.actId,
          act.authorityId,
          act.fileNumber,
          act.issuedOn,
          act.reason,
          act.agreement,
          act.batchId,
          act.qualification,
        ).changes,
      ) > 0,
    listImportedActs: () =>
      listImported.all().map((row) => ({
        actId: readText(row, 'act_id'),
        authorityId: readText(row, 'authority_id'),
        fileNumber: readText(row, 'file_number'),
        issuedOn: readText(row, 'issued_on'),
        reason: readOptionalText(row, 'reason'),
        agreement: readText(row, 'agreement'),
        batchId: readText(row, 'batch_id'),
        qualification: qualificationOf(readOptionalText(row, 'qualification')),
      })),
    insertConflictReview: (folio, review) => {
      insertConflict.run(
        folio,
        folio,
        review.authorityId,
        review.checkedOn,
        review.legalOn,
        review.outcome,
        review.requiresResponse ? 1 : 0,
        review.checkJson,
      );
    },
    lastConflictReview: (folio) => {
      const row = lastConflict.get(folio);
      return row === undefined ? null : toConflict(row);
    },
    insertSanctionCheck: (folio, check) => {
      insertSanction.run(
        folio,
        folio,
        check.checkedOn,
        check.outcome,
        check.explanation,
        check.unverifiable ? 1 : 0,
        check.claimJson,
      );
    },
    lastSanctionCheck: (folio) => {
      const row = lastSanction.get(folio);
      return row === undefined ? null : toSanction(row);
    },
    listPendingSanctionFolios: () => pendingSanctions.all().map((row) => readText(row, 'folio')),
    insertAuditSignal: (signal) =>
      Number(
        insertSignal.run(
          signal.signalId,
          signal.subjectKey,
          signal.folio,
          signal.authorityId,
          signal.ruleId,
          signal.signalKey,
          signal.flaggedOn,
          signal.signalJson,
          signal.recordDigest,
        ).changes,
      ) > 0,
    listAuditSignalsByFolio: (folio) => signalsByFolio.all(folio).map(toSignal),
    listAuditSignalsByAuthority: (authorityId) => signalsByAuthority.all(authorityId).map(toSignal),
    countAuditSignals: () =>
      countSignals.all().map((row) => ({
        authorityId: readText(row, 'authority_id'),
        ruleId: readText(row, 'rule_id'),
        count: readInteger(row, 'total'),
      })),
    insertCorroborationRegistration: (item) => {
      insertRegistration.run(
        item.folio,
        item.epoch,
        item.tag,
        item.similarity,
        item.receivedAt,
        item.entry,
        item.folioDigest,
      );
    },
    listUnregisteredCorroborations: (limit) => unregistered.all(limit).map(toRegistration),
    findCorroborationRegistration: (folio) => {
      const row = findRegistration.get(folio);
      return row === undefined ? null : toRegistration(row);
    },
    markCorroborationConfirmed: (folio) => {
      markConfirmed.run(folio);
    },
    requestCorroborationWithdrawal: (folio, reason) => {
      requestWithdrawal.run(reason, folio);
    },
    markCorroborationWithdrawn: (folio) => {
      markWithdrawn.run(folio);
    },
    listUnconfirmedCorroborations: (limit) => unconfirmed.all(limit).map(toRegistration),
    listPendingWithdrawals: (limit) => pendingWithdrawals.all(limit).map(toRegistration),
    markCorroborationRegistered: (folio) => {
      markRegistered.run(folio);
    },
    folioOfCorroborationDigest: (digest) => {
      const row = folioByDigest.get(digest);
      return row === undefined ? null : readText(row, 'folio');
    },
    insertCorroborationStatus: (folio, status) => {
      insertStatus.run(
        folio,
        folio,
        status.updatedOn,
        status.complaints,
        status.independentSources,
        status.isPossibleCampaign ? 1 : 0,
        status.newIndicationOn,
      );
    },
    lastCorroborationStatus: (folio) => {
      const row = lastStatus.get(folio);
      if (row === undefined) return null;
      return {
        updatedOn: readText(row, 'updated_on'),
        complaints: readInteger(row, 'complaints'),
        independentSources: readInteger(row, 'independent_sources'),
        isPossibleCampaign: readInteger(row, 'is_possible_campaign') === 1,
        newIndicationOn: readOptionalText(row, 'new_indication_on'),
      };
    },
    corroborationCursor: () => {
      const row = readCursor.get();
      return row === undefined ? 0 : readInteger(row, 'after_seq');
    },
    setCorroborationCursor: (after) => {
      writeCursor.run(after);
    },
    insertTransfer: (transfer, receiptJson) => {
      insertTransfer.run(
        transfer.transferId,
        transfer.folio,
        transfer.toAuthority,
        transfer.toNode,
        transfer.transferredOn,
        transfer.relayDigest,
        transfer.actorId,
        receiptJson,
        transfer.note,
      );
    },
    findTransfer: (transferId) => {
      const row = findTransfer.get(transferId);
      return row === undefined ? null : toTransfer(row);
    },
    completeTransfer: (transferId, targetFolio, receiptJson) => {
      completeTransfer.run(targetFolio, receiptJson, transferId);
    },
    listTransfers: (folio) => transfersByFolio.all(folio).map(toTransfer),
  };
}
