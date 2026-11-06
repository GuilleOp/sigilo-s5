// Corroboración ciega en el navegador (ADR 0006): ciega el identificador, pide su evaluación VOPRF
// con prueba de trabajo, verifica la prueba DLEQ contra la llave del directorio y calcula la
// etiqueta y el resumen difuso del relato. El identificador nunca sale del navegador.
import {
  CORROBORATION_ROUTES,
  CorroborationEvaluationResponseSchema,
  POW_HEADER,
  PowChallengeSchema,
} from '@sigilo/contracts';
import type { CorroborationEvaluatorKey } from '@sigilo/contracts';
import { formatPowHeader, solvePow, toBase64Url } from '@sigilo/core';
import {
  blindCorroboration,
  finalizeCorroboration,
  normalizeIdentifier,
  similarityDigest,
} from '@sigilo/corroboracion';
import type { CorroborationIdentifier } from '@sigilo/corroboracion';
import type { CorroborationDraft } from '../state/report-draft.ts';
import type { ApiClient } from '../services/api-client.ts';

/** Lo que viaja dentro de la denuncia cifrada hacia el nodo: etiqueta, época y resumen difuso. */
export interface CorroborationPayload {
  epoch: number;
  tag: string;
  similarity: string | null;
}

/**
 * Identificador del borrador ya validado, o el motivo en español si no sirve. `null` si la persona
 * no quiere corroborar.
 */
export function identifierFromDraft(
  draft: CorroborationDraft,
  entityId: string,
): { identifier: CorroborationIdentifier } | { error: string } | null {
  if (draft.kind === '') return null;
  const identifier: CorroborationIdentifier =
    draft.kind === 'ocid'
      ? { kind: 'ocid', ocid: draft.value }
      : draft.kind === 'rfc'
        ? { kind: 'rfc', rfc: draft.value }
        : { kind: 'servidor', name: draft.personName, entityId };
  try {
    normalizeIdentifier(identifier);
    return { identifier };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'El dato no es válido.' };
  }
}

/**
 * Obtiene la etiqueta de corroboración. Lanza error si el evaluador no responde, si su prueba DLEQ
 * no corresponde a la llave publicada en el directorio o si la prueba de trabajo no se resuelve;
 * quien llama envía la denuncia igual, sin corroboración.
 * Seguridad: la llave del evaluador sale del directorio verificado, nunca de la respuesta.
 */
export async function corroborateBlindly(
  identifier: CorroborationIdentifier,
  key: CorroborationEvaluatorKey,
  narrative: string,
  client: ApiClient,
): Promise<CorroborationPayload> {
  const state = blindCorroboration(identifier, key);
  const challenge = await client.json(CORROBORATION_ROUTES.evaluatorChallenge, PowChallengeSchema);
  const counter = solvePow(challenge.token, challenge.bits);
  if (counter === null) throw new Error('No se resolvió la prueba de trabajo.');
  const response = await client.json(
    CORROBORATION_ROUTES.evaluations,
    CorroborationEvaluationResponseSchema,
    { json: state.request, headers: { [POW_HEADER]: formatPowHeader(challenge.token, counter) } },
  );
  const keys = finalizeCorroboration(state, response, key);
  const digest = similarityDigest(narrative, keys.similarityKey);
  keys.similarityKey.fill(0);
  return {
    epoch: keys.epoch,
    tag: keys.tag,
    similarity: digest === null ? null : toBase64Url(digest),
  };
}
