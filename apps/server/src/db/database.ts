// Apertura de la base SQLite, aplicación de migraciones y transacciones síncronas.
import { DatabaseSync } from 'node:sqlite';
import type { SQLOutputValue } from 'node:sqlite';
import { MIGRATIONS } from './schema.ts';

/** Fila tal como la devuelve `node:sqlite`. */
export type Row = Record<string, SQLOutputValue>;

/**
 * Abre la base en `path` (o `:memory:`), activa llaves foráneas y aplica las migraciones pendientes.
 */
export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

/** Aplica, cada una en su transacción, las migraciones que aún no constan en la base. */
export function migrate(db: DatabaseSync): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY) STRICT;');
  const applied = new Set(
    db
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => readInteger(row, 'version')),
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    withTransaction(db, () => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(migration.version);
    });
  }
}

/**
 * Ejecuta `work` dentro de una transacción inmediata y la revierte si lanza error.
 * `work` debe ser síncrona: la base es síncrona y así ninguna otra petición se intercala.
 */
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

/** Lee una columna de texto que admite nulo. */
export function readOptionalText(row: Row, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
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
