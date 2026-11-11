// Textos de los plazos legales en lenguaje sencillo: situación (en curso, por vencer, vencido) y
// lo que falta, siempre con la unidad correcta (días naturales o hábiles).
import type { DeadlineStatus } from '@sigilo/contracts';

/** Nombre de cada situación, para mostrarse junto a su ícono (nunca solo con color). */
export const DEADLINE_STATUS_LABELS: Readonly<Record<DeadlineStatus, string>> = {
  running: 'En curso',
  due_soon: 'Por vencer',
  overdue: 'Vencido',
};

/** Unidad de los días que faltan. */
export type RemainingUnit = 'natural_days' | 'business_days';

function days(count: number, unit: RemainingUnit): string {
  const kind = unit === 'business_days' ? 'hábil' : 'natural';
  const plural = unit === 'business_days' ? 'hábiles' : 'naturales';
  return count === 1 ? `1 día ${kind}` : `${count} días ${plural}`;
}

/** A partir de cuántos días el plazo se dice en meses y años («Faltan 6 años y 1 mes»). */
export const LONG_SPAN_DAYS = 60;

/** Días naturales aproximados de un número de días hábiles (5 de cada 7). */
function naturalDaysOf(count: number, unit: RemainingUnit): number {
  return unit === 'business_days' ? Math.round((count * 7) / 5) : count;
}

/** Meses completos entre dos fechas «AAAA-MM-DD». */
function wholeMonthsBetween(from: Date, to: Date): number {
  const months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return to.getUTCDate() < from.getUTCDate() ? months - 1 : months;
}

/** «6 años y 1 mes», «2 meses», «1 año». */
function yearsAndMonths(totalMonths: number): string {
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yearText = years === 1 ? '1 año' : `${years} años`;
  const monthText = months === 1 ? '1 mes' : `${months} meses`;
  if (years === 0) return monthText;
  return months === 0 ? yearText : `${yearText} y ${monthText}`;
}

/**
 * Lo que falta (o lo que pasó desde que venció) en meses y años, contado desde la fecha de
 * vencimiento hacia atrás; `null` si son pocos días o la fecha no tiene formato «AAAA-MM-DD».
 * Con días hábiles es aproximado y lo dice («cerca de»).
 */
function longSpan(remaining: number, unit: RemainingUnit, dueOn: string): string | null {
  const span = naturalDaysOf(Math.abs(remaining), unit);
  const due = new Date(`${dueOn}T00:00:00Z`);
  if (span <= LONG_SPAN_DAYS || !/^\d{4}-\d{2}-\d{2}$/u.test(dueOn) || Number.isNaN(due.getTime()))
    return null;
  const today = new Date(due.getTime() - Math.sign(remaining) * span * 86_400_000);
  const months = remaining > 0 ? wholeMonthsBetween(today, due) : wholeMonthsBetween(due, today);
  const text = yearsAndMonths(Math.max(1, months));
  return unit === 'business_days' ? `cerca de ${text}` : text;
}

/**
 * «Faltan 3 días hábiles», «Vence hoy» o «Venció hace 2 días naturales». `remaining` es 0 el último
 * día y negativo si ya venció, en la unidad del plazo. Con la fecha de vencimiento, los plazos de
 * más de dos meses se dicen en meses y años: «Faltan 6 años y 1 mes».
 */
export function describeRemaining(remaining: number, unit: RemainingUnit, dueOn?: string): string {
  if (remaining === 0) return 'Vence hoy';
  const long = dueOn === undefined ? null : longSpan(remaining, unit, dueOn);
  if (remaining > 0) {
    if (long !== null) return `Faltan ${long}`;
    return `${remaining === 1 ? 'Falta' : 'Faltan'} ${days(remaining, unit)}`;
  }
  return `Venció hace ${long ?? days(-remaining, unit)}`;
}

/** ¿El plazo se dice en meses y años (más de dos meses)? */
export function isLongSpan(remaining: number, unit: RemainingUnit): boolean {
  return naturalDaysOf(Math.abs(remaining), unit) > LONG_SPAN_DAYS;
}
