// Prueba de trabajo en el navegador: pide un reto, lo resuelve en un Web Worker del mismo origen,
// arma la cabecera que exige el servidor, estima la espera y renueva el reto una vez si vence.
import type { PowChallenge, PowPurpose } from '@sigilo/contracts';
import { formatPowHeader, powSolveSeconds, solvePow } from '@sigilo/core';
import { ApiRequestError } from '../services/api-client.ts';
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
 * Estimado en lenguaje claro de lo que puede tardar un reto de `bits` en un celular sencillo: el
 * percentil 95 a 50 mil hashes por segundo (`powSolveSeconds`), redondeado hacia arriba.
 */
export function describePowWait(bits: number): string {
  const seconds = powSolveSeconds(bits);
  if (seconds < 5) return 'Puede tardar unos segundos.';
  if (seconds < 55) {
    return `En un celular sencillo puede tardar hasta ${Math.ceil(seconds / 10) * 10} segundos.`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `En un celular sencillo puede tardar hasta ${minutes === 1 ? '1 minuto' : `${minutes} minutos`}.`;
}

/**
 * Pide un reto para `purpose`, lo resuelve y devuelve el valor de la cabecera `POW_HEADER`.
 * `announce` recibe mensajes en lectura fácil: uno al empezar, con el estimado de espera, y, si
 * tarda, uno cada `POW_PROGRESS_INTERVAL_MS`.
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
    announce(`Protegiendo tu envío contra envíos automáticos. ${describePowWait(challenge.bits)}`);
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

/** Solución reutilizable de un reto: la misma cabecera sirve hasta que el servidor la rechace. */
export interface ProofProvider {
  /** Cabecera vigente; resuelve el reto la primera vez. */
  current(): Promise<string>;
  /** Pide y resuelve un reto nuevo, que sustituye al vigente. */
  renew(): Promise<string>;
}

/**
 * Crea el proveedor de pruebas de `purpose`. Un reto `complaint` cubre las pruebas y el envío de
 * la denuncia, así que una denuncia resuelve un solo reto en lugar de uno por petición.
 */
export function createProofProvider(
  api: PowApi,
  purpose: PowPurpose,
  solver: PowSolver,
  announce: (message: string) => void,
): ProofProvider {
  let header: Promise<string> | null = null;
  const renew = (): Promise<string> => {
    header = obtainProof(api, purpose, solver, announce);
    return header;
  };
  return { current: () => header ?? renew(), renew };
}

/**
 * Envía con la prueba vigente. Si el servidor responde `proof_required` (el reto venció, agotó sus
 * usos o la dificultad subió mientras tanto), resuelve otro y reintenta una sola vez.
 */
export async function sendWithProof<T>(
  proofs: ProofProvider,
  send: (proof: string) => Promise<T>,
): Promise<T> {
  try {
    return await send(await proofs.current());
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.code !== 'proof_required') throw error;
    return send(await proofs.renew());
  }
}
