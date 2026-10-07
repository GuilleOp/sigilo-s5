// Reloj del servidor de prueba: lee y adelanta el desplazamiento de `SIGILO_TEST_CLOCK_FILE`.
// Solo se adelanta, nunca se atrasa, para que el orden de los eventos siga siendo coherente.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { toDayDate } from '@sigilo/core';
import { openServerDatabase } from './database.ts';
import { clockFilePath } from './environment.ts';

/** Espera máxima a que la tarea programada del servidor (cada segundo en pruebas) cierre los días. */
const CLOSE_TIMEOUT_MS = 15_000;
const POLL_MS = 100;

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
  // Seguridad: el servidor exige que el archivo no sea escribible por el grupo ni por otros.
  if (needed > readOffset()) writeFileSync(clockFilePath(), String(needed), { mode: 0o600 });
}

function hasPendingBefore(day: string): boolean {
  const db = openServerDatabase();
  try {
    return (
      db.prepare('SELECT 1 AS found FROM ledger_pending WHERE at < ? LIMIT 1').get(day) !==
      undefined
    );
  } finally {
    db.close();
  }
}

/**
 * Espera a que la tarea programada del servidor encadene todos los eventos de días anteriores al
 * de hoy según su reloj: las lecturas públicas ya no cierran días. Lanza error si no ocurre a
 * tiempo.
 */
export async function waitForClosedDays(): Promise<void> {
  const today = toDayDate(serverNow());
  const deadline = Date.now() + CLOSE_TIMEOUT_MS;
  while (hasPendingBefore(today)) {
    if (Date.now() > deadline) throw new Error('El servidor no cerró los días de la bitácora.');
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * Adelanta el reloj del servidor al día siguiente (UTC) y espera a que la bitácora publique todos
 * los eventos registrados hasta ahora.
 */
export async function advanceServerClockToNextDay(): Promise<void> {
  const now = serverNow();
  const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  advanceServerClockTo(new Date(nextDay + MARGIN_MS));
  await waitForClosedDays();
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
