// Historial privado de estatus de cada denuncia, con su propio orden (la bitácora pública baraja
// los eventos de cada día y no sirve para reconstruir la secuencia de cambios).
import type { DatabaseSync } from 'node:sqlite';
import { ComplaintStatusSchema } from '@sigilo/contracts';
import type { ComplaintStatus, TimelineEntry } from '@sigilo/contracts';
import { readText } from './database.ts';

/** Operaciones sobre la tabla `status_changes`. */
export interface StatusRepository {
  insert(folio: string, status: ComplaintStatus, changedOn: string): void;
  /** Cambios de estatus del folio en el orden en que ocurrieron. */
  listByFolio(folio: string): TimelineEntry[];
}

/** Crea el repositorio del historial de estatus sobre `db`. */
export function createStatusRepository(db: DatabaseSync): StatusRepository {
  const insertStatement = db.prepare(
    `INSERT INTO status_changes (folio, position, status, changed_on)
     VALUES (?, (SELECT COALESCE(MAX(position) + 1, 0) FROM status_changes WHERE folio = ?), ?, ?)`,
  );
  const listStatement = db.prepare(
    'SELECT status, changed_on FROM status_changes WHERE folio = ? ORDER BY position',
  );
  return {
    insert: (folio, status, changedOn) => {
      insertStatement.run(folio, folio, status, changedOn);
    },
    listByFolio: (folio) =>
      listStatement.all(folio).map((row) => ({
        status: ComplaintStatusSchema.parse(readText(row, 'status')),
        on: readText(row, 'changed_on'),
      })),
  };
}
