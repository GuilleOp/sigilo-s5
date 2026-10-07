// Reloj del servidor de prueba: lee y adelanta el desplazamiento de `SIGILO_TEST_CLOCK_FILE`.
// Solo se adelanta, nunca se atrasa, para que el orden de los eventos siga siendo coherente.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { clockFilePath } from './environment.ts';

/** Margen tras el cambio de día o de mes, para no depender de milisegundos exactos. */
const MARGIN_MS = 60 * 60 * 1000;

function readOffset(): number {
  const file = clockFilePath();
  if (!existsSync(file)) return 0;
  const text = readFileSync(file, 'utf8').trim();
  return text === '' ? 0 : Number(text);
}

/** Hora actual según el servidor de prueba. */
export function serverNow(): Date {
  return new Date(Date.now() + readOffset());
}

/** Adelanta el reloj del servidor al menos hasta `target`. */
export function advanceServerClockTo(target: Date): void {
  const needed = target.getTime() - Date.now();
  if (needed > readOffset()) writeFileSync(clockFilePath(), String(needed));
}

/**
 * Adelanta el reloj del servidor al día siguiente (UTC): la bitácora publica entonces todos los
 * eventos registrados hasta ahora.
 */
export function advanceServerClockToNextDay(): void {
  const now = serverNow();
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  advanceServerClockTo(new Date(nextDay + MARGIN_MS));
}

/**
 * Adelanta el reloj del servidor al mes siguiente (UTC): los datos abiertos publican entonces el
 * mes en curso, ya completo.
 */
export function advanceServerClockToNextMonth(): void {
  const now = serverNow();
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  advanceServerClockTo(new Date(nextMonth + MARGIN_MS));
}
