// Datos abiertos: instantánea congelada de cada mes completo y CSV con conteos redondeados al azar
// (con semilla secreta por mes), supresión de celdas pequeñas y caché hasta el siguiente congelado.
import { createHmac } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { fromBase64Url, randomBytes, toBase64Url } from '@sigilo/core';
import type { ComplaintsRepository, OpenDataCell } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import type { OpenDataRepository } from '../db/open-data-repository.ts';

/** Encabezados del CSV, en español. */
export const OPEN_DATA_HEADERS = ['entidad', 'conducta', 'mes_recepcion', 'estatus', 'denuncias'];

/** Valor de la primera columna en la fila que resume las denuncias suprimidas. */
export const SUPPRESSED_ROW_LABEL = 'suprimidas';

/** Reglas de publicación de las celdas. */
export interface OpenDataPolicy {
  /** Se suprime toda celda cuyo conteo publicado (ya redondeado con ruido) sea menor que esto. */
  minCell: number;
  /** Los conteos se redondean al azar a un múltiplo vecino de este valor. */
  rounding: number;
}

/** Mes congelado con sus celdas reales y su semilla secreta de ruido (Base64URL). */
export interface FrozenMonth {
  month: string;
  cells: readonly OpenDataCell[];
  noiseSeed: string;
}

/** Número en [0, 1) determinado por la semilla del mes y la etiqueta de la celda. */
export type NoiseUnit = (noiseSeed: string, label: string) => number;

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
 * Redondeo aleatorio insesgado: `count = q·step + r` sube a `(q + 1)·step` con probabilidad
 * `r / step` (si `unit < r / step`) y baja a `q·step` en otro caso. El valor esperado es `count`.
 */
export function randomRound(count: number, step: number, unit: number): number {
  const remainder = count % step;
  const base = count - remainder;
  return unit * step < remainder ? base + step : base;
}

/**
 * Ruido por omisión: los primeros 48 bits de HMAC-SHA256(semilla del mes, etiqueta) entre 2^48.
 * Así el valor de cada celda queda fijo para siempre sin guardarlo, y no se puede predecir sin la
 * semilla.
 */
export const hmacNoiseUnit: NoiseUnit = (noiseSeed, label) => {
  const digest = createHmac('sha256', fromBase64Url(noiseSeed)).update(label, 'utf8').digest();
  return digest.readUIntBE(0, 6) / 2 ** 48;
};

/** Semilla nueva de ruido para un mes que se congela (32 bytes, Base64URL). */
export function newNoiseSeed(): string {
  return toBase64Url(randomBytes(32));
}

/** Mes `AAAA-MM` (UTC) de la fecha: el CSV solo incluye meses anteriores a este. */
export function currentMonth(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function cellLabel(cell: OpenDataCell): string {
  return `celda:${cell.stateCode}|${cell.offenseCode}|${cell.status}`;
}

/**
 * Construye el CSV con una fila por celda cuyo conteo, redondeado al azar a un múltiplo de
 * `rounding`, llega a `minCell`; al final, la fila de suprimidas. Los meses deben estar congelados.
 * Seguridad (garantía): cada conteo publicado es un redondeo aleatorio insesgado del real con la
 * semilla secreta del mes, así que una celda con `k` denuncias y otra con `k + 1` (para `k >= 1`)
 * pueden publicar el mismo valor: quien rellena una celda con denuncias propias y la ve aparecer o
 * cambiar ya no sabe con certeza si había una denuncia real, solo con una probabilidad. El valor
 * de cada mes congelado es estable: volver a descargar o comparar versiones no da muestras nuevas
 * del ruido. Lo suprimido se suma por mes y se redondea igual. Límites: es una garantía
 * probabilística, no privacidad diferencial (con 4 denuncias propias, ver la celda publicada pasa
 * de 80 % a 100 % si existe la denuncia objetivo); una celda con una sola denuncia real puede
 * publicarse como 5 con probabilidad 1/5, lo que revela que no está vacía, y una celda vacía
 * nunca aparece. La fila final tiene tantas columnas como el encabezado.
 */
export function buildOpenDataCsv(
  months: readonly FrozenMonth[],
  policy: OpenDataPolicy,
  noiseUnit: NoiseUnit = hmacNoiseUnit,
): string {
  const lines = [OPEN_DATA_HEADERS.join(',')];
  let suppressed = 0;
  for (const frozen of months) {
    let suppressedInMonth = 0;
    for (const cell of frozen.cells) {
      const published = randomRound(
        cell.count,
        policy.rounding,
        noiseUnit(frozen.noiseSeed, cellLabel(cell)),
      );
      if (published < policy.minCell) {
        suppressedInMonth += cell.count;
        continue;
      }
      const fields = [cell.stateCode, cell.offenseCode, cell.month, cell.status, String(published)];
      lines.push(fields.map(escapeCsvField).join(','));
    }
    suppressed += randomRound(
      suppressedInMonth,
      policy.rounding,
      noiseUnit(frozen.noiseSeed, 'suprimidas'),
    );
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
 * instantánea, con las celdas reales de ese momento y una semilla de ruido nueva. Devuelve los
 * meses congelados.
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
      deps.openData.insertMonth(item, deps.complaints.countCellsOfMonth(item), newNoiseSeed());
      added.push(item);
    }
    return added;
  });
}

/** CSV de datos abiertos con caché. */
export interface OpenDataPublisher {
  /** Congela los meses que falten y devuelve el CSV. */
  csv(): string;
}

/**
 * Crea el publicador del CSV. Guarda la lista de meses y el CSV mientras no cambie el mes en curso
 * ni se congele un mes nuevo: con el mes en curso fijo, ningún mes anterior recibe denuncias.
 */
export function createOpenDataPublisher(
  deps: OpenDataFreezeDeps,
  policy: OpenDataPolicy,
  noiseUnit: NoiseUnit = hmacNoiseUnit,
): OpenDataPublisher {
  let cache: { month: string; csv: string } | null = null;
  return {
    csv: () => {
      const month = currentMonth(deps.now());
      if (cache?.month === month) return cache.csv;
      freezeClosedMonths(deps);
      const csv = buildOpenDataCsv(deps.openData.listFrozen(), policy, noiseUnit);
      cache = { month, csv };
      return csv;
    },
  };
}
