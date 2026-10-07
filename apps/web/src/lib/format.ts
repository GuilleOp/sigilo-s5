// Formatos para mostrar fechas, periodos y estatus en español claro, sin depender de la zona horaria.
import type { ComplaintStatus } from '@sigilo/contracts';

/** Nombres de los meses en español. */
export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/** «2026-10-20» → «20 de octubre de 2026». Devuelve el texto original si no tiene ese formato. */
export function formatDayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  const month = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) return value;
  return `${Number(match[3])} de ${month} de ${match[1]}`;
}

/** «2026-10-20T14:00Z» → «20 de octubre de 2026, alrededor de las 14:00 (hora UTC)». */
export function formatHourDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):00Z$/u.exec(value);
  if (!match) return value;
  return `${formatDayDate(match[1] ?? '')}, alrededor de las ${match[2]}:00 (hora UTC)`;
}

/** «2026-03» → «marzo de 2026». */
export function formatMonthPeriod(value: string): string {
  const match = /^(\d{4})-(\d{2})$/u.exec(value);
  const month = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  if (!match || month === undefined) return value;
  return `${month} de ${match[1]}`;
}

/** Nombre de cada estatus, en lenguaje claro. */
export const STATUS_LABELS: Readonly<Record<ComplaintStatus, string>> = {
  received: 'Recibida',
  routing: 'En turnado a la autoridad competente',
  routed: 'Turnada a la autoridad competente',
  investigating: 'En investigación',
  classified: 'Calificada',
  archived: 'Archivada',
  resolved: 'Concluida',
};

/** Explicación breve de cada estatus. */
export const STATUS_HINTS: Readonly<Record<ComplaintStatus, string>> = {
  received: 'Tu denuncia llegó y está en espera de revisión.',
  routing: 'Se está decidiendo qué autoridad debe atenderla.',
  routed: 'La autoridad competente ya la tiene.',
  investigating: 'La autoridad está investigando los hechos.',
  classified: 'La autoridad ya decidió si la falta es grave o no grave.',
  archived: 'Se cerró por ahora; puede reabrirse si hay nuevos elementos.',
  resolved: 'La autoridad terminó el trámite.',
};

/** Tamaño legible: «1.4 MB», «820 KB». */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
