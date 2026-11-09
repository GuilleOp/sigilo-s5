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

// Seguridad: en una tabla con `rowid`, el `rowid` crece con cada inserción y conserva el orden de
// llegada aunque la llave sea aleatoria; quien copie la base reconstruiría el orden que la
// bitácora baraja. Las tablas privadas pasan a `WITHOUT ROWID`, ordenadas físicamente por su llave
// aleatoria (o por folio y posición). La columna de mes indexada sirve a los datos abiertos sin
// recorrer la tabla, y `has_been_tracked` desaparece: el seguimiento ya no exime de la retención.
// Cada mes congelado guarda su semilla secreta de ruido. Exige una base sin datos, como la 3.
const RANDOM_ORDER_STORAGE = `
DROP TABLE evidence;
DROP TABLE messages;
DROP TABLE identity_openings;
DROP TABLE status_changes;
DROP TABLE ledger_pending;
DROP TABLE open_data_months;
DROP TABLE complaints;
CREATE TABLE complaints (
  folio TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('anonymous', 'sealed')),
  status TEXT NOT NULL,
  received_on TEXT NOT NULL,
  received_month TEXT GENERATED ALWAYS AS (substr(received_on, 1, 7)) VIRTUAL,
  state_code TEXT NOT NULL,
  offense_code TEXT NOT NULL,
  protection_requested INTEGER NOT NULL CHECK (protection_requested IN (0, 1)),
  facts_json TEXT NOT NULL,
  sealed_identity_json TEXT,
  reporter_box_public_key TEXT NOT NULL,
  reporter_signing_public_key TEXT NOT NULL,
  auth_verifier TEXT NOT NULL,
  receipt_json TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE UNIQUE INDEX complaints_by_auth_verifier ON complaints (auth_verifier);
CREATE INDEX complaints_by_day ON complaints (received_on);
CREATE INDEX complaints_by_month ON complaints (received_month);
CREATE INDEX complaints_by_status_day ON complaints (status, received_on);
CREATE TABLE evidence (
  evidence_id TEXT PRIMARY KEY,
  media_type TEXT NOT NULL CHECK (media_type IN ('image/jpeg', 'image/png')),
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_on TEXT NOT NULL,
  folio TEXT REFERENCES complaints (folio),
  position INTEGER,
  is_stored INTEGER NOT NULL DEFAULT 1 CHECK (is_stored IN (0, 1))
) STRICT, WITHOUT ROWID;
CREATE INDEX evidence_by_folio ON evidence (folio, position);
CREATE INDEX evidence_pending_by_day ON evidence (uploaded_on) WHERE folio IS NULL;
CREATE TABLE ledger_pending (
  pending_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  folio_digest TEXT NOT NULL,
  at TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  receipt_tag TEXT,
  payload_json TEXT NOT NULL
) STRICT, WITHOUT ROWID;
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
) STRICT, WITHOUT ROWID;
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
) STRICT, WITHOUT ROWID;
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
) STRICT, WITHOUT ROWID;
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
  cells_json TEXT NOT NULL,
  noise_seed TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE TRIGGER open_data_months_no_update BEFORE UPDATE ON open_data_months
BEGIN
  SELECT RAISE(ABORT, 'Los datos abiertos de un mes cerrado no cambian.');
END;
CREATE TRIGGER open_data_months_no_delete BEFORE DELETE ON open_data_months
BEGIN
  SELECT RAISE(ABORT, 'Los datos abiertos de un mes cerrado no cambian.');
END;
`;

/** Mensaje de la migración 4 cuando la base ya tiene datos guardados con `rowid`. */
export const ROWID_DATA_MESSAGE =
  'La base tiene datos guardados en el orden de llegada (formato anterior); ejecuta npm run demo:reset -- --yes antes de arrancar.';

