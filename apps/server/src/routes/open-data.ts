// Datos abiertos: CSV agregado por entidad, conducta, mes de recepción y estatus.
import type { Hono } from 'hono';
import { OPEN_DATA_MIN_CELL, OPEN_DATA_ROUNDING, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { createOpenDataPublisher } from '../services/open-data.ts';

/**
 * Registra `GET openDataCsv`.
 * Seguridad: solo se publican meses completos anteriores al actual, cada uno con su instantánea
 * congelada y su ruido fijo, así el archivo de un mes no cambia por denuncias nuevas ni por
 * cambios de estatus. El CSV se guarda en caché hasta que cambia el mes en curso.
 */
export function registerOpenDataRoutes(app: Hono, ctx: AppContext): void {
  const publisher = createOpenDataPublisher(
    { db: ctx.deps.db, complaints: ctx.complaints, openData: ctx.openData, now: ctx.deps.now },
    { minCell: OPEN_DATA_MIN_CELL, rounding: OPEN_DATA_ROUNDING },
    ...(ctx.deps.openDataNoise === undefined ? [] : [ctx.deps.openDataNoise]),
  );
  app.get(ROUTES.openDataCsv, (c) => {
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="denuncias.csv"');
    return c.body(publisher.csv());
  });
}
