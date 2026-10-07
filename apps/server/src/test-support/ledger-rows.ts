// Lectura directa de los eventos encadenados de una base, para las pruebas que la manipulan.
import type { DatabaseSync } from 'node:sqlite';
import type { LedgerEvent } from '@sigilo/contracts';
import { createLedgerRepository } from '../db/ledger-repository.ts';

/** Todos los eventos encadenados de la base, en orden. */
export function readLedgerRows(db: DatabaseSync): LedgerEvent[] {
  return createLedgerRepository(db).page(0, Number.MAX_SAFE_INTEGER);
}
