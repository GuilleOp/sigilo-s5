// `sigilo calendario revisar`: días inhábiles locales del estado (acuerdos de la autoridad:
// vacaciones, Semana Santa, 2 de noviembre…) en `config/dias-inhabiles.csv`, con las columnas
// fecha, nombre y fundamento. Los valida y los copia a `datos/dias-inhabiles.json`; el nodo los
// suma a los oficiales y los publica en /datos/dias-inhabiles.json.
import { readFileSync } from 'node:fs';
import { LocalRestDaySchema } from '@sigilo/contracts';
import type { LocalRestDay } from '@sigilo/contracts';
import { buildNodeCalendar } from '../../../../apps/server/src/services/calendar.ts';
import { CliError, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { nodePaths } from './comun.ts';
import { parseCsv } from './tabla-csv.ts';

/** Lee los días del CSV. Lanza `CliError` con la línea del primer problema. */
export function readRestDaysCsv(path: string): LocalRestDay[] {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  const header = rows[0]?.map((cell) => cell.trim().toLowerCase()).join(',');
  if (header !== 'fecha,nombre,fundamento') {
    throw new CliError('La primera línea de dias-inhabiles.csv debe ser: fecha,nombre,fundamento');
  }
  const days = rows.slice(1).map((cells, index) => {
    const [fecha = '', nombre = '', fundamento = ''] = cells.map((cell) => cell.trim());
    const parsed = LocalRestDaySchema.safeParse({ fecha, nombre, fundamento });
    if (!parsed.success) {
      throw new CliError(
        `dias-inhabiles.csv, línea ${index + 2}: escribe la fecha como AAAA-MM-DD, el nombre y el fundamento (acuerdo publicado).`,
      );
    }
    return parsed.data;
  });
  try {
    buildNodeCalendar(days);
  } catch (error) {
    throw new CliError(
      `dias-inhabiles.csv: ${error instanceof Error ? error.message : 'no es válido'}`,
    );
  }
  return days;
}

/** Valida el calendario y lo deja en `datos/` (el envoltorio reinicia el nodo). */
export function reviewCalendar(ctx: Context): number {
  const paths = nodePaths(ctx);
  const days = readRestDaysCsv(paths.restDaysCsv);
  writeJson(paths.restDays, { v: 1, dias: days }, 0o644);
  ctx.screen.ok(
    `${days.length} días inhábiles locales válidos, además de los oficiales (LFT, art. 74).`,
  );
  for (const day of days) ctx.screen.line(`    ${day.fecha} · ${day.nombre} (${day.fundamento})`);
  ctx.screen.line(
    'El nodo los publica en /datos/dias-inhabiles.json para que cualquiera recalcule tus plazos.',
  );
  return 0;
}
