// Formatos para mostrar fechas, periodos y estatus en español claro. Las horas se muestran en la
// hora del centro de México, sin depender de la zona horaria del equipo.
import { COMPLAINT_STATUSES } from '@sigilo/contracts';
import type { ComplaintStatus } from '@sigilo/contracts';
import { SPANISH_MONTHS } from '@sigilo/huella';

/** Nombres de los meses en español (los mismos que usa Huella Cero). */
export const MONTH_NAMES = SPANISH_MONTHS;

/** «2026-10-20» → «20 de octubre de 2026». Devuelve el texto original si no tiene ese formato. */
export function formatDayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  const month = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) return value;
  return `${Number(match[3])} de ${month} de ${match[1]}`;
}

/**
 * «2026-11-14» → «14 nov 2026»: para tablas y listas donde la fecha larga se partiría en renglones.
 * Devuelve el texto original si no tiene ese formato.
 */
export function formatShortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  const month = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) return value;
  return `${Number(match[3])} ${month.slice(0, 3)} ${match[1]}`;
}

const CENTRAL_MEXICO_TIME = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * «2026-10-20T14:00Z» → «20 de octubre de 2026, cerca de las 8:00 (hora del centro de México)».
 * Devuelve el texto original si no tiene ese formato.
 */
export function formatHourDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00Z$/u.exec(value);
  if (!match) return value;
  const parts = Object.fromEntries(
    CENTRAL_MEXICO_TIME.formatToParts(new Date(`${match[1]}T${match[2]}:00:00Z`)).map((part) => [
      part.type,
      part.value,
    ]),
  );
  const day = formatDayDate(`${parts['year']}-${parts['month']}-${parts['day']}`);
  return `${day}, cerca de las ${Number(parts['hour'])}:${parts['minute']} (hora del centro de México)`;
}

/** «2026-03» → «marzo de 2026». */
export function formatMonthPeriod(value: string): string {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);
  const month = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) return value;
  return `${month} de ${match[1]}`;
}

/** Nombre de cada estatus, en lenguaje claro (del catálogo `COMPLAINT_STATUSES`). */
export const STATUS_LABELS: Readonly<Record<ComplaintStatus, string>> = Object.fromEntries(
  COMPLAINT_STATUSES.map((status) => [status.key, status.name]),
) as Record<ComplaintStatus, string>;

/** Explicación breve de cada estatus (del catálogo `COMPLAINT_STATUSES`). */
export const STATUS_HINTS: Readonly<Record<ComplaintStatus, string>> = Object.fromEntries(
  COMPLAINT_STATUSES.map((status) => [status.key, status.explanation]),
) as Record<ComplaintStatus, string>;

/** Tamaño legible: «1.4 MB», «820 KB». */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
