// Datos abiertos: CSV agregado con supresión de celdas pequeñas.
import type { OpenDataCell } from '../db/complaints-repository.ts';

/** Encabezados del CSV, en español. */
export const OPEN_DATA_HEADERS = ['entidad', 'conducta', 'mes_recepcion', 'estatus', 'denuncias'];

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

/**
 * Construye el CSV con una fila por celda cuyo conteo es al menos `minCell`.
 * Seguridad: las celdas menores se omiten para impedir reidentificar casos aislados; la fila
 * final `suprimidas,<n>` informa cuántas denuncias quedaron fuera.
 */
export function buildOpenDataCsv(cells: readonly OpenDataCell[], minCell: number): string {
  const lines = [OPEN_DATA_HEADERS.join(',')];
  let suppressed = 0;
  for (const cell of cells) {
    if (cell.count < minCell) {
      suppressed += cell.count;
      continue;
    }
    const fields = [cell.stateCode, cell.offenseCode, cell.month, cell.status, String(cell.count)];
    lines.push(fields.map(escapeCsvField).join(','));
  }
  lines.push(`suprimidas,${suppressed}`);
  return `${lines.join('\r\n')}\r\n`;
}
