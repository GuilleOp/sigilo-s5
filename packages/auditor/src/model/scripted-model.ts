// Doble de pruebas del modelo local: responde con guiones fijos (incluidas respuestas maliciosas) y
// guarda las peticiones para comprobar que el texto siempre va delimitado. Sin red.
import { ADAPTER_VERSION } from './client.ts';
import type { LocalModelClient, ModelRequest } from './client.ts';

/** Respuesta guionada: texto, error (modelo caído) o función de la petición. */
export type ScriptedResponse = string | Error | ((request: ModelRequest) => string);

/** Digesto ficticio del doble (no corresponde a ningún archivo de pesos). */
export const SCRIPTED_MODEL_DIGEST = 'f'.repeat(64);

/** Cliente doble con las peticiones recibidas. */
export interface ScriptedModel extends LocalModelClient {
  requests: ModelRequest[];
}

/** Crea un doble que devuelve las respuestas en orden (la última se repite). */
export function createScriptedModel(responses: readonly ScriptedResponse[]): ScriptedModel {
  const requests: ModelRequest[] = [];
  let index = 0;
  return {
    info: {
      name: 'doble-de-pruebas',
      digest: SCRIPTED_MODEL_DIGEST,
      adapterVersion: ADAPTER_VERSION,
    },
    requests,
    generate(request) {
      requests.push(request);
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (response === undefined) return Promise.reject(new Error('Sin respuesta guionada.'));
      if (response instanceof Error) return Promise.reject(response);
      return Promise.resolve(typeof response === 'function' ? response(request) : response);
    },
  };
}