function assertNoRowidData(db: DatabaseSync): void {
  const tables = [
    'complaints',
    'evidence',
    'messages',
    'identity_openings',
    'status_changes',
    'ledger_pending',
    'ledger_events',
    'open_data_months',
  ];
  const total = tables.reduce((sum, table) => {
    const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get();
    return sum + Number(row?.total ?? 0);
  }, 0);
  if (total > 0) throw new Error(ROWID_DATA_MESSAGE);
}

// Migración 5: la 3 recreó `ledger_events` sin el índice por día, así que `lastBefore` (la consulta
// `since`, el cierre a medias) recorría la tabla completa. Con el índice, su costo es logarítmico.
const LEDGER_EVENTS_BY_DAY = `
CREATE INDEX ledger_events_by_day ON ledger_events (at, seq);
`;

// Migración 6: registro de solo agregar de los descartes de pruebas por la autoridad, que la
// persona denunciante ve en su seguimiento. El índice de estatus y día ya sirve a la retención de
// `received` y `archived`.
const EVIDENCE_DISCARDS = `
CREATE TABLE evidence_discards (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  discarded_on TEXT NOT NULL,
  evidence_count INTEGER NOT NULL CHECK (evidence_count > 0),
  PRIMARY KEY (folio, position)
) STRICT, WITHOUT ROWID;
CREATE TRIGGER evidence_discards_no_update BEFORE UPDATE ON evidence_discards
BEGIN
  SELECT RAISE(ABORT, 'El registro de descartes es de solo agregar.');
END;
CREATE TRIGGER evidence_discards_no_delete BEFORE DELETE ON evidence_discards
BEGIN
  SELECT RAISE(ABORT, 'El registro de descartes es de solo agregar.');
END;
`;

