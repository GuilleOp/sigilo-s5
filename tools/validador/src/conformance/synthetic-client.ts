// Cliente sintético del modo conformidad: arma denuncias con datos ficticios igual que el
// navegador de referencia (recibo, llaves y sobre HPKE de la identidad) y resuelve la prueba de
// trabajo. Reutiliza `apps/web/src/crypto/submission.ts` para no duplicar el formato v1.
import { POW_HEADER, PowChallengeSchema, PublicKeySetSchema, ROUTES } from '@sigilo/contracts';
import type { ComplaintFacts, PublicKeySet, SubmitComplaintRequest } from '@sigilo/contracts';
import { formatPowHeader, fromBase64Url, solvePow, toBase64Url } from '@sigilo/core';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  sealReporterIdentity,
} from '../../../../apps/web/src/crypto/submission.ts';
import type { PinnedKeys } from '../../../../apps/web/src/config/pinned-keys.ts';
import type { HttpExchange } from '../types.ts';
import type { ApiClient } from './api-client.ts';
import { jsonBodyOf } from './api-client.ts';

/** Nombre ficticio de la identidad sellada (ver docs/datos-sinteticos.md). */
export const SYNTHETIC_FULL_NAME = 'Persona Sintética del Validador';

/** Hechos sintéticos válidos en los catálogos del contrato; no describen a nadie real. */
export function syntheticFacts(now: Date = new Date()): ComplaintFacts {
  return {
    stateCode: '22',
    entityId: 'VE-OBRAS',
    offenseCode: 'LGRA-52',
    occurredPeriod: `${now.getFullYear()}-01`,
    accused: 'La persona titular del área de compras de un ente ficticio',
    description:
      'Denuncia sintética generada por sigilo-validar para comprobar la conformidad del nodo.',
  };
}

/** Llaves públicas publicadas por el nodo, con la forma que usa el cliente de referencia. */
export function toPinnedKeys(set: PublicKeySet): PinnedKeys {
  return {
    set,
    serverSigningPublicKey: fromBase64Url(set.server.signingPublicKey),
    authorityBoxPublicKey: fromBase64Url(set.authority.boxPublicKey),
    authoritySigningPublicKey: fromBase64Url(set.authority.signingPublicKey),
  };
}

/** Lee y valida las llaves públicas; `null` si la respuesta no tiene el formato del estándar. */
export async function fetchPublicKeys(
  client: ApiClient,
): Promise<{ exchange: HttpExchange; keys: PublicKeySet | null }> {
  const exchange = await client.send({
    purpose: 'Llaves públicas del nodo',
    method: 'GET',
    path: ROUTES.keys,
  });
  const parsed = PublicKeySetSchema.safeParse(jsonBodyOf(exchange));
  return { exchange, keys: exchange.status === 200 && parsed.success ? parsed.data : null };
}

/** Pide un reto de prueba de trabajo y lo resuelve. Lanza error si el nodo no lo entrega. */
export async function solveProofOfWork(
  client: ApiClient,
  purpose: 'complaint' | 'message',
): Promise<string> {
  const exchange = await client.send({
    purpose: `Reto de prueba de trabajo (${purpose})`,
    method: 'GET',
    path: `${ROUTES.powChallenge}?purpose=${purpose}`,
  });
  const challenge = PowChallengeSchema.safeParse(jsonBodyOf(exchange));
  if (!challenge.success)
    throw new Error('El nodo no entregó un reto de prueba de trabajo válido.');
  const counter = solvePow(challenge.data.token, challenge.data.bits);
  if (counter === null) throw new Error('No se pudo resolver la prueba de trabajo.');
  return formatPowHeader(challenge.data.token, counter);
}

/** Envía una solicitud de denuncia con su prueba de trabajo. */
export async function postComplaint(
  client: ApiClient,
  purpose: string,
  body: unknown,
): Promise<HttpExchange> {
  const proof = await solveProofOfWork(client, 'complaint');
  return client.send({
    purpose,
    method: 'POST',
    path: ROUTES.complaints,
    json: body,
    headers: { [POW_HEADER]: proof },
  });
}

/** Denuncia sellada sintética lista para enviar. */
export async function buildSealedComplaint(
  keys: PublicKeySet,
): Promise<{ body: SubmitComplaintRequest; authKey: string }> {
  const receipt = createReceipt();
  const input = {
    mode: 'sealed' as const,
    facts: syntheticFacts(),
    evidence: [],
    protectionRequested: false,
  };
  const block = buildIdentityBlock(
    { fullName: SYNTHETIC_FULL_NAME, contact: '', witnesses: [] },
    [],
  );
  const sealedIdentity = await sealReporterIdentity(block, input, receipt.keys, toPinnedKeys(keys));
  return {
    body: buildSubmitRequest(input, receipt.keys, sealedIdentity),
    authKey: toBase64Url(receipt.keys.authKey),
  };
}

/** Denuncia anónima sintética lista para enviar. */
export function buildAnonymousComplaint(): { body: SubmitComplaintRequest; authKey: string } {
  const receipt = createReceipt();
  const body = buildSubmitRequest(
    { mode: 'anonymous', facts: syntheticFacts(), evidence: [], protectionRequested: false },
    receipt.keys,
    undefined,
  );
  return { body, authKey: toBase64Url(receipt.keys.authKey) };
}
