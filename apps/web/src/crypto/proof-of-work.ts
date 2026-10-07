// Prueba de trabajo en el navegador: pide un reto de un solo uso, lo resuelve en un Web Worker del
// mismo origen y arma la cabecera que exige el servidor.
import type { PowChallenge, PowPurpose } from '@sigilo/contracts';
import { formatPowHeader, solvePow } from '@sigilo/core';
import type { PowWorkerRequest, PowWorkerResponse } from '../workers/pow-worker.ts';

/** Resuelve un reto; `onProgress` recibe cuántos contadores lleva probados. */
export type PowSolver = (
  challenge: PowChallenge,
  onProgress: (attempts: number) => void,
) => Promise<string>;

const SOLVE_ERROR = 'No pudimos completar la protección contra envíos automáticos.';

/** Solucionador en el hilo actual; para pruebas y para dificultad 0. */
export const inlinePowSolver: PowSolver = async (challenge, onProgress) => {
  const counter = solvePow(challenge.token, challenge.bits, { onProgress });
  if (counter === null) throw new Error(SOLVE_ERROR);
  return counter;
};

/**
 * Solucionador en un Web Worker del mismo origen (Vite lo empaqueta como archivo propio).
 * Seguridad: nada se carga de terceros; el worker solo calcula SHA-256 sobre el reto.
 */
export const workerPowSolver: PowSolver = (challenge, onProgress) => {
  if (challenge.bits === 0) return inlinePowSolver(challenge, onProgress);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/pow-worker.ts', import.meta.url), {
      type: 'module',
      name: 'prueba-de-trabajo',
    });
    worker.onmessage = (event: MessageEvent<PowWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress(message.attempts);
        return;
      }
      worker.terminate();
      if (message.type === 'done') resolve(message.counter);
      else reject(new Error(SOLVE_ERROR));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error(SOLVE_ERROR));
    };
    const request: PowWorkerRequest = { token: challenge.token, bits: challenge.bits };
    worker.postMessage(request);
  });
};

/** Lo que necesita `obtainProof` de la API. */
export interface PowApi {
  getPowChallenge(purpose: PowPurpose): Promise<PowChallenge>;
}

/** Intervalo mínimo entre dos avisos de avance, para no saturar a los lectores de pantalla. */
export const POW_PROGRESS_INTERVAL_MS = 4000;

/**
 * Pide un reto para `purpose`, lo resuelve y devuelve el valor de la cabecera `POW_HEADER`.
 * `announce` recibe mensajes en lectura fácil: uno al empezar y, si tarda, uno cada
 * `POW_PROGRESS_INTERVAL_MS`.
 */
export async function obtainProof(
  api: PowApi,
  purpose: PowPurpose,
  solver: PowSolver,
  announce: (message: string) => void,
  now: () => number = Date.now,
): Promise<string> {
  const challenge = await api.getPowChallenge(purpose);
  if (challenge.bits > 0) {
    announce('Protegiendo tu envío contra envíos automáticos. Puede tardar unos segundos.');
  }
  let lastAnnouncedAt = now();
  const counter = await solver(challenge, () => {
    const current = now();
    if (current - lastAnnouncedAt < POW_PROGRESS_INTERVAL_MS) return;
    lastAnnouncedAt = current;
    announce('Seguimos protegiendo tu envío contra envíos automáticos. No cierres esta página.');
  });
  return formatPowHeader(challenge.token, counter);
}
