// Registro consultable de cada apertura de identidad con su fundamento legal.
import type { DatabaseSync } from 'node:sqlite';
import type { IdentityAccessEntry } from '@sigilo/contracts';
import { readInteger, readOptionalText, readText } from './database.ts';

/** Operaciones sobre la tabla `identity_openings`. */
export interface IdentityOpeningsRepository {
  insert(folio: string, openingId: string, openedOn: string, legalBasis: string): void;
  /** Aperturas del folio en el orden en que ocurrieron. */
  listByFolio(folio: string): IdentityAccessEntry[];
  countByFolio(folio: string): number;
}

/** Crea el repositorio de aperturas de identidad sobre `db`. */
export function createIdentityOpeningsRepository(db: DatabaseSync): IdentityOpeningsRepository {
  const insertStatement = db.prepare(
    `INSERT INTO identity_openings (opening_id, folio, position, opened_on, legal_basis)
     VALUES (?, ?, (SELECT COALESCE(MAX(position) + 1, 0) FROM identity_openings WHERE folio = ?),
       ?, ?)`,
  );
  // Las aperturas por umbral comparten identificador con su solicitud: se cuentan sus aprobaciones.
  const listStatement = db.prepare(
    `SELECT o.*, (SELECT COUNT(*) FROM identity_approvals AS a WHERE a.request_id = o.opening_id)
       AS approvals,
       (SELECT r.requested_by FROM identity_requests AS r WHERE r.request_id = o.opening_id)
       AS requested_by
     FROM identity_openings AS o WHERE o.folio = ? ORDER BY o.position`,
  );
  const countStatement = db.prepare(
    'SELECT COUNT(*) AS total FROM identity_openings WHERE folio = ?',
  );
  return {
    insert: (folio, openingId, openedOn, legalBasis) => {
      insertStatement.run(openingId, folio, folio, openedOn, legalBasis);
    },
    listByFolio: (folio) =>
      listStatement.all(folio).map((row) => {
        const approvals = readInteger(row, 'approvals');
        return {
          on: readText(row, 'opened_on'),
          // La persona abre su propia identidad para el recurso de inconformidad.
          actorRole:
            readOptionalText(row, 'requested_by') === 'reporter'
              ? ('reporter' as const)
              : ('authority' as const),
          legalBasis: readText(row, 'legal_basis'),
          openingId: readText(row, 'opening_id'),
          ...(approvals > 0 ? { approvalCount: approvals } : {}),
        };
      }),
    countByFolio: (folio) => {
      const row = countStatement.get(folio);
      return row === undefined ? 0 : readInteger(row, 'total');
    },
  };
}
