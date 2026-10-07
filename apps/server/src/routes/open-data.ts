// Datos abiertos: CSV agregado por entidad, conducta, mes de recepción y estatus.
import type { Hono } from 'hono';
import { OPEN_DATA_MIN_CELL, OPEN_DATA_ROUNDING, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { buildOpenDataCsv, freezeClosedMonths } from '../services/open-data.ts';

/**
 * Registra `GET openDataCsv`.
 * Seguridad: solo se publican meses completos anteriores al actual, cada uno con su instantánea
 * congelada, así el archivo de un mes no cambia por denuncias nuevas ni por cambios de estatus.
 */
export function registerOpenDataRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.openDataCsv, (c) => {
    freezeClosedMonths({
      db: ctx.deps.db,
      complaints: ctx.complaints,
      openData: ctx.openData,
      now: ctx.deps.now,
    });
    const csv = buildOpenDataCsv(ctx.openData.listCells(), {
      minCell: OPEN_DATA_MIN_CELL,
      rounding: OPEN_DATA_ROUNDING,
    });
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="denuncias.csv"');
    return c.body(csv);
  });
}
