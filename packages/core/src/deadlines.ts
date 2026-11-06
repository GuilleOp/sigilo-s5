// Cálculo puro de vencimientos de plazos legales en días naturales, días hábiles, meses y años, y
// situación de un plazo (en curso, por vencer o vencido). Las fechas son días civiles `AAAA-MM-DD`
// sin hora, en la hora del centro de México (ver `toMexicoCentralDay`), nunca el día UTC redondeado.
import {
  findDeadlineRule,
  OFFICIAL_REST_DAYS,
  OFFICIAL_REST_DAYS_COVERAGE,
} from '@sigilo/contracts';
import type {
  DeadlineKey,
  DeadlineRule,
  DeadlineStatus,
  DeadlineTerm,
  DeadlineUnit,
} from '@sigilo/contracts';

const DAY_MS = 86_400_000;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * Calendario de días inhábiles. Sábados y domingos siempre son inhábiles; `nonBusinessDays` agrega
 * los días oficiales y los que declare cada autoridad. `coverage` es el rango para el que la lista
 * está completa: fuera de él no se puede saber si un día es hábil.
 */
export interface BusinessCalendar {
  readonly nonBusinessDays: ReadonlySet<string>;
  readonly coverage: { readonly from: string; readonly through: string };
}

/**
 * Plazo evaluado: día de vencimiento, situación y días que faltan (negativo si ya venció), contados
 * siempre en `remainingUnit`, la unidad del aviso de la regla.
 */
export interface DeadlineEvaluation {
  dueOn: string;
  status: DeadlineStatus;
  remaining: number;
  remainingUnit: Extract<DeadlineUnit, 'natural_days' | 'business_days'>;
}

/** Convierte un día `AAAA-MM-DD` a días desde 1970-01-01. Lanza si la fecha no existe. */
function toEpochDay(day: string): number {
  const match = DAY_PATTERN.exec(day);
  if (match === null) throw new Error('Fecha inválida: se espera AAAA-MM-DD.');
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const time = Date.UTC(year, month - 1, date);
  const check = new Date(time);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) {
    throw new Error('Fecha inválida: el día no existe.');
  }
  return time / DAY_MS;
}

function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * DAY_MS).toISOString().slice(0, 10);
}

function assertAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('La cantidad del plazo debe ser un entero no negativo.');
  }
}

function isWeekend(epochDay: number): boolean {
  // 1970-01-01 fue jueves; el resultado sigue a getUTCDay: 0 es domingo y 6 es sábado.
  const weekday = ((((epochDay % 7) + 7) % 7) + 4) % 7;
  return weekday === 0 || weekday === 6;
}

function assertCovered(epochDay: number, calendar: BusinessCalendar): void {
  const { from, through } = calendar.coverage;
  if (epochDay < toEpochDay(from) || epochDay > toEpochDay(through)) {
    throw new Error(
      `El calendario de días inhábiles cubre de ${from} a ${through}; agrega los días del año que falta.`,
    );
  }
}

/**
 * Crea un calendario a partir de una lista explícita de días inhábiles y del rango que cubre.
 * Lanza si una fecha no es válida, si el rango está invertido o si un día cae fuera del rango.
 */
export function createBusinessCalendar(options: {
  nonBusinessDays: Iterable<string>;
  coverage: { from: string; through: string };
}): BusinessCalendar {
  const from = toEpochDay(options.coverage.from);
  const through = toEpochDay(options.coverage.through);
  if (from > through) throw new Error('El rango del calendario está invertido.');
  const days = new Set<string>();
  for (const day of options.nonBusinessDays) {
    const epochDay = toEpochDay(day);
    if (epochDay < from || epochDay > through) {
      throw new Error('Hay un día inhábil fuera del rango del calendario.');
    }
    days.add(day);
  }
  return { nonBusinessDays: days, coverage: { ...options.coverage } };
}

/** Calendario con los días de descanso obligatorio de `OFFICIAL_REST_DAYS` (2025 a 2028). */
export const DEFAULT_BUSINESS_CALENDAR: BusinessCalendar = createBusinessCalendar({
  nonBusinessDays: OFFICIAL_REST_DAYS.map((item) => item.day),
  coverage: OFFICIAL_REST_DAYS_COVERAGE,
});

/**
 * Indica si un día es hábil: ni sábado, ni domingo, ni inhábil en el calendario. Lanza si el día
 * está fuera del rango del calendario.
 */
export function isBusinessDay(day: string, calendar: BusinessCalendar): boolean {
  const epochDay = toEpochDay(day);
  assertCovered(epochDay, calendar);
  return !isWeekend(epochDay) && !calendar.nonBusinessDays.has(day);
}

/**
 * Último día de un plazo de `amount` días naturales. El plazo empieza a contar el día siguiente a
 * `start`; el vencimiento no se recorre aunque caiga en día inhábil.
 */
export function addNaturalDays(start: string, amount: number): string {
  assertAmount(amount);
  return fromEpochDay(toEpochDay(start) + amount);
}

/**
 * Último día de un plazo de `amount` días hábiles: cuenta solo días hábiles a partir del día
 * siguiente a `start`. Lanza si el cálculo sale del rango del calendario.
 */
