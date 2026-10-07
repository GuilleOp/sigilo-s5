// Acceso de solo lectura a la base SQLite del servidor de prueba y copias para manipularla sin
// tocar la original (que sigue en uso por el servidor).
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import type { LedgerEvent } from '@sigilo/contracts';
import { databasePath, workspaceDir } from './environment.ts';

/** Abre la base del servidor en modo de solo lectura. Hay que cerrarla al terminar. */
export function openServerDatabase(): DatabaseSync {
  return new DatabaseSync(databasePath(), { readOnly: true });
}

/** Una celda de una tabla con su ubicación, para reportar dónde aparece un valor. */
export interface CellText {
  table: string;
  column: string;
  text: string;
}

/** Devuelve el contenido de todas las tablas como texto (los BLOB se leen como UTF-8). */
export function readAllCells(db: DatabaseSync): CellText[] {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((row) => String(row.name));
  const cells: CellText[] = [];
  for (const table of tables) {
    for (const row of db.prepare(`SELECT * FROM "${table}"`).all()) {
      for (const [column, value] of Object.entries(row)) {
        if (value === null) continue;
        const text =
          value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : String(value);
        cells.push({ table, column, text });
      }
    }
  }
  return cells;
}

/**
 * Copia consistente de la base (incluye lo que aún está en el WAL) mediante `VACUUM INTO`.
 * Devuelve la ruta de la copia, abierta después en modo escritura por la prueba.
 */
export function snapshotDatabase(name: string): string {
  // `VACUUM INTO` no sobrescribe: cada copia va en su propio directorio único.
  const target = join(mkdtempSync(join(workspaceDir(), 'copia-')), `${name}.db`);
  const db = openServerDatabase();
  try {
    db.prepare('VACUUM INTO ?').run(target);
  } finally {
    db.close();
  }
  return target;
}

/** Lee los eventos de la bitácora en orden con la forma pública del contrato. */
export function readLedgerEvents(db: DatabaseSync): LedgerEvent[] {
  return db
    .prepare('SELECT * FROM ledger_events ORDER BY seq')
    .all()
    .map((row) => ({
      seq: Number(row.seq),
      type: String(row.type) as LedgerEvent['type'],
      folioDigest: String(row.folio_digest),
      at: String(row.at),
      actorRole: String(row.actor_role) as LedgerEvent['actorRole'],
      payloadDigest: String(row.payload_digest),
      prevHash: String(row.prev_hash),
      hash: String(row.hash),
    }));
}
