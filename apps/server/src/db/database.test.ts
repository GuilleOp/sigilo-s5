// Pruebas de la base: migraciones idempotentes, índice único del recibo, base anterior con datos y
// triggers de solo agregar.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate, openDatabase, readInteger, schemaVersion, withTransaction } from './database.ts';
import {
  LATEST_SCHEMA_VERSION,
  LEGACY_DATA_MESSAGE,
  MIGRATIONS,
  ROWID_DATA_MESSAGE,
} from './schema.ts';

function insertComplaint(db: DatabaseSync, folio: string, authVerifier: string): void {
  db.prepare(
    `INSERT INTO complaints (folio, mode, status, received_on, state_code, offense_code,
       protection_requested, facts_json, sealed_identity_json, reporter_box_public_key,
       reporter_signing_public_key, auth_verifier, receipt_json)
     VALUES (?, 'anonymous', 'received', '2026-10-20', '22', 'LGRA-52', 0, '{}', NULL, 'b', 's',
       ?, '{}')`,
  ).run(folio, authVerifier);
}

function insertEvent(db: DatabaseSync, seq: number): void {
  db.prepare(
    `INSERT INTO ledger_events (seq, type, folio_digest, at, actor_role, payload_digest, prev_hash,
       hash, payload_json)
     VALUES (?, 'message.sent', 'f', '2026-10-20', 'reporter', 'p', 'h', ?, '{}')`,
  ).run(seq, `hash-${seq}`);
}

function insertLegacyMessage(db: DatabaseSync, id: string, ledgerSeq: number): void {
  db.prepare(
    `INSERT INTO messages (message_id, folio, sender, sent_on, envelope_json, signature,
       ledger_seq)
     VALUES (?, 'AAAA-AAAA-AAAA', 'reporter', '2026-10-20T15:00Z', '{}', 'x', ?)`,
  ).run(id, ledgerSeq);
}

function insertMessage(db: DatabaseSync, id: string, sequence: number, position: number): void {
  db.prepare(
    `INSERT INTO messages (message_id, folio, sender, sequence, position, sent_on, envelope_json,
       signature)
     VALUES (?, 'AAAA-AAAA-AAAA', 'reporter', ?, ?, '2026-10-20T15:00Z', '{}', 'x')`,
  ).run(id, sequence, position);
}

/** Base con el esquema de la versión 1 y algunas filas, como la de un despliegue anterior. */
function legacyDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY) STRICT;');
  const [first] = MIGRATIONS;
  if (!first) throw new Error('Falta la migración inicial.');
  db.exec(first.sql);
  db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
  insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
  for (const seq of [0, 1, 2]) insertEvent(db, seq);
  for (const seq of [0, 1, 2]) insertLegacyMessage(db, `m${seq}`, seq);
  return db;
}

