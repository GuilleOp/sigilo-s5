// Esquema SQL de la base de datos, expresado como migraciones numeradas y ordenadas.

import type { DatabaseSync } from 'node:sqlite';

/** Migración: versión, SQL que la aplica y, si hace falta, una comprobación previa. */
export interface Migration {
  version: number;
  sql: string;
  /** Lanza error si la base no puede migrarse; se ejecuta dentro de la transacción. */
  precheck?: (db: DatabaseSync) => void;
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

// Seguridad: un recibo identifica a una sola denuncia; repetir el `authVerifier` permitiría
// trasplantar el sobre de identidad de otra denuncia. La secuencia del buzón impide repetir o
// reordenar mensajes, y las aperturas de identidad y los mensajes quedan de solo agregar.
const RECEIPT_AND_MAILBOX_INTEGRITY = `
CREATE UNIQUE INDEX complaints_by_auth_verifier ON complaints (auth_verifier);

ALTER TABLE messages ADD COLUMN sequence INTEGER NOT NULL DEFAULT 0;
UPDATE messages SET sequence = (
  SELECT COUNT(*) FROM messages AS earlier
  WHERE earlier.folio = messages.folio
    AND earlier.sender = messages.sender
    AND earlier.ledger_seq < messages.ledger_seq
);
CREATE UNIQUE INDEX messages_by_sender_sequence ON messages (folio, sender, sequence);

CREATE INDEX evidence_pending_by_day ON evidence (uploaded_on) WHERE folio IS NULL;
CREATE INDEX ledger_events_by_day ON ledger_events (at, seq);

CREATE TRIGGER messages_no_update BEFORE UPDATE ON messages
BEGIN
  SELECT RAISE(ABORT, 'El buzón es de solo agregar.');
END;
CREATE TRIGGER messages_no_delete BEFORE DELETE ON messages
BEGIN
  SELECT RAISE(ABORT, 'El buzón es de solo agregar.');
END;
CREATE TRIGGER identity_openings_no_update BEFORE UPDATE ON identity_openings
BEGIN
  SELECT RAISE(ABORT, 'El registro de aperturas es de solo agregar.');
END;
CREATE TRIGGER identity_openings_no_delete BEFORE DELETE ON identity_openings
BEGIN
  SELECT RAISE(ABORT, 'El registro de aperturas es de solo agregar.');
END;
`;

// Seguridad: los eventos de cada día quedan pendientes, sin secuencia, hasta que el día cierra y se
// encadenan en orden barajado; nada más en la base guarda su secuencia. El historial de estatus,
// los mensajes y las aperturas llevan su propio orden privado. Los datos abiertos de cada mes se
// guardan una sola vez. Cambia el formato del comprobante, así que exige una base sin denuncias.
const DAILY_SHUFFLED_LEDGER = `
DROP TRIGGER messages_no_update;
DROP TRIGGER messages_no_delete;
DROP TRIGGER identity_openings_no_update;
DROP TRIGGER identity_openings_no_delete;
DROP TRIGGER ledger_events_no_update;
DROP TRIGGER ledger_events_no_delete;
DROP TABLE identity_openings;
DROP TABLE messages;
DROP TABLE ledger_events;
CREATE TABLE ledger_events (
  seq INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  folio_digest TEXT NOT NULL,
  at TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  receipt_tag TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL
) STRICT;
CREATE INDEX ledger_events_by_folio ON ledger_events (folio_digest, seq);
CREATE INDEX ledger_events_by_tag ON ledger_events (receipt_tag) WHERE receipt_tag IS NOT NULL;
CREATE TRIGGER ledger_events_no_update BEFORE UPDATE ON ledger_events
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es de solo agregar.');
END;
CREATE TRIGGER ledger_events_no_delete BEFORE DELETE ON ledger_events
BEGIN
  SELECT RAISE(ABORT, 'La bitácora es de solo agregar.');
END;
CREATE TABLE ledger_pending (
  pending_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  folio_digest TEXT NOT NULL,
  at TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  receipt_tag TEXT,
  payload_json TEXT NOT NULL
) STRICT;
CREATE INDEX ledger_pending_by_day ON ledger_pending (at);
CREATE INDEX ledger_pending_by_folio ON ledger_pending (folio_digest);
CREATE TRIGGER ledger_pending_no_update BEFORE UPDATE ON ledger_pending
BEGIN
  SELECT RAISE(ABORT, 'Los eventos pendientes no se modifican.');
END;
CREATE TABLE messages (
  message_id TEXT PRIMARY KEY,
  folio TEXT NOT NULL REFERENCES complaints (folio),
  sender TEXT NOT NULL CHECK (sender IN ('authority', 'reporter')),
  sequence INTEGER NOT NULL,
  position INTEGER NOT NULL,
  sent_on TEXT NOT NULL,
  envelope_json TEXT NOT NULL,
  signature TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX messages_by_sender_sequence ON messages (folio, sender, sequence);
CREATE UNIQUE INDEX messages_by_position ON messages (folio, position);
CREATE TRIGGER messages_no_update BEFORE UPDATE ON messages
BEGIN
  SELECT RAISE(ABORT, 'El buzón es de solo agregar.');
END;
CREATE TRIGGER messages_no_delete BEFORE DELETE ON messages
BEGIN
  SELECT RAISE(ABORT, 'El buzón es de solo agregar.');
END;
CREATE TABLE identity_openings (
  opening_id TEXT PRIMARY KEY,
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  opened_on TEXT NOT NULL,
  legal_basis TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX identity_openings_by_folio ON identity_openings (folio, position);
CREATE TRIGGER identity_openings_no_update BEFORE UPDATE ON identity_openings
BEGIN
  SELECT RAISE(ABORT, 'El registro de aperturas es de solo agregar.');
END;
CREATE TRIGGER identity_openings_no_delete BEFORE DELETE ON identity_openings
BEGIN
  SELECT RAISE(ABORT, 'El registro de aperturas es de solo agregar.');
END;
CREATE TABLE status_changes (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  status TEXT NOT NULL,
  changed_on TEXT NOT NULL,
  PRIMARY KEY (folio, position)
) STRICT;
CREATE TRIGGER status_changes_no_update BEFORE UPDATE ON status_changes
BEGIN
  SELECT RAISE(ABORT, 'El historial de estatus es de solo agregar.');
END;
CREATE TRIGGER status_changes_no_delete BEFORE DELETE ON status_changes
BEGIN
  SELECT RAISE(ABORT, 'El historial de estatus es de solo agregar.');
END;
CREATE TABLE open_data_months (
  month TEXT PRIMARY KEY,
  cells_json TEXT NOT NULL
) STRICT;
CREATE TRIGGER open_data_months_no_update BEFORE UPDATE ON open_data_months
BEGIN
  SELECT RAISE(ABORT, 'Los datos abiertos de un mes cerrado no cambian.');
END;
CREATE TRIGGER open_data_months_no_delete BEFORE DELETE ON open_data_months
BEGIN
  SELECT RAISE(ABORT, 'Los datos abiertos de un mes cerrado no cambian.');
END;
ALTER TABLE complaints ADD COLUMN has_been_tracked INTEGER NOT NULL DEFAULT 0
  CHECK (has_been_tracked IN (0, 1));
ALTER TABLE evidence ADD COLUMN is_stored INTEGER NOT NULL DEFAULT 1 CHECK (is_stored IN (0, 1));
`;

/** Mensaje de la migración 3 cuando la base ya tiene denuncias del formato anterior. */
export const LEGACY_DATA_MESSAGE =
  'La base tiene denuncias con el formato anterior del comprobante y la bitácora; ejecuta npm run demo:reset -- --yes antes de arrancar.';

function assertNoLegacyData(db: DatabaseSync): void {
  const row = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM complaints) + (SELECT COUNT(*) FROM ledger_events)
         + (SELECT COUNT(*) FROM messages) + (SELECT COUNT(*) FROM identity_openings) AS total`,
    )
    .get();
  if (Number(row?.total ?? 0) > 0) throw new Error(LEGACY_DATA_MESSAGE);
}

/** Migraciones en orden de aplicación. Nunca se editan: se agregan nuevas. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: INITIAL_SCHEMA },
  { version: 2, sql: RECEIPT_AND_MAILBOX_INTEGRITY },
  { version: 3, sql: DAILY_SHUFFLED_LEDGER, precheck: assertNoLegacyData },
];

/** Versión más reciente del esquema. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;