// Migración 7: nodo de varias autoridades. Cada denuncia guarda la autoridad que la tiene, su
// estado en el flujo de gestión y su etapa legal, el día legal de recepción (hora del centro) y la
// segunda llave. Registros de solo agregar: pasos del trámite (con su nota pública), acuerdos de
// cierre, solicitudes y aprobaciones de apertura de identidad (una persona aprueba una sola vez
// por solicitud: lo impide el índice único), reglas públicas cumplidas y eventos de seguridad de
// las cuentas (sin IP ni agente de usuario). Las denuncias anteriores quedan en el buzón general.
const MULTI_AUTHORITY_NODE = `
ALTER TABLE complaints ADD COLUMN received_legal_on TEXT;
UPDATE complaints SET received_legal_on = received_on;
ALTER TABLE complaints ADD COLUMN assigned_authority TEXT;
ALTER TABLE complaints ADD COLUMN management_state TEXT NOT NULL DEFAULT 'received_in_inbox';
ALTER TABLE complaints ADD COLUMN legal_stage TEXT;
ALTER TABLE complaints ADD COLUMN closure_reason TEXT;
ALTER TABLE complaints ADD COLUMN escalation_envelope_json TEXT;
CREATE INDEX complaints_by_authority ON complaints (assigned_authority, received_on);
CREATE INDEX complaints_by_management_state ON complaints (management_state);

CREATE TABLE procedure_steps (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  action TEXT NOT NULL,
  step_on TEXT NOT NULL,
  legal_on TEXT NOT NULL,
  management_state TEXT NOT NULL,
  legal_stage TEXT,
  closure_reason TEXT,
  authority_id TEXT NOT NULL,
  actor_id TEXT,
  note TEXT,
  PRIMARY KEY (folio, position)
) STRICT, WITHOUT ROWID;
CREATE TRIGGER procedure_steps_no_update BEFORE UPDATE ON procedure_steps
BEGIN
  SELECT RAISE(ABORT, 'Los pasos del trámite son de solo agregar.');
END;
CREATE TRIGGER procedure_steps_no_delete BEFORE DELETE ON procedure_steps
BEGIN
  SELECT RAISE(ABORT, 'Los pasos del trámite son de solo agregar.');
END;

CREATE TABLE closure_agreements (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  authority_id TEXT NOT NULL,
  closed_on TEXT NOT NULL,
  legal_on TEXT NOT NULL,
  reason TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  agreement TEXT NOT NULL,
  agreement_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  PRIMARY KEY (folio, position)
) STRICT, WITHOUT ROWID;
CREATE INDEX closure_agreements_by_authority ON closure_agreements (authority_id, closed_on);
CREATE TRIGGER closure_agreements_no_update BEFORE UPDATE ON closure_agreements
BEGIN
  SELECT RAISE(ABORT, 'Los acuerdos de cierre son de solo agregar.');
END;
CREATE TRIGGER closure_agreements_no_delete BEFORE DELETE ON closure_agreements
BEGIN
  SELECT RAISE(ABORT, 'Los acuerdos de cierre son de solo agregar.');
END;

CREATE TABLE identity_requests (
  request_id TEXT PRIMARY KEY,
  folio TEXT NOT NULL REFERENCES complaints (folio),
  authority_id TEXT NOT NULL,
  requested_on TEXT NOT NULL,
  legal_basis TEXT NOT NULL,
  requested_by TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX identity_requests_by_folio ON identity_requests (folio);
CREATE TRIGGER identity_requests_no_update BEFORE UPDATE ON identity_requests
BEGIN
  SELECT RAISE(ABORT, 'Las solicitudes de apertura son de solo agregar.');
END;
CREATE TRIGGER identity_requests_no_delete BEFORE DELETE ON identity_requests
BEGIN
  SELECT RAISE(ABORT, 'Las solicitudes de apertura son de solo agregar.');
END;

CREATE TABLE identity_approvals (
  approval_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES identity_requests (request_id),
  account_id TEXT NOT NULL,
  approved_on TEXT NOT NULL,
  legal_basis TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE UNIQUE INDEX identity_approvals_one_per_account ON identity_approvals (request_id, account_id);
CREATE TRIGGER identity_approvals_no_update BEFORE UPDATE ON identity_approvals
BEGIN
  SELECT RAISE(ABORT, 'Las aprobaciones de apertura son de solo agregar.');
END;
CREATE TRIGGER identity_approvals_no_delete BEFORE DELETE ON identity_approvals
BEGIN
  SELECT RAISE(ABORT, 'Las aprobaciones de apertura son de solo agregar.');
END;

CREATE TABLE rule_triggers (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  rule_key TEXT NOT NULL,
  anchor_on TEXT NOT NULL,
  triggered_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('escalate', 'alert')),
  authority_id TEXT NOT NULL,
  supervisor_id TEXT,
  PRIMARY KEY (folio, rule_key, anchor_on)
) STRICT, WITHOUT ROWID;
CREATE INDEX rule_triggers_by_supervisor ON rule_triggers (supervisor_id, triggered_on)
  WHERE effect = 'escalate';
CREATE TRIGGER rule_triggers_no_update BEFORE UPDATE ON rule_triggers
BEGIN
  SELECT RAISE(ABORT, 'Las reglas cumplidas son de solo agregar.');
END;
CREATE TRIGGER rule_triggers_no_delete BEFORE DELETE ON rule_triggers
BEGIN
  SELECT RAISE(ABORT, 'Las reglas cumplidas son de solo agregar.');
END;

CREATE TABLE authority_security_events (
  event_id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  account_id TEXT,
  folio_digest TEXT
) STRICT, WITHOUT ROWID;
CREATE INDEX authority_security_events_by_account ON authority_security_events (account_id, at);
CREATE TRIGGER authority_security_events_no_update BEFORE UPDATE ON authority_security_events
BEGIN
  SELECT RAISE(ABORT, 'El registro de seguridad es de solo agregar.');
END;
CREATE TRIGGER authority_security_events_no_delete BEFORE DELETE ON authority_security_events
BEGIN
  SELECT RAISE(ABORT, 'El registro de seguridad es de solo agregar.');
END;
`;

