// Fechas redondeadas en UTC para reducir la correlación temporal de eventos, y día civil en la hora
// del centro de México para contar los plazos legales.

function assertValidDate(date: Date): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Fecha inválida.');
  }
}

/** Devuelve la fecha UTC redondeada al día con formato `YYYY-MM-DD`. Lanza error si la fecha es inválida. */
export function toDayDate(date: Date): string {
  assertValidDate(date);
  return date.toISOString().slice(0, 10);
}

/** Devuelve la fecha UTC redondeada a la hora con formato `YYYY-MM-DDTHH:00Z`. Lanza error si la fecha es inválida. */
export function toHourDate(date: Date): string {
  assertValidDate(date);
  return `${date.toISOString().slice(0, 13)}:00Z`;
}

const MEXICO_CENTRAL_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Día civil `YYYY-MM-DD` en la hora del centro de México (`America/Mexico_City`), con el que se
 * cuentan los plazos legales. Es distinto de `toDayDate`, que redondea en UTC por privacidad: un
 * acto del jueves a las 19:00 hora del centro ya es viernes en UTC. Lanza error si la fecha es
 * inválida.
 */
export function toMexicoCentralDay(date: Date): string {
  assertValidDate(date);
  return MEXICO_CENTRAL_DAY.format(date);
}
