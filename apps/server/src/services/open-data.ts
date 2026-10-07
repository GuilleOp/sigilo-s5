// Datos abiertos: instantánea congelada de cada mes completo y CSV con supresión de celdas pequeñas
// y conteos redondeados.
import type { DatabaseSync } from 'node:sqlite';
import type { ComplaintsRepository, OpenDataCell } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import type { OpenDataRepository } from '../db/open-data-repository.ts';

/** Encabezados del CSV, en español. */
export const OPEN_DATA_HEADERS = ['entidad', 'conducta', 'mes_recepcion', 'estatus', 'denuncias'];

/** Valor de la primera columna en la fila que resume las denuncias suprimidas. */
export const SUPPRESSED_ROW_LABEL = 'suprimidas';

/** Reglas de publicación de las celdas. */
export interface OpenDataPolicy {
  /** Se suprime toda celda cuyo conteo real sea menor que este valor. */
  minCell: number;
  /** Los conteos publicados se redondean al múltiplo más cercano de este valor. */
  rounding: number;
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * Escapa un campo CSV (RFC 4180).
 * Seguridad: se antepone un apóstrofo a valores que empiezan como fórmula para evitar la
 * inyección de fórmulas al abrir el archivo en una hoja de cálculo.
 */
export function escapeCsvField(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Redondea al múltiplo más cercano de `step` (los empates no ocurren con `step` impar). */
export function roundToMultiple(count: number, step: number): number {
  return Math.round(count / step) * step;
}

/** Mes `AAAA-MM` (UTC) de la fecha: el CSV solo incluye meses anteriores a este. */
export function currentMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Construye el CSV con una fila por celda cuyo conteo real es al menos `minCell`, con el conteo
 * redondeado, y al final la fila de suprimidas. Las celdas deben ser de meses ya congelados.
 * Seguridad: las celdas pequeñas se omiten para impedir reidentificar casos aislados. Lo suprimido
 * se redondea por mes y después se suma, así cada mes aporta siempre lo mismo y comparar dos
 * versiones del archivo no revela nada de los meses ya publicados. La fila final tiene tantas
 * columnas como el encabezado.
 */
export function buildOpenDataCsv(cells: readonly OpenDataCell[], policy: OpenDataPolicy): string {
  const lines = [OPEN_DATA_HEADERS.join(',')];
  const suppressedByMonth = new Map<string, number>();
  for (const cell of cells) {
    if (cell.count < policy.minCell) {
      suppressedByMonth.set(cell.month, (suppressedByMonth.get(cell.month) ?? 0) + cell.count);
      continue;
    }
    const count = String(roundToMultiple(cell.count, policy.rounding));
    const fields = [cell.stateCode, cell.offenseCode, cell.month, cell.status, count];
    lines.push(fields.map(escapeCsvField).join(','));
  }
  let suppressed = 0;
  for (const count of suppressedByMonth.values()) {
    suppressed += roundToMultiple(count, policy.rounding);
  }
  const suppressedRow = OPEN_DATA_HEADERS.map(() => '');
  suppressedRow[0] = SUPPRESSED_ROW_LABEL;
  suppressedRow[suppressedRow.length - 1] = String(suppressed);
  lines.push(suppressedRow.join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Dependencias de la congelación de meses. */
export interface OpenDataFreezeDeps {
  db: DatabaseSync;
  complaints: ComplaintsRepository;
  openData: OpenDataRepository;
  now: () => Date;
}

/**
 * Congela, en una transacción, cada mes de recepción ya completo que todavía no tenga
 * instantánea, con las celdas reales de ese momento. Devuelve los meses congelados.
 * Seguridad: un mes se calcula una sola vez (al cerrarse, por la tarea programada o en la primera
 * consulta). Los cambios de estatus posteriores ya no mueven conteos entre sus celdas, que de otro
 * modo permitirían seguir a una denuncia concreta restando versiones del archivo.
 */
export function freezeClosedMonths(deps: OpenDataFreezeDeps): string[] {
  const month = currentMonth(deps.now());
  const frozen = new Set(deps.openData.listMonths());
  const missing = deps.complaints.listMonthsBefore(month).filter((item) => !frozen.has(item));
  if (missing.length === 0) return [];
  return withTransaction(deps.db, () => {
    const already = new Set(deps.openData.listMonths());
    const added: string[] = [];
    for (const item of missing) {
      if (already.has(item)) continue;
      deps.openData.insertMonth(item, deps.complaints.countCellsOfMonth(item));
      added.push(item);
    }
    return added;
  });
}
