// Instantáneas congeladas de los datos abiertos: una por mes cerrado, calculada una sola vez.
import type { DatabaseSync } from 'node:sqlite';
import { ComplaintStatusSchema } from '@sigilo/contracts';
import { z } from 'zod';
import type { OpenDataCell } from './complaints-repository.ts';
import type { FrozenMonth } from '../services/open-data.ts';
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
  /**
   * Guarda las celdas reales de un mes y su semilla secreta de ruido; lanza error si el mes ya
   * estaba congelado.
   */
  insertMonth(month: string, cells: readonly OpenDataCell[], noiseSeed: string): void;
  /** Meses congelados con sus celdas y su semilla, en orden de mes. */
  listFrozen(): FrozenMonth[];
}

/** Crea el repositorio de instantáneas mensuales sobre `db`. */
export function createOpenDataRepository(db: DatabaseSync): OpenDataRepository {
  const monthsStatement = db.prepare('SELECT month FROM open_data_months ORDER BY month');
  const insertStatement = db.prepare(
    'INSERT INTO open_data_months (month, cells_json, noise_seed) VALUES (?, ?, ?)',
  );
  const frozenStatement = db.prepare('SELECT * FROM open_data_months ORDER BY month');
  return {
    listMonths: () => monthsStatement.all().map((row) => readText(row, 'month')),
    insertMonth: (month, cells, noiseSeed) => {
      insertStatement.run(month, JSON.stringify(cells), noiseSeed);
    },
    listFrozen: () =>
      frozenStatement.all().map((row) => ({
        month: readText(row, 'month'),
        cells: CellsSchema.parse(JSON.parse(readText(row, 'cells_json'))),
        noiseSeed: readText(row, 'noise_seed'),
      })),
  };
}
