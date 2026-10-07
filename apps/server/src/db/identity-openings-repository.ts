// Registro consultable de cada apertura de identidad con su fundamento legal.
import type { DatabaseSync } from 'node:sqlite';
import type { IdentityAccessEntry } from '@sigilo/contracts';
import { readInteger, readText } from './database.ts';

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
  const listStatement = db.prepare(
    'SELECT * FROM identity_openings WHERE folio = ? ORDER BY position',
  );
  const countStatement = db.prepare(
    'SELECT COUNT(*) AS total FROM identity_openings WHERE folio = ?',
  );
  return {
    insert: (folio, openingId, openedOn, legalBasis) => {
      insertStatement.run(openingId, folio, folio, openedOn, legalBasis);
    },
    listByFolio: (folio) =>
      listStatement.all(folio).map((row) => ({
        on: readText(row, 'opened_on'),
        actorRole: 'authority' as const,
        legalBasis: readText(row, 'legal_basis'),
        openingId: readText(row, 'opening_id'),
      })),
    countByFolio: (folio) => {
      const row = countStatement.get(folio);
      return row === undefined ? 0 : readInteger(row, 'total');
    },
  };
}
