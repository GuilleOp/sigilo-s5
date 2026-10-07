// Esquema SQL de la base de datos, expresado como migraciones numeradas y ordenadas.

/** Migración: versión y SQL que la aplica. */
export interface Migration {
  version: number;
  sql: string;
}

const INITIAL_SCHEMA = `
CREATE TABLE complaints (
  folio TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('anonymous', 'sealed')),
  status TEXT NOT NULL,
  received_on TEXT NOT NULL,
  state_code TEXT NOT NULL,
  offense_code TEXT NOT NULL,
  protection_requested INTEGER NOT NULL CHECK (protection_requested IN (0, 1)),
  facts_json TEXT NOT NULL,
  sealed_identity_json TEXT,
  reporter_box_public_key TEXT NOT NULL,
  reporter_signing_public_key TEXT NOT NULL,
  auth_verifier TEXT NOT NULL,
  receipt_json TEXT NOT NULL
) STRICT;

CREATE TABLE evidence (
  evidence_id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png')),
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_on TEXT NOT NULL,
  folio TEXT REFERENCES complaints (folio),
  position INTEGER
) STRICT;
CREATE INDEX evidence_by_folio ON evidence (folio, position);

CREATE TABLE ledger_events (
  seq INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  folio_digest TEXT NOT NULL,
  at TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL
) STRICT;
CREATE INDEX ledger_events_by_folio ON ledger_events (folio_digest, seq);

-- Seguridad: la bitácora es de solo agregar también a nivel de base de datos.
CREATE TRIGGER ledger_events_no_update BEFORE UPDATE ON ledger_events
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es de solo agregar.');
END;
CREATE TRIGGER ledger_events_no_delete BEFORE DELETE ON ledger_events
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es de solo agregar.');
END;

CREATE TABLE messages (
  message_id TEXT PRIMARY KEY,
  folio TEXT NOT NULL REFERENCES complaints (folio),
  sender TEXT NOT NULL CHECK (sender IN ('authority', 'reporter')),
  sent_on TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  ledger_seq INTEGER NOT NULL REFERENCES ledger_events (seq)
) STRICT;
CREATE INDEX messages_by_folio ON messages (folio, ledger_seq);

CREATE TABLE identity_openings (
  ledger_seq INTEGER PRIMARY KEY REFERENCES ledger_events (seq),
  folio TEXT NOT NULL REFERENCES complaints (folio),
  opened_on TEXT NOT NULL,
  legal_basis TEXT NOT NULL
) STRICT;
CREATE INDEX identity_openings_by_folio ON identity_openings (folio, ledger_seq);
`;

/** Migraciones en orden de aplicación. Nunca se editan: se agregan nuevas. */
export const MIGRATIONS: readonly Migration[] = [{ version: 1, sql: INITIAL_SCHEMA }];
