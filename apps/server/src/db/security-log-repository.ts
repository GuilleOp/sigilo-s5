// Registro de seguridad de las cuentas de la autoridad (ASVS V7.1.3, V7.2.1): inicios de sesión,
// fallos, cierres, accesos denegados por función y entregas de sobres. Nunca guarda IP, agente de
// usuario, contraseñas ni el usuario tecleado: solo el seudónimo de la cuenta cuando existe.
import type { DatabaseSync } from 'node:sqlite';
import { randomBytes, toHex } from '@sigilo/core';
import { readOptionalText, readText } from './database.ts';
import type { Row } from './database.ts';

/** Tipos de evento de seguridad. */
export const SECURITY_EVENT_KINDS = [
  'login_succeeded',
  'login_failed',
  'login_rate_limited',
  'logout',
  'session_expired',
  'function_denied',
  'identity_envelope_released',
  'escalation_envelope_released',
] as const;

/** Tipo de evento de seguridad. */
export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

function toKind(value: string): SecurityEventKind {
  const kind = SECURITY_EVENT_KINDS.find((candidate) => candidate === value);
  if (kind === undefined) throw new Error('Evento de seguridad desconocido.');
  return kind;
}

/** Evento de seguridad. `at` va redondeado al minuto (UTC). */
export interface SecurityEvent {
  at: string;
  kind: SecurityEventKind;
  accountId: string | null;
  /** Digesto del folio (`folioDigest`) cuando el evento es sobre una denuncia. */
  folioDigest: string | null;
}

/** Operaciones sobre `authority_security_events`. */
export interface SecurityLogRepository {
  insert(event: SecurityEvent): void;
  /** Eventos de la cuenta (o, con `null`, de cuentas desconocidas), del más antiguo al más reciente. */
  listByAccount(accountId: string | null): SecurityEvent[];
  /** Todos los eventos (para pruebas y auditoría local). */
  listAll(): SecurityEvent[];
}

function toEvent(row: Row): SecurityEvent {
  return {
    at: readText(row, 'at'),
    kind: toKind(readText(row, 'kind')),
    accountId: readOptionalText(row, 'account_id'),
    folioDigest: readOptionalText(row, 'folio_digest'),
  };
}

/** Crea el repositorio del registro de seguridad sobre `db`. */
export function createSecurityLogRepository(db: DatabaseSync): SecurityLogRepository {
  const insertStatement = db.prepare(
    `INSERT INTO authority_security_events (event_id, at, kind, account_id, folio_digest)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const byAccountStatement = db.prepare(
    'SELECT * FROM authority_security_events WHERE account_id IS ? ORDER BY at, event_id',
  );
  const allStatement = db.prepare('SELECT * FROM authority_security_events ORDER BY at, event_id');
  return {
    insert: (event) => {
      // El identificador aleatorio no conserva el orden de llegada dentro del minuto.
      insertStatement.run(
        toHex(randomBytes(16)),
        event.at,
        event.kind,
        event.accountId,
        event.folioDigest,
      );
    },
    listByAccount: (accountId) => byAccountStatement.all(accountId).map(toEvent),
    listAll: () => allStatement.all().map(toEvent),
  };
}
