// Datos abiertos: CSV agregado por entidad, conducta, mes de recepción y estatus.
import type { Hono } from 'hono';
import { OPEN_DATA_MIN_CELL, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { buildOpenDataCsv } from '../services/open-data.ts';

/** Registra `GET openDataCsv`. */
export function registerOpenDataRoutes(app: Hono, ctx: AppContext): void {
  app.get(ROUTES.openDataCsv, (c) => {
    const csv = buildOpenDataCsv(ctx.complaints.countByCell(), OPEN_DATA_MIN_CELL);
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="denuncias.csv"');
    return c.body(csv);
  });
}
