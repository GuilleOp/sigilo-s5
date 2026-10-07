// Fechas redondeadas en UTC para reducir la correlación temporal de eventos.

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
