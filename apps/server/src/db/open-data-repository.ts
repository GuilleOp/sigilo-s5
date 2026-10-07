// Instantáneas congeladas de los datos abiertos: una por mes cerrado, calculada una sola vez.
import type { DatabaseSync } from 'node:sqlite';
import { ComplaintStatusSchema } from '@sigilo/contracts';
import { z } from 'zod';
import type { OpenDataCell } from './complaints-repository.ts';
import { readText } from './database.ts';

const CellsSchema = z.array(
  z.object({
    stateCode: z.string(),
    offenseCode: z.string(),
    month: z.string(),
    status: ComplaintStatusSchema,
    count: z.number().int().nonnegative(),
  }),
);

/** Operaciones sobre la tabla `open_data_months` (de solo agregar). */
export interface OpenDataRepository {
  /** Meses ya congelados (`AAAA-MM`), en orden. */
  listMonths(): string[];
  /** Guarda las celdas reales de un mes; lanza error si el mes ya estaba congelado. */
  insertMonth(month: string, cells: readonly OpenDataCell[]): void;
  /** Celdas de todos los meses congelados, en orden de mes. */
  listCells(): OpenDataCell[];
}

/** Crea el repositorio de instantáneas mensuales sobre `db`. */
export function createOpenDataRepository(db: DatabaseSync): OpenDataRepository {
  const monthsStatement = db.prepare('SELECT month FROM open_data_months ORDER BY month');
  const insertStatement = db.prepare(
    'INSERT INTO open_data_months (month, cells_json) VALUES (?, ?)',
  );
  const cellsStatement = db.prepare('SELECT cells_json FROM open_data_months ORDER BY month');
  return {
    listMonths: () => monthsStatement.all().map((row) => readText(row, 'month')),
    insertMonth: (month, cells) => {
      insertStatement.run(month, JSON.stringify(cells));
    },
    listCells: () =>
      cellsStatement
        .all()
        .flatMap((row) => CellsSchema.parse(JSON.parse(readText(row, 'cells_json')))),
  };
}