// Migración 8: integración de la red, el contexto de la PDN, el auditor y la corroboración. Todo es
// de solo agregar: revisiones de conflicto de interés, verificaciones de sanciones, señales del
// auditor, registros pendientes y estado de corroboración (lo que dice el índice) y turnados a otro
// nodo con su comprobante. El estado de la corroboración se agrega como filas nuevas: la vigente es
// la más reciente.
/**
 * Migración 9: calificación de la falta con su acuerdo (LGRA, art. 100) y recurso de inconformidad
 * de la persona denunciante (arts. 102 a 110), ambos de solo agregar; calificación de los acuerdos
 * importados.
 */
/**
 * Migración 10 (revisión de seguridad de la Etapa 5): secuencia del buzón de la autoridad al
 * momento de cada archivo y calificación, para que solo un mensaje posterior cuente como su
 * notificación (H6); un folio destino por turnado (H1) y
 * su vencimiento; entregas del sobre de identidad (H7).
 */
/**
 * Migración 12 (H3): confirmación ante el índice cuando la autoridad acepta la denuncia y baja
 * firmada al cerrarla como improcedente o acumulada.
 */
const CORROBORATION_CONFIRMATION = `
ALTER TABLE corroboration_registrations ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0
  CHECK (confirmed IN (0, 1));
ALTER TABLE corroboration_registrations ADD COLUMN withdrawal_reason TEXT
  CHECK (withdrawal_reason IS NULL OR withdrawal_reason IN ('spam', 'inadmissible', 'duplicate'));
ALTER TABLE corroboration_registrations ADD COLUMN withdrawn INTEGER NOT NULL DEFAULT 0
  CHECK (withdrawn IN (0, 1));
`;

/**
 * Migración 13: digesto de la corroboración ciega de cada denuncia, para que la autoridad recalcule
 * el digesto de la solicitud sin ver la etiqueta.
 */
const CORROBORATION_DIGEST = `
ALTER TABLE complaints ADD COLUMN corroboration_digest TEXT;
`;

/** Migración 11: nota pública del turnado, que la persona lee cuando llega el comprobante (H1). */
const TRANSFER_NOTE = `
ALTER TABLE transfers ADD COLUMN note TEXT;
`;

const SECURITY_REVIEW = `
CREATE TABLE act_instants (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  act TEXT NOT NULL CHECK (act IN ('closure', 'qualification')),
  authority_sequence INTEGER NOT NULL,
  PRIMARY KEY (folio, act, authority_sequence)
) STRICT, WITHOUT ROWID;
CREATE TRIGGER act_instants_no_update BEFORE UPDATE ON act_instants
BEGIN
  SELECT RAISE(ABORT, 'Los actos registrados son de solo agregar.');
END;
CREATE UNIQUE INDEX transfers_target_folio ON transfers (to_node, target_folio)
  WHERE target_folio IS NOT NULL;
CREATE TABLE identity_releases (
  release_id TEXT PRIMARY KEY,
  folio TEXT NOT NULL REFERENCES complaints (folio),
  opening_id TEXT NOT NULL,
  released_on TEXT NOT NULL,
  actor_id TEXT NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX identity_releases_by_folio ON identity_releases (folio);
CREATE TRIGGER identity_releases_no_update BEFORE UPDATE ON identity_releases
BEGIN
  SELECT RAISE(ABORT, 'Las entregas de identidad son de solo agregar.');
END;
CREATE TRIGGER identity_releases_no_delete BEFORE DELETE ON identity_releases
BEGIN
  SELECT RAISE(ABORT, 'Las entregas de identidad son de solo agregar.');
END;
`;

