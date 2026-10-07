// Repositorio de la bitácora: eventos pendientes del día (sin secuencia) y eventos ya encadenados,
// con el contenido interno de sus datos (no público).
import type { DatabaseSync } from 'node:sqlite';
import { LedgerEventSchema } from '@sigilo/contracts';
import type { LedgerEvent, LedgerEventType } from '@sigilo/contracts';
import type { PendingLedgerEvent } from '@sigilo/core';
import { readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/** Evento encadenado junto con el JSON de sus datos, que solo se usa dentro del servidor. */
export interface StoredLedgerEvent {
  event: LedgerEvent;
  payloadJson: string;
}

/** Evento pendiente de encadenar, con su identificador interno y el JSON de sus datos. */
export interface StoredPendingEvent {
  pendingId: string;
  event: PendingLedgerEvent;
  payloadJson: string;
}

/** Operaciones sobre `ledger_events` (encadenados) y `ledger_pending` (del día). */
export interface LedgerRepository {
  insertPending(pendingId: string, event: PendingLedgerEvent, payloadJson: string): void;
  /** Pendientes con fecha anterior a `day` (`AAAA-MM-DD`), ordenados solo por fecha. */
  listPendingBefore(day: string): StoredPendingEvent[];
  /** Indica si hay pendientes con fecha anterior a `day`, sin leerlos. */
  hasPendingBefore(day: string): boolean;
  /** Días (`AAAA-MM-DD`) anteriores a `day` con pendientes, en orden. */
  listPendingDaysBefore(day: string): string[];
  /** Fecha más antigua con pendientes, o `null` si no hay ninguno. */
  firstPendingDay(): string | null;
  /** Identificadores de los pendientes del día, sin ningún orden significativo. */
  listPendingIdsOn(day: string): string[];
  /** Pendiente por su identificador, o `null` si ya no existe. */
  findPending(pendingId: string): StoredPendingEvent | null;
  /** Cuántos pendientes tiene el día. */
  countPendingOn(day: string): number;
  deletePending(pendingId: string): void;
  insert(event: LedgerEvent, payloadJson: string): void;
  /** Último evento encadenado, o `null`. */
  last(): LedgerEvent | null;
  /** Último evento encadenado con fecha anterior a `day`, o `null`. */
  lastBefore(day: string): LedgerEvent | null;
  /** Eventos encadenados desde `fromSeq` hasta `maxSeq` (incluido), en orden, a lo más `limit`. */
  page(fromSeq: number, limit: number, maxSeq?: number): LedgerEvent[];
  /** Eventos encadenados del folio (por su digesto) y de los tipos dados, en orden. */
  listByFolioDigest(folioDigest: string, types: readonly LedgerEventType[]): StoredLedgerEvent[];
  /** Evento encadenado de ese tipo con ese `payloadDigest`, o `null`. */
  findByPayloadDigest(type: LedgerEventType, payloadDigest: string): LedgerEvent | null;
}

const ZERO_HASH = '0'.repeat(64);

function eventFields(row: Row) {
  const receiptTag = readOptionalText(row, 'receipt_tag');
  return {
    type: row.type,
    folioDigest: row.folio_digest,
    at: row.at,
    actorRole: row.actor_role,
    payloadDigest: row.payload_digest,
    ...(receiptTag === null ? {} : { receiptTag }),
  };
}

function toEvent(row: Row): LedgerEvent {
  return LedgerEventSchema.parse({
    ...eventFields(row),
    seq: row.seq,
    prevHash: row.prev_hash,
    hash: row.hash,
  });
}

function toPending(row: Row): StoredPendingEvent {
  // Se valida con el mismo esquema que un evento publicado; la cadena se calcula al cerrar el día.
  const parsed = LedgerEventSchema.parse({
    ...eventFields(row),
    seq: 0,
    prevHash: ZERO_HASH,
    hash: ZERO_HASH,
  });
  const event: PendingLedgerEvent = {
    type: parsed.type,
    folioDigest: parsed.folioDigest,
    at: parsed.at,
    actorRole: parsed.actorRole,
    payloadDigest: parsed.payloadDigest,
    ...(parsed.receiptTag === undefined ? {} : { receiptTag: parsed.receiptTag }),
  };
  return {
    pendingId: readText(row, 'pending_id'),
    event,
    payloadJson: readText(row, 'payload_json'),
  };
}

/** Crea el repositorio de la bitácora sobre `db`. */
export function createLedgerRepository(db: DatabaseSync): LedgerRepository {
  const insertPendingStatement = db.prepare(
    `INSERT INTO ledger_pending (pending_id, type, folio_digest, at, actor_role, payload_digest,
       receipt_tag, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Seguridad: solo se ordena por día y por el identificador aleatorio; el orden dentro del día
  // lo decide el barajado al cerrar.
  const pendingBeforeStatement = db.prepare(
    'SELECT * FROM ledger_pending WHERE at < ? ORDER BY at, pending_id',
  );
  const hasPendingStatement = db.prepare(
    'SELECT 1 AS found FROM ledger_pending WHERE at < ? LIMIT 1',
  );
  const pendingDaysStatement = db.prepare(
    'SELECT DISTINCT at FROM ledger_pending WHERE at < ? ORDER BY at',
  );
  const firstPendingDayStatement = db.prepare('SELECT MIN(at) AS day FROM ledger_pending');
  const pendingIdsStatement = db.prepare('SELECT pending_id FROM ledger_pending WHERE at = ?');
  const findPendingStatement = db.prepare('SELECT * FROM ledger_pending WHERE pending_id = ?');
  const countPendingStatement = db.prepare(
    'SELECT COUNT(*) AS total FROM ledger_pending WHERE at = ?',
  );
  const deletePendingStatement = db.prepare('DELETE FROM ledger_pending WHERE pending_id = ?');
  const insertStatement = db.prepare(
    `INSERT INTO ledger_events (seq, type, folio_digest, at, actor_role, payload_digest,
       receipt_tag, prev_hash, hash, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const lastStatement = db.prepare('SELECT * FROM ledger_events ORDER BY seq DESC LIMIT 1');
  const lastBeforeStatement = db.prepare(
    'SELECT * FROM ledger_events WHERE at < ? ORDER BY at DESC, seq DESC LIMIT 1',
  );
  const pageStatement = db.prepare(
    'SELECT * FROM ledger_events WHERE seq >= ? AND seq <= ? ORDER BY seq LIMIT ?',
  );
  const byFolioStatement = db.prepare(
    `SELECT * FROM ledger_events
     WHERE folio_digest = ? AND type IN (SELECT value FROM json_each(?))
     ORDER BY seq`,
  );
  const byPayloadStatement = db.prepare(
    'SELECT * FROM ledger_events WHERE type = ? AND payload_digest = ? ORDER BY seq LIMIT 1',
  );
  return {
    insertPending: (pendingId, event, payloadJson) => {
      insertPendingStatement.run(
        pendingId,
        event.type,
        event.folioDigest,
        event.at,
        event.actorRole,
        event.payloadDigest,
        event.receiptTag ?? null,
        payloadJson,
      );
    },
    listPendingBefore: (day) => pendingBeforeStatement.all(day).map(toPending),
    hasPendingBefore: (day) => hasPendingStatement.get(day) !== undefined,
    listPendingDaysBefore: (day) => pendingDaysStatement.all(day).map((row) => readText(row, 'at')),
    firstPendingDay: () => readOptionalText(firstPendingDayStatement.get() ?? {}, 'day'),
    listPendingIdsOn: (day) =>
      pendingIdsStatement.all(day).map((row) => readText(row, 'pending_id')),
    findPending: (pendingId) => {
      const row = findPendingStatement.get(pendingId);
      return row === undefined ? null : toPending(row);
    },
    countPendingOn: (day) => Number(countPendingStatement.get(day)?.total ?? 0),
    deletePending: (pendingId) => {
      deletePendingStatement.run(pendingId);
    },
    insert: (event, payloadJson) => {
      insertStatement.run(
        event.seq,
        event.type,
        event.folioDigest,
        event.at,
        event.actorRole,
        event.payloadDigest,
        event.receiptTag ?? null,
        event.prevHash,
        event.hash,
        payloadJson,
      );
    },
    last: () => {
      const row = lastStatement.get();
      return row === undefined ? null : toEvent(row);
    },
    lastBefore: (day) => {
      const row = lastBeforeStatement.get(day);
      return row === undefined ? null : toEvent(row);
    },
    page: (fromSeq, limit, maxSeq = Number.MAX_SAFE_INTEGER) =>
      pageStatement.all(fromSeq, maxSeq, limit).map(toEvent),
    listByFolioDigest: (folioDigest, types) =>
      byFolioStatement.all(folioDigest, JSON.stringify(types)).map((row) => ({
        event: toEvent(row),
        payloadJson: readText(row, 'payload_json'),
      })),
    findByPayloadDigest: (type, payloadDigest) => {
      const row = byPayloadStatement.get(type, payloadDigest);
      return row === undefined ? null : toEvent(row);
    },
  };
}
