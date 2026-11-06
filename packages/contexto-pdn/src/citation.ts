// Citas de fuente con fecha en español («S6 federal, datos a enero de 2023») y aritmética de fechas.

import { SPANISH_MONTHS } from '@sigilo/huella/months';
import type { SourceCitation, SourceInfo } from './types.ts';

/** Fecha `AAAA-MM` («enero de 2023») o `AAAA-MM-DD` («5 de noviembre de 2026») en español. */
export function formatDataDate(value: string): string {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/u.exec(value);
  if (match === null) return value;
  const month = SPANISH_MONTHS[Number(match[2]) - 1];
  if (month === undefined) return value;
  return match[3] === undefined
    ? `${month} de ${match[1]}`
    : `${Number(match[3])} de ${month} de ${match[1]}`;
}

/** Cita de una fuente para mostrar junto a cada dato. */
export function citeSource(info: SourceInfo): SourceCitation {
  return {
    sourceId: info.id,
    label: info.label,
    dataAsOf: info.dataAsOf,
    text: `${info.label}, datos a ${formatDataDate(info.dataAsOf)}`,
  };
}

const DAY_MS = 86_400_000;

/** Días naturales entre dos fechas AAAA-MM-DD (`to` menos `from`). Lanza `Error` si no son fechas. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end))
    throw new Error('Fecha inválida: se espera AAAA-MM-DD.');
  return Math.round((end - start) / DAY_MS);
}

/** Suma días naturales a una fecha AAAA-MM-DD. */
export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(time)) throw new Error('Fecha inválida: se espera AAAA-MM-DD.');
  return new Date(time + days * DAY_MS).toISOString().slice(0, 10);
}

/** Importe en pesos con separador de miles («$1,480,000 MXN»). */
export function formatAmount(amount: number, currency = 'MXN'): string {
  const rounded = Math.round(amount);
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return `${rounded < 0 ? '-' : ''}$${digits} ${currency}`;
}
