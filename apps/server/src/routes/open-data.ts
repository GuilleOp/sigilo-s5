// Datos abiertos: CSV agregado por entidad, conducta, mes de recepción y estatus.
import type { Hono } from 'hono';
import { OPEN_DATA_MIN_CELL, OPEN_DATA_ROUNDING, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { buildOpenDataCsv, currentMonth } from '../services/open-data.ts';

/**
 * Registra `GET openDataCsv`.
 * Seguridad: solo se publican meses completos anteriores al actual, así el archivo de un mes no
 * cambia por denuncias nuevas y no revela cuándo llegó cada una.
 */
export function registerOpenDataRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.openDataCsv, (c) => {
    const cells = ctx.complaints.countByCell(currentMonth(ctx.deps.now()));
    const csv = buildOpenDataCsv(cells, {
      minCell: OPEN_DATA_MIN_CELL,
      rounding: OPEN_DATA_ROUNDING,
    });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="denuncias.csv"');
    return c.body(csv);
  });
}
