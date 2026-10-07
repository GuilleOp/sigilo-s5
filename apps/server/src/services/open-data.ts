// Datos abiertos: CSV agregado de meses completos, con supresión de celdas pequeñas y conteos
// redondeados.
import type { OpenDataCell } from '../db/complaints-repository.ts';

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
 * redondeado. Las celdas deben ser de meses ya completos.
 * Seguridad: las celdas pequeñas se omiten para impedir reidentificar casos aislados, y el
 * redondeo impide deducir una denuncia comparando dos versiones del archivo o restando la fila
 * final, que suma (también redondeado) lo suprimido y tiene tantas columnas como el encabezado.
 */
export function buildOpenDataCsv(cells: readonly OpenDataCell[], policy: OpenDataPolicy): string {
  const lines = [OPEN_DATA_HEADERS.join(',')];
  let suppressed = 0;
  for (const cell of cells) {
    if (cell.count < policy.minCell) {
      suppressed += cell.count;
      continue;
    }
    const count = String(roundToMultiple(cell.count, policy.rounding));
    const fields = [cell.stateCode, cell.offenseCode, cell.month, cell.status, count];
    lines.push(fields.map(escapeCsvField).join(','));
  }
  const suppressedRow = OPEN_DATA_HEADERS.map(() => '');
  suppressedRow[0] = SUPPRESSED_ROW_LABEL;
  suppressedRow[suppressedRow.length - 1] = String(roundToMultiple(suppressed, policy.rounding));
  lines.push(suppressedRow.join(','));
  return `${lines.join('\r\n')}\r\n`;
}