const QUALIFICATION_AND_APPEAL = `
CREATE TABLE qualifications (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  authority_id TEXT NOT NULL,
  on_day TEXT NOT NULL,
  legal_on TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('serious', 'non_serious')),
  legal_basis TEXT NOT NULL,
  agreement TEXT NOT NULL,
  agreement_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  PRIMARY KEY (folio, position)
) STRICT, WITHOUT ROWID;
CREATE TRIGGER qualifications_no_update BEFORE UPDATE ON qualifications
BEGIN
  SELECT RAISE(ABORT, 'Las calificaciones son de solo agregar.');
END;
CREATE TRIGGER qualifications_no_delete BEFORE DELETE ON qualifications
BEGIN
  SELECT RAISE(ABORT, 'Las calificaciones son de solo agregar.');
END;
CREATE TABLE appeals (
  appeal_id TEXT PRIMARY KEY,
  folio TEXT NOT NULL UNIQUE REFERENCES complaints (folio),
  filed_on TEXT NOT NULL,
  legal_on TEXT NOT NULL,
  reasons TEXT NOT NULL,
  opening_id TEXT NOT NULL,
  qualification_position INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
CREATE TRIGGER appeals_no_update BEFORE UPDATE ON appeals
BEGIN
  SELECT RAISE(ABORT, 'Las inconformidades son de solo agregar.');
END;
CREATE TRIGGER appeals_no_delete BEFORE DELETE ON appeals
BEGIN
  SELECT RAISE(ABORT, 'Las inconformidades son de solo agregar.');
END;
ALTER TABLE imported_acts ADD COLUMN qualification TEXT
  CHECK (qualification IS NULL OR qualification IN ('serious', 'non_serious'));
`;

const NETWORK_AND_CONTEXT = `
CREATE TABLE conflict_reviews (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  authority_id TEXT NOT NULL,
  checked_on TEXT NOT NULL,
  legal_on TEXT NOT NULL,
  outcome TEXT NOT NULL,
  requires_response INTEGER NOT NULL CHECK (requires_response IN (0, 1)),
  check_json TEXT NOT NULL,
  PRIMARY KEY (folio, position)
) STRICT, WITHOUT ROWID;
CREATE TABLE sanction_checks (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  checked_on TEXT NOT NULL,
  outcome TEXT NOT NULL,
  explanation TEXT NOT NULL,
  unverifiable INTEGER NOT NULL CHECK (unverifiable IN (0, 1)),
  claim_json TEXT NOT NULL,
  PRIMARY KEY (folio, position)
) STRICT, WITHOUT ROWID;
CREATE TABLE audit_signals (
  signal_id TEXT PRIMARY KEY,
  subject_key TEXT NOT NULL,
  folio TEXT,
  authority_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  flagged_on TEXT NOT NULL,
  signal_json TEXT NOT NULL,
  record_digest TEXT NOT NULL,
  UNIQUE (rule_id, subject_key, signal_key)
) STRICT, WITHOUT ROWID;
CREATE INDEX audit_signals_by_folio ON audit_signals (folio);
CREATE TABLE corroboration_registrations (
  folio TEXT PRIMARY KEY REFERENCES complaints (folio),
  epoch INTEGER NOT NULL,
  tag TEXT NOT NULL,
  similarity TEXT,
  received_at TEXT NOT NULL,
  entry TEXT NOT NULL CHECK (entry IN ('relay', 'direct')),
  folio_digest TEXT NOT NULL UNIQUE,
  registered INTEGER NOT NULL DEFAULT 0 CHECK (registered IN (0, 1))
) STRICT, WITHOUT ROWID;
CREATE TABLE corroboration_status (
  folio TEXT NOT NULL REFERENCES complaints (folio),
  position INTEGER NOT NULL,
  updated_on TEXT NOT NULL,
  complaints INTEGER NOT NULL,
  independent_sources INTEGER NOT NULL,
  is_possible_campaign INTEGER NOT NULL CHECK (is_possible_campaign IN (0, 1)),
  new_indication_on TEXT,
  PRIMARY KEY (folio, position)
) STRICT, WITHOUT ROWID;
CREATE TABLE corroboration_cursor (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  after_seq INTEGER NOT NULL
) STRICT;
CREATE TABLE transfers (
  transfer_id TEXT PRIMARY KEY,
  folio TEXT NOT NULL REFERENCES complaints (folio),
  to_authority TEXT NOT NULL,
  to_node TEXT NOT NULL,
  transferred_on TEXT NOT NULL,
  relay_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  target_folio TEXT,
  target_receipt_json TEXT
) STRICT, WITHOUT ROWID;
CREATE INDEX transfers_by_folio ON transfers (folio);
CREATE TABLE imported_acts (
  act_id TEXT PRIMARY KEY,
  authority_id TEXT NOT NULL,
  file_number TEXT NOT NULL,
  issued_on TEXT NOT NULL,
  reason TEXT,
  agreement TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  UNIQUE (authority_id, file_number)
) STRICT, WITHOUT ROWID;
CREATE TRIGGER imported_acts_no_update BEFORE UPDATE ON imported_acts
BEGIN
  SELECT RAISE(ABORT, 'Los acuerdos importados son de solo agregar.');
END;
CREATE TRIGGER conflict_reviews_no_update BEFORE UPDATE ON conflict_reviews
BEGIN
  SELECT RAISE(ABORT, 'Las revisiones de conflicto son de solo agregar.');
END;
CREATE TRIGGER sanction_checks_no_update BEFORE UPDATE ON sanction_checks
BEGIN
  SELECT RAISE(ABORT, 'Las verificaciones de sanciones son de solo agregar.');
END;
CREATE TRIGGER audit_signals_no_update BEFORE UPDATE ON audit_signals
BEGIN
  SELECT RAISE(ABORT, 'Las señales del auditor son de solo agregar.');
END;
CREATE TRIGGER corroboration_status_no_update BEFORE UPDATE ON corroboration_status
BEGIN
  SELECT RAISE(ABORT, 'El estado de corroboración es de solo agregar.');
END;
`;

