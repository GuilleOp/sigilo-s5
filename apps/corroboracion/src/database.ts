// Bases SQLite de los dos servicios. El evaluador solo guarda conteos diarios y retos gastados; el
// índice, etiquetas, nodos, folios opacos y avisos. Ninguna tabla guarda identificadores, IP ni
// cabeceras.
import { DatabaseSync } from 'node:sqlite';
import type { SQLOutputValue } from 'node:sqlite';

/** Fila tal como la devuelve `node:sqlite`. */
export type Row = Record<string, SQLOutputValue>;

/**
 * Esquema del evaluador.
 * Seguridad: no hay columna para elementos cegados, evaluados, etiquetas ni denuncias. El reto
 * gastado se guarda por su nonce aleatorio y vence redondeado a 10 minutos.
 */
export const EVALUATOR_SCHEMA = `
CREATE TABLE IF NOT EXISTS evaluation_counts (
  day TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  evaluations INTEGER NOT NULL,
  PRIMARY KEY (day, epoch)
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS spent_challenges (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
`;

/**
 * Esquema del índice.
 * Seguridad: la etiqueta es pseudoaleatoria sin la llave del evaluador; el folio es un HMAC con un
 * secreto del nodo; el grupo tiene un identificador aleatorio. Una baja borra el registro y deja
 * solo el folio opaco con su motivo, para no volver a aceptarlo.
 */
export const INDEX_SCHEMA = `
CREATE TABLE IF NOT EXISTS tag_groups (
  epoch INTEGER NOT NULL,
  tag TEXT NOT NULL,
  group_id TEXT NOT NULL UNIQUE,
  PRIMARY KEY (epoch, tag)
) STRICT, WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS registrations (
  node_id TEXT NOT NULL,
  folio_digest TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  tag TEXT NOT NULL,
  received_at TEXT NOT NULL,
  entry TEXT NOT NULL,
  similarity BLOB,
  custody INTEGER NOT NULL,
  confirmation TEXT NOT NULL,
  registered_on TEXT NOT NULL,
  solo_group_id TEXT NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (node_id, folio_digest)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS registrations_pending ON registrations (confirmation, registered_on);
CREATE TABLE IF NOT EXISTS withdrawals (
  node_id TEXT NOT NULL,
  folio_digest TEXT NOT NULL,
  reason TEXT NOT NULL,
  withdrawn_on TEXT NOT NULL,
  PRIMARY KEY (node_id, folio_digest)
) STRICT, WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS registrations_tag ON registrations (epoch, tag);
CREATE TABLE IF NOT EXISTS notices (
  node_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  status TEXT NOT NULL,
  PRIMARY KEY (node_id, seq)
) STRICT, WITHOUT ROWID;
`;

/** Abre la base en `path` (o `:memory:`) con borrado seguro y crea el esquema si falta. */
export function openDatabase(path: string, schema: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA secure_delete = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(schema);
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

/** Lee una columna de bytes o `null`; lanza error si es de otro tipo. */
export function readBytesOrNull(row: Row, column: string): Uint8Array | null {
  const value = row[column];
  if (value === null) return null;
  if (!(value instanceof Uint8Array)) throw new Error(`Columna ${column} no son bytes.`);
  return new Uint8Array(value);
}
