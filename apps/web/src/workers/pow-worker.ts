// Web Worker del mismo origen que resuelve la prueba de trabajo sin bloquear la página.
import { solvePow } from '@sigilo/core';

/** Mensaje que recibe el worker. */
export interface PowWorkerRequest {
  token: string;
  bits: number;
}

/** Mensajes que envía el worker. */
export type PowWorkerResponse =
  { type: 'progress'; attempts: number } | { type: 'done'; counter: string } | { type: 'failed' };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<PowWorkerRequest>) => void) | null;
  postMessage: (message: PowWorkerResponse) => void;
};

scope.onmessage = (event) => {
  try {
    const counter = solvePow(event.data.token, event.data.bits, {
      onProgress: (attempts) => scope.postMessage({ type: 'progress', attempts }),
    });
    scope.postMessage(counter === null ? { type: 'failed' } : { type: 'done', counter });
  } catch {
    scope.postMessage({ type: 'failed' });
  }
};