/**
 * Migración 14: solicitudes de alta de autoridades (pasos 1 y 3 del protocolo de alta). La
 * solicitud se guarda como JSON validado; la decisión registra el seudónimo de la cuenta de
 * operación, el día y, al rechazar, el motivo.
 */
const AUTHORITY_REGISTRATIONS = `
CREATE TABLE authority_registrations (
  request_id TEXT PRIMARY KEY,
  received_on TEXT NOT NULL,
  request_json TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_on TEXT,
  decided_by TEXT,
  decision_reason TEXT
) WITHOUT ROWID;
`;

/** Migraciones en orden de aplicación. Nunca se editan: se agregan nuevas. */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: INITIAL_SCHEMA },
  { version: 2, sql: RECEIPT_AND_MAILBOX_INTEGRITY },
  { version: 3, sql: DAILY_SHUFFLED_LEDGER, precheck: assertNoLegacyData },
  { version: 4, sql: RANDOM_ORDER_STORAGE, precheck: assertNoRowidData },
  { version: 5, sql: LEDGER_EVENTS_BY_DAY },
  { version: 6, sql: EVIDENCE_DISCARDS },
  { version: 7, sql: MULTI_AUTHORITY_NODE },
  { version: 8, sql: NETWORK_AND_CONTEXT },
  { version: 9, sql: QUALIFICATION_AND_APPEAL },
  { version: 10, sql: SECURITY_REVIEW },
  { version: 11, sql: TRANSFER_NOTE },
  { version: 12, sql: CORROBORATION_CONFIRMATION },
  { version: 13, sql: CORROBORATION_DIGEST },
  { version: 14, sql: AUTHORITY_REGISTRATIONS },
];

/** Versión más reciente del esquema. */
export const LATEST_SCHEMA_VERSION = MIGRATIONS.at(-1)?.version ?? 0;