describe('migraciones', () => {
  it('aplica todas las versiones una sola vez', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
      .map((row) => readInteger(row, 'version'));
    expect(versions).toEqual(MIGRATIONS.map((migration) => migration.version));
    expect(versions).toEqual([1, 2, 3, 4, 5]);
    expect(schemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(schemaVersion(new DatabaseSync(':memory:'))).toBe(0);
  });

  it('la versión 2 numera los mensajes existentes por remitente', () => {
    const db = legacyDatabase();
    migrate(db, 2);
    const sequences = db
      .prepare('SELECT sequence FROM messages ORDER BY ledger_seq')
      .all()
      .map((row) => readInteger(row, 'sequence'));
    expect(sequences).toEqual([0, 1, 2]);
  });

  it('la versión 3 se niega a migrar una base con denuncias del formato anterior', () => {
    const db = legacyDatabase();
    expect(() => migrate(db)).toThrow(LEGACY_DATA_MESSAGE);
    // La transacción se revirtió: la base sigue en la versión 2 con sus datos.
    expect(schemaVersion(db)).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS total FROM messages').get()?.total).toBe(3);
  });

  it('la versión 4 se niega a migrar una base con datos de la versión 3', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, 3);
    insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
    expect(() => migrate(db)).toThrow(ROWID_DATA_MESSAGE);
    expect(schemaVersion(db)).toBe(3);
  });

  it('guarda las tablas privadas sin rowid y activa el borrado seguro', () => {
    const db = openDatabase(':memory:');
    for (const table of [
      'complaints',
      'status_changes',
      'messages',
      'identity_openings',
      'evidence',
      'ledger_pending',
    ]) {
      expect(() => db.prepare(`SELECT rowid FROM ${table}`).all(), table).toThrow(/rowid/);
    }
    expect(db.prepare('PRAGMA secure_delete').get()?.secure_delete).toBe(1);
    insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
    expect(db.prepare('SELECT received_month FROM complaints').get()?.received_month).toBe(
      '2026-10',
    );
  });

  it('impide dos denuncias con el mismo authVerifier y dos mensajes con la misma secuencia', () => {
    const db = openDatabase(':memory:');
    insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
    expect(() => insertComplaint(db, 'BBBB-BBBB-BBBB', 'verificador')).toThrow(/UNIQUE/);
    insertMessage(db, 'm0', 0, 0);
    expect(() => insertMessage(db, 'm1', 0, 1)).toThrow(/UNIQUE/);
    expect(() => insertMessage(db, 'm2', 1, 0)).toThrow(/UNIQUE/);
  });

  it('mantiene de solo agregar la bitácora, el buzón, las aperturas, el estatus y los meses', () => {
    const db = openDatabase(':memory:');
    insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
    insertEvent(db, 0);
    insertMessage(db, 'm0', 0, 0);
    db.prepare(
      `INSERT INTO identity_openings (opening_id, folio, position, opened_on, legal_basis)
       VALUES ('o1', 'AAAA-AAAA-AAAA', 0, '2026-10-20', 'fundamento sintético')`,
    ).run();
    db.prepare(
      `INSERT INTO status_changes (folio, position, status, changed_on)
       VALUES ('AAAA-AAAA-AAAA', 0, 'received', '2026-10-20')`,
    ).run();
    db.prepare(
      "INSERT INTO open_data_months (month, cells_json, noise_seed) VALUES ('2026-09', '[]', 'AA')",
    ).run();
    db.prepare(
      `INSERT INTO ledger_pending (pending_id, type, folio_digest, at, actor_role, payload_digest,
         payload_json)
       VALUES ('p1', 'message.sent', 'f', '2026-10-20', 'reporter', 'p', '{}')`,
    ).run();
    const forbidden = [
      "UPDATE ledger_events SET at = '2026-10-21'",
      'DELETE FROM ledger_events',
      "UPDATE messages SET signature = 'y'",
      'DELETE FROM messages',
      "UPDATE identity_openings SET legal_basis = 'otro'",
      'DELETE FROM identity_openings',
      "UPDATE status_changes SET status = 'routed'",
      'DELETE FROM status_changes',
      "UPDATE open_data_months SET cells_json = '[1]'",
      'DELETE FROM open_data_months',
      "UPDATE ledger_pending SET at = '2026-10-19'",
    ];
    for (const sql of forbidden) {
      expect(() => db.exec(sql), sql).toThrow(/solo agregar|no se modifican|no cambian/);
    }
    // Los pendientes sí se borran: pasan a la cadena al cerrar el día.
    db.exec("DELETE FROM ledger_pending WHERE pending_id = 'p1'");
  });
});

describe('withTransaction', () => {
  it('revierte todo si el trabajo lanza error', () => {
    const db = openDatabase(':memory:');
    expect(() =>
      withTransaction(db, () => {
        insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
        throw new Error('falla sintética');
      }),
    ).toThrow('falla sintética');
    expect(db.prepare('SELECT COUNT(*) AS total FROM complaints').get()?.total).toBe(0);
  });
});
