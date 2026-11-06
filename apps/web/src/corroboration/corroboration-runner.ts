// Ejecuta la corroboración ciega en un Web Worker del mismo origen, con un tiempo máximo: si el
// evaluador tarda o falla, la denuncia sale igual, sin corroboración.
import type { CorroborationEvaluatorKey } from '@sigilo/contracts';
import type { CorroborationIdentifier } from '@sigilo/corroboracion';
import type {
  CorroborationWorkerRequest,
  CorroborationWorkerResponse,
} from '../workers/corroboration-worker.ts';
import type { CorroborationPayload } from './blind-corroboration.ts';

/** Ejecuta la corroboración y resuelve con su resultado, o con `null` si no se pudo. */
export type CorroborationRunner = (
  identifier: CorroborationIdentifier,
  key: CorroborationEvaluatorKey,
  narrative: string,
) => Promise<CorroborationPayload | null>;

/** Tiempo máximo de la corroboración antes de enviar sin ella. */
export const CORROBORATION_TIMEOUT_MS = 60_000;

/** Corredor en un Web Worker (Vite lo empaqueta como archivo propio del mismo origen). */
export const workerCorroborationRunner: CorroborationRunner = (identifier, key, narrative) =>
  new Promise((resolve) => {
    const worker = new Worker(new URL('../workers/corroboration-worker.ts', import.meta.url), {
      type: 'module',
      name: 'corroboracion-ciega',
    });
    const finish = (result: CorroborationPayload | null): void => {
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), CORROBORATION_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<CorroborationWorkerResponse>) => {
      finish(event.data.type === 'done' ? event.data.payload : null);
    };
    worker.onerror = () => finish(null);
    const request: CorroborationWorkerRequest = { identifier, key, narrative };
    worker.postMessage(request);
  });
