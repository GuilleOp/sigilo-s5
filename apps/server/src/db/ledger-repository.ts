// Repositorio de la bitácora: eventos encadenados y su contenido interno (no público).
import type { DatabaseSync } from 'node:sqlite';
import { LedgerEventSchema } from '@sigilo/contracts';
import type { LedgerEvent, LedgerEventType } from '@sigilo/contracts';
import { readText } from './database.ts';
import type { Row } from './database.ts';

/** Evento junto con el JSON de sus datos, que solo se usa dentro del servidor. */
export interface StoredLedgerEvent {
  event: LedgerEvent;
  payloadJson: string;
}

/** Operaciones sobre la tabla `ledger_events`. */
export interface LedgerRepository {
  insert(event: LedgerEvent, payloadJson: string): void;
  /** Último evento, publicado o no; solo para encadenar el siguiente. */
  last(): LedgerEvent | null;
  /** Último evento con fecha anterior a `day` (`AAAA-MM-DD`), o `null`. */
  lastBefore(day: string): LedgerEvent | null;
  /** Eventos desde `fromSeq` hasta `maxSeq` inclusive, en orden, a lo más `limit`. */
  page(fromSeq: number, maxSeq: number, limit: number): LedgerEvent[];
  listByFolioDigest(folioDigest: string, types: readonly LedgerEventType[]): StoredLedgerEvent[];
}

function toEvent(row: Row): LedgerEvent {
  return LedgerEventSchema.parse({
    seq: row.seq,
    type: row.type,
    folioDigest: row.folio_digest,
    at: row.at,
    actorRole: row.actor_role,
    payloadDigest: row.payload_digest,
    prevHash: row.prev_hash,
    hash: row.hash,
  });
}

/** Crea el repositorio de la bitácora sobre `db`. */
export function createLedgerRepository(db: DatabaseSync): LedgerRepository {
  const insertStatement = db.prepare(
    `INSERT INTO ledger_events (seq, type, folio_digest, at, actor_role, payload_digest,
       prev_hash, hash, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const lastStatement = db.prepare('SELECT * FROM ledger_events ORDER BY seq DESC LIMIT 1');
  const lastBeforeStatement = db.prepare(
    'SELECT * FROM ledger_events WHERE at < ? ORDER BY seq DESC LIMIT 1',
  );
  const pageStatement = db.prepare(
    'SELECT * FROM ledger_events WHERE seq >= ? AND seq <= ? ORDER BY seq LIMIT ?',
  );
  const byFolioStatement = db.prepare(
    `SELECT * FROM ledger_events
     WHERE folio_digest = ? AND type IN (SELECT value FROM json_each(?))
     ORDER BY seq`,
  );

  return {
    insert: (event, payloadJson) => {
      insertStatement.run(
        event.seq,
        event.type,
        event.folioDigest,
        event.at,
        event.actorRole,
        event.payloadDigest,
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
    page: (fromSeq, maxSeq, limit) => pageStatement.all(fromSeq, maxSeq, limit).map(toEvent),
    listByFolioDigest: (folioDigest, types) =>
      byFolioStatement.all(folioDigest, JSON.stringify(types)).map((row) => ({
        event: toEvent(row),
        payloadJson: readText(row, 'payload_json'),
      })),
  };
}
