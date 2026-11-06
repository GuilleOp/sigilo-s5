// Web Worker del mismo origen que hace la corroboración ciega (VOPRF y prueba de trabajo) sin
// bloquear la página. Solo habla con el mismo origen; el identificador nunca sale de aquí en claro.
import type { CorroborationEvaluatorKey } from '@sigilo/contracts';
import type { CorroborationIdentifier } from '@sigilo/corroboracion';
import { corroborateBlindly } from '../corroboration/blind-corroboration.ts';
import type { CorroborationPayload } from '../corroboration/blind-corroboration.ts';
import { createApiClient } from '../services/api-client.ts';

/** Mensaje que recibe el worker. */
export interface CorroborationWorkerRequest {
  identifier: CorroborationIdentifier;
  key: CorroborationEvaluatorKey;
  narrative: string;
}

/** Mensaje que envía el worker. */
export type CorroborationWorkerResponse =
  { type: 'done'; payload: CorroborationPayload } | { type: 'failed' };

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<CorroborationWorkerRequest>) => void) | null;
  postMessage: (message: CorroborationWorkerResponse) => void;
};

scope.onmessage = (event) => {
  const { identifier, key, narrative } = event.data;
  corroborateBlindly(identifier, key, narrative, createApiClient()).then(
    (payload) => scope.postMessage({ type: 'done', payload }),
    () => scope.postMessage({ type: 'failed' }),
  );
};
