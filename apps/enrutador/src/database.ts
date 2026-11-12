// Base SQLite del enrutador: versiones del directorio, registros de nodos, bitácora nacional y cola
// de entrega.
// Seguridad: no hay ninguna tabla para direcciones IP ni cabeceras. Los sobres solo se guardan en
// `relay_queue`, cerrados (cifrados hacia la llave del nodo, que el enrutador no tiene), mientras el
// nodo no responde; se borran al entregarlos o al vencer. Un reenvío normal no escribe nada.
import { DatabaseSync } from 'node:sqlite';
import type { SQLOutputValue } from 'node:sqlite';

/** Fila tal como la devuelve `node:sqlite`. */
export type Row = Record<string, SQLOutputValue>;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS directory_versions (
  serial INTEGER PRIMARY KEY,
  digest TEXT NOT NULL,
  document TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS node_registrations (
  node_id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  standard_version TEXT NOT NULL,
  accepts_relay INTEGER NOT NULL,
  registered_on TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS national_entries (
  seq INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  node_id TEXT,
  node_seq INTEGER,
  node_hash TEXT,
  entry TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS national_entries_node ON national_entries (node_id, node_seq, node_hash);
CREATE TABLE IF NOT EXISTS latest_node_heads (
  node_id TEXT PRIMARY KEY,
  entry_seq INTEGER NOT NULL,
  head TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS national_heads (
  seq INTEGER PRIMARY KEY,
  hash TEXT NOT NULL,
  document TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS node_head_rejections (
  id INTEGER PRIMARY KEY,
  node_id TEXT NOT NULL,
  day TEXT NOT NULL,
  reason TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS relay_queue (
  queue_id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  envelope TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  accepted_on TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS relay_queue_due ON relay_queue (next_attempt_at);
CREATE INDEX IF NOT EXISTS relay_queue_node ON relay_queue (node_id);
CREATE TRIGGER IF NOT EXISTS national_entries_no_update BEFORE UPDATE ON national_entries
  BEGIN SELECT RAISE(ABORT, 'La bitácora nacional es de solo agregar.'); END;
CREATE TRIGGER IF NOT EXISTS national_entries_no_delete BEFORE DELETE ON national_entries
  BEGIN SELECT RAISE(ABORT, 'La bitácora nacional es de solo agregar.'); END;
CREATE TRIGGER IF NOT EXISTS directory_versions_no_update BEFORE UPDATE ON directory_versions
  BEGIN SELECT RAISE(ABORT, 'Las versiones del directorio no se modifican.'); END;
`;

/** Abre la base en `path` (o `:memory:`) con borrado seguro y crea el esquema si falta. */
export function openRouterDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA secure_delete = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Ejecuta `work` en una transacción inmediata y la revierte si lanza error. */
export function withTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = work();
    db.exec('COMMIT;');
    return result;
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

/** Lee una columna de texto; lanza error si no lo es. */
export function readText(row: Row, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') throw new Error(`Columna ${column} no es texto.`);
  return value;
}

/** Lee una columna entera; lanza error si no lo es. */
export function readInteger(row: Row, column: string): number {
  const value = row[column];
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Columna ${column} no es entera.`);
  }
  return value;
}
