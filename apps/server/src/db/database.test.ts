// Pruebas de la base: migraciones idempotentes, índice único del recibo y triggers de solo agregar.
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { migrate, openDatabase, readInteger, withTransaction } from './database.ts';
import { MIGRATIONS } from './schema.ts';

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

function insertMessage(db: DatabaseSync, id: string, ledgerSeq: number, sequence?: number): void {
  if (sequence === undefined) {
    db.prepare(
      `INSERT INTO messages (message_id, folio, sender, sent_on, envelope_json, signature,
         ledger_seq)
       VALUES (?, 'AAAA-AAAA-AAAA', 'reporter', '2026-10-20T15:00Z', '{}', 'x', ?)`,
    ).run(id, ledgerSeq);
    return;
  }
  db.prepare(
    `INSERT INTO messages (message_id, folio, sender, sequence, sent_on, envelope_json, signature,
       ledger_seq)
     VALUES (?, 'AAAA-AAAA-AAAA', 'reporter', ?, '2026-10-20T15:00Z', '{}', 'x', ?)`,
  ).run(id, sequence, ledgerSeq);
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
    expect(versions).toEqual([1, 2]);
  });

  it('la versión 2 numera los mensajes existentes por remitente', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY) STRICT;');
    const [first] = MIGRATIONS;
    if (!first) throw new Error('Falta la migración inicial.');
    db.exec(first.sql);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
    insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
    for (const seq of [0, 1, 2]) insertEvent(db, seq);
    for (const seq of [0, 1, 2]) insertMessage(db, `m${seq}`, seq);
    migrate(db);
    const sequences = db
      .prepare('SELECT sequence FROM messages ORDER BY ledger_seq')
      .all()
      .map((row) => readInteger(row, 'sequence'));
    expect(sequences).toEqual([0, 1, 2]);
  });

  it('impide dos denuncias con el mismo authVerifier y dos mensajes con la misma secuencia', () => {
    const db = openDatabase(':memory:');
    insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
    expect(() => insertComplaint(db, 'BBBB-BBBB-BBBB', 'verificador')).toThrow(/UNIQUE/);
    insertEvent(db, 0);
    insertEvent(db, 1);
    insertMessage(db, 'm0', 0, 0);
    expect(() => insertMessage(db, 'm1', 1, 0)).toThrow(/UNIQUE/);
  });

  it('mantiene de solo agregar la bitácora, el buzón y las aperturas de identidad', () => {
    const db = openDatabase(':memory:');
    insertComplaint(db, 'AAAA-AAAA-AAAA', 'verificador');
    insertEvent(db, 0);
    insertEvent(db, 1);
    insertMessage(db, 'm0', 0, 0);
    db.prepare(
      `INSERT INTO identity_openings (ledger_seq, folio, opened_on, legal_basis)
       VALUES (1, 'AAAA-AAAA-AAAA', '2026-10-20', 'fundamento sintético')`,
    ).run();
    const forbidden = [
      "UPDATE ledger_events SET at = '2026-10-21'",
      'DELETE FROM ledger_events',
      "UPDATE messages SET signature = 'y'",
      'DELETE FROM messages',
      "UPDATE identity_openings SET legal_basis = 'otro'",
      'DELETE FROM identity_openings',
    ];
    for (const sql of forbidden) expect(() => db.exec(sql), sql).toThrow(/solo agregar/);
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
