// Registro consultable de cada apertura de identidad con su fundamento legal.
import type { DatabaseSync } from 'node:sqlite';
import type { IdentityAccessEntry } from '@sigilo/contracts';
import { readInteger, readText } from './database.ts';

/** Operaciones sobre la tabla `identity_openings`. */
export interface IdentityOpeningsRepository {
  insert(folio: string, ledgerSeq: number, openedOn: string, legalBasis: string): void;
  listByFolio(folio: string): IdentityAccessEntry[];
  countByFolio(folio: string): number;
}

/** Crea el repositorio de aperturas de identidad sobre `db`. */
export function createIdentityOpeningsRepository(db: DatabaseSync): IdentityOpeningsRepository {
  const insertStatement = db.prepare(
    `INSERT INTO identity_openings (ledger_seq, folio, opened_on, legal_basis)
     VALUES (?, ?, ?, ?)`,
  );
  const listStatement = db.prepare(
    'SELECT * FROM identity_openings WHERE folio = ? ORDER BY ledger_seq',
  );
  const countStatement = db.prepare(
    'SELECT COUNT(*) AS total FROM identity_openings WHERE folio = ?',
  );

  return {
    insert: (folio, ledgerSeq, openedOn, legalBasis) => {
      insertStatement.run(ledgerSeq, folio, openedOn, legalBasis);
    },
    listByFolio: (folio) =>
      listStatement.all(folio).map((row) => ({
        on: readText(row, 'opened_on'),
        actorRole: 'authority' as const,
        legalBasis: readText(row, 'legal_basis'),
        ledgerSeq: readInteger(row, 'ledger_seq'),
      })),
    countByFolio: (folio) => {
      const row = countStatement.get(folio);
      return row === undefined ? 0 : readInteger(row, 'total');
    },
  };
}
