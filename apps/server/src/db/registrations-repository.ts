// Solicitudes de alta de autoridades (`authority_registrations`). Solo la decisión cambia una fila:
// de pendiente a aprobada o rechazada, una sola vez.
import type { DatabaseSync } from 'node:sqlite';
import { RegistrationRequestSchema } from '@sigilo/contracts';
import type { RegistrationRequest, RegistrationStatus } from '@sigilo/contracts';
import { readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/** Solicitud guardada. */
export interface RegistrationRecord {
  requestId: string;
  receivedOn: string;
  request: RegistrationRequest;
  fingerprint: string;
  status: RegistrationStatus;
  decidedOn: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
}

/** Decisión sobre una solicitud pendiente. */
export interface RegistrationDecisionRecord {
  status: 'approved' | 'rejected';
  decidedOn: string;
  decidedBy: string;
  decisionReason: string | null;
}

/** Operaciones sobre `authority_registrations`. */
export interface RegistrationsRepository {
  insert(
    record: Omit<RegistrationRecord, 'status' | 'decidedOn' | 'decidedBy' | 'decisionReason'>,
  ): void;
  find(requestId: string): RegistrationRecord | null;
  /** Todas, de la más reciente a la más antigua. */
  list(): RegistrationRecord[];
  /** Resuelve una solicitud pendiente; `false` si ya estaba resuelta. */
  decide(requestId: string, decision: RegistrationDecisionRecord): boolean;
}

function toStatus(value: string): RegistrationStatus {
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value;
  throw new Error('Estado de solicitud desconocido.');
}

function toRecord(row: Row): RegistrationRecord {
  return {
    requestId: readText(row, 'request_id'),
    receivedOn: readText(row, 'received_on'),
    request: RegistrationRequestSchema.parse(JSON.parse(readText(row, 'request_json'))),
    fingerprint: readText(row, 'fingerprint'),
    status: toStatus(readText(row, 'status')),
    decidedOn: readOptionalText(row, 'decided_on'),
    decidedBy: readOptionalText(row, 'decided_by'),
    decisionReason: readOptionalText(row, 'decision_reason'),
  };
}

/** Crea el repositorio de solicitudes de alta sobre `db`. */
export function createRegistrationsRepository(db: DatabaseSync): RegistrationsRepository {
  const insertStatement = db.prepare(
    `INSERT INTO authority_registrations (request_id, received_on, request_json, fingerprint, status)
     VALUES (?, ?, ?, ?, 'pending')`,
  );
  const findStatement = db.prepare('SELECT * FROM authority_registrations WHERE request_id = ?');
  const listStatement = db.prepare(
    'SELECT * FROM authority_registrations ORDER BY received_on DESC, request_id',
  );
  const decideStatement = db.prepare(
    `UPDATE authority_registrations
     SET status = ?, decided_on = ?, decided_by = ?, decision_reason = ?
     WHERE request_id = ? AND status = 'pending'`,
  );
  return {
    insert(record) {
      insertStatement.run(
        record.requestId,
        record.receivedOn,
        JSON.stringify(record.request),
        record.fingerprint,
      );
    },
    find(requestId) {
      const row = findStatement.get(requestId);
      return row === undefined ? null : toRecord(row);
    },
    list() {
      return listStatement.all().map(toRecord);
    },
    decide(requestId, decision) {
      const result = decideStatement.run(
        decision.status,
        decision.decidedOn,
        decision.decidedBy,
        decision.decisionReason,
        requestId,
      );
      return Number(result.changes) === 1;
    },
  };
}