export function addBusinessDays(start: string, amount: number, calendar: BusinessCalendar): string {
  assertAmount(amount);
  let epochDay = toEpochDay(start);
  let counted = 0;
  while (counted < amount) {
    epochDay += 1;
    if (isBusinessDay(fromEpochDay(epochDay), calendar)) counted += 1;
  }
  return fromEpochDay(epochDay);
}

/**
 * Mismo día del mes `months` meses después; si ese mes es más corto, el último día del mes
 * (31 de agosto más 6 meses es el 28 o 29 de febrero).
 */
export function addCalendarMonths(start: string, months: number): string {
  assertAmount(months);
  const date = new Date(toEpochDay(start) * DAY_MS);
  const targetMonth = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(date.getUTCDate(), lastDay);
  return fromEpochDay(Date.UTC(date.getUTCFullYear(), targetMonth, day) / DAY_MS);
}

/**
 * Día de vencimiento de un plazo que empieza con el acto del día `start`. `start` es el día civil
 * del acto en la hora del centro de México (`toMexicoCentralDay`), no el día UTC: un acto del
 * jueves a las 19:00 hora del centro empieza a contar el viernes, no el sábado.
 */
export function computeDueDate(
  start: string,
  term: DeadlineTerm,
  calendar: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): string {
  switch (term.unit) {
    case 'natural_days':
      return addNaturalDays(start, term.amount);
    case 'business_days':
      return addBusinessDays(start, term.amount, calendar);
    case 'months':
      return addCalendarMonths(start, term.amount);
    case 'years':
      return addCalendarMonths(start, term.amount * 12);
  }
}

/**
 * Plazo concreto de una regla del catálogo. Si la regla tiene rango (por ejemplo, de 5 a 15 días
 * hábiles), `amount` es el que fijó la autoridad; sin `amount` se usa el mínimo. Lanza si queda
 * fuera del rango o si la regla no admite otra cantidad.
 */
export function termForRule(rule: DeadlineRule, amount?: number): DeadlineTerm {
  const chosen = amount ?? rule.amount;
  const max = rule.maxAmount ?? rule.amount;
  if (!Number.isSafeInteger(chosen) || chosen < rule.amount || chosen > max) {
    throw new Error(`El plazo debe ser de ${rule.amount} a ${max}.`);
  }
  return { unit: rule.unit, amount: chosen };
}

/**
 * Días que faltan de `today` a `dueOn`: 0 el día del vencimiento y negativo si ya venció. En días
 * hábiles cuenta los hábiles posteriores a `today` hasta `dueOn`, inclusive; si ya venció, cuenta en
 * negativo los hábiles posteriores a `dueOn` hasta `today` (del viernes 20 al lunes 23 es -1).
 */
export function remainingDays(
  today: string,
  dueOn: string,
  unit: Extract<DeadlineUnit, 'natural_days' | 'business_days'>,
  calendar: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): number {
  const from = toEpochDay(today);
  const to = toEpochDay(dueOn);
  if (unit === 'natural_days' || from === to) return to - from;
  const [first, last, sign] = from < to ? [from, to, 1] : [to, from, -1];
  let count = 0;
  for (let epochDay = first + 1; epochDay <= last; epochDay += 1) {
    if (isBusinessDay(fromEpochDay(epochDay), calendar)) count += 1;
  }
  return sign * count;
}

/**
 * Situación del plazo en el día `today`: `overdue` después del vencimiento, `due_soon` si faltan
 * `warning.amount` días o menos (incluido el día del vencimiento) y `running` en otro caso.
 */
export function deadlineStatus(
  today: string,
  dueOn: string,
  warning: DeadlineRule['warning'],
  calendar: BusinessCalendar = DEFAULT_BUSINESS_CALENDAR,
): DeadlineStatus {
  if (toEpochDay(today) > toEpochDay(dueOn)) return 'overdue';
  return remainingDays(today, dueOn, warning.unit, calendar) <= warning.amount
    ? 'due_soon'
    : 'running';
}

/**
 * Evalúa una regla del catálogo para un acto del día `start` visto en el día `today`. Ambos son
 * días civiles en la hora del centro de México (`toMexicoCentralDay`): con el día UTC, un plazo
 * aparecería vencido desde las 18:00 de su último día. `amount` fija el plazo dentro del rango de
 * la regla. Los días que faltan se cuentan en la unidad del aviso de la regla, también si ya venció.
 * Lanza si la clave no existe.
 */
export function evaluateDeadline(
  key: DeadlineKey,
  start: string,
  today: string,
  options: { amount?: number; calendar?: BusinessCalendar } = {},
): DeadlineEvaluation {
  const rule = findDeadlineRule(key);
  if (rule === undefined) throw new Error('Plazo desconocido.');
  const calendar = options.calendar ?? DEFAULT_BUSINESS_CALENDAR;
  const dueOn = computeDueDate(start, termForRule(rule, options.amount), calendar);
  const status = deadlineStatus(today, dueOn, rule.warning, calendar);
  const remainingUnit = rule.warning.unit;
  const remaining = remainingDays(today, dueOn, remainingUnit, calendar);
  return { dueOn, status, remaining, remainingUnit };
}
