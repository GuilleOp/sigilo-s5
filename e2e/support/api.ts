// Ayudantes de API desde Node: siembra de denuncias anónimas y selladas con la misma criptografía
// que usa la web y consultas de la autoridad con el token bearer de prueba.
import type { APIRequestContext, APIResponse } from '@playwright/test';
import {
  ComplaintDetailSchema,
  PublicKeySetSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import type {
  ComplaintDetail,
  ComplaintFacts,
  HpkeEnvelope,
  SubmitComplaintRequest,
} from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import type { PinnedKeys } from '../../apps/web/src/config/pinned-keys.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  sealReporterIdentity,
} from '../../apps/web/src/crypto/submission.ts';
import type { FreshReceipt } from '../../apps/web/src/crypto/submission.ts';
import { API_ORIGIN, AUTHORITY_TOKEN } from './environment.ts';
import type { Receipt } from './report-wizard.ts';

/** Hechos sintéticos válidos para sembrar denuncias sin pasar por la interfaz. */
export function syntheticFacts(overrides: Partial<ComplaintFacts> = {}): ComplaintFacts {
  const now = new Date();
  return {
    stateCode: '22',
    entityId: 'VE-OBRAS',
    offenseCode: 'LGRA-52',
    occurredPeriod: `${now.getFullYear()}-01`,
    accused: 'La persona titular del área de compras de un ente ficticio',
    description: 'Hechos sintéticos de prueba: un contrato asignado sin licitación pública.',
    ...overrides,
  };
}

/** Recibo de una denuncia sembrada, con la secuencia de su evento en la bitácora. */
export interface SeededComplaint extends Receipt {
  ledgerSeq: number;
}

/** Envía una solicitud de denuncia tal cual, sin comprobar la respuesta. */
export function postComplaint(
  request: APIRequestContext,
  body: SubmitComplaintRequest,
): Promise<APIResponse> {
  return request.post(`${API_ORIGIN}${ROUTES.complaints}`, { data: body });
}

async function submitSeed(
  request: APIRequestContext,
  body: SubmitComplaintRequest,
  receipt: FreshReceipt,
): Promise<SeededComplaint> {
  const response = await postComplaint(request, body);
  if (!response.ok()) throw new Error(`No se pudo sembrar la denuncia: ${response.status()}`);
  const parsed = SubmitComplaintResponseSchema.parse(await response.json());
  return { folio: parsed.folio, words: receipt.words, ledgerSeq: parsed.receipt.ledgerSeq };
}

/**
 * Siembra una denuncia anónima: genera el recibo y las llaves igual que el navegador y la envía.
 * Devuelve el folio, las 8 palabras para dar seguimiento y la secuencia de su evento.
 */
export async function seedAnonymousComplaint(
  request: APIRequestContext,
  facts: ComplaintFacts = syntheticFacts(),
): Promise<SeededComplaint> {
  const receipt = createReceipt();
  const body = buildSubmitRequest(
    { mode: 'anonymous', facts, evidence: [], protectionRequested: false },
    receipt.keys,
    undefined,
  );
  return submitSeed(request, body, receipt);
}

/**
 * Llaves públicas que publica el servidor de prueba, con la forma de las fijadas en la web.
 * En E2E coinciden con las del bundle porque `keys.json` se copia del despliegue local.
 */
export async function fetchPinnedKeys(request: APIRequestContext): Promise<PinnedKeys> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.keys}`);
  const set = PublicKeySetSchema.parse(await response.json());
  return {
    set,
    serverSigningPublicKey: fromBase64Url(set.server.signingPublicKey),
    authorityBoxPublicKey: fromBase64Url(set.authority.boxPublicKey),
    authoritySigningPublicKey: fromBase64Url(set.authority.signingPublicKey),
  };
}

/** Denuncia sellada preparada (sin enviar): solicitud, recibo y sobre de identidad. */
export interface SealedSubmission {
  body: SubmitComplaintRequest;
  receipt: FreshReceipt;
  sealedIdentity: HpkeEnvelope;
}

/** Prepara una denuncia sellada con un nombre sintético, igual que el navegador. */
export async function prepareSealedComplaint(
  request: APIRequestContext,
  fullName: string,
  facts: ComplaintFacts = syntheticFacts(),
): Promise<SealedSubmission> {
  const pinned = await fetchPinnedKeys(request);
  const receipt = createReceipt();
  const input = { mode: 'sealed' as const, facts, evidence: [], protectionRequested: true };
  const block = buildIdentityBlock({ fullName, contact: '', witnesses: [] }, []);
  const sealedIdentity = await sealReporterIdentity(block, input, receipt.keys, pinned);
  return { body: buildSubmitRequest(input, receipt.keys, sealedIdentity), receipt, sealedIdentity };
}

/** Envía una denuncia sellada ya preparada. */
export function seedPreparedComplaint(
  request: APIRequestContext,
  prepared: SealedSubmission,
): Promise<SeededComplaint> {
  return submitSeed(request, prepared.body, prepared.receipt);
}

const AUTHORITY_HEADERS = { Authorization: `Bearer ${AUTHORITY_TOKEN}` };

/** Detalle de una denuncia tal como lo ve la autoridad. */
export async function fetchComplaintDetail(
  request: APIRequestContext,
  folio: string,
): Promise<ComplaintDetail> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.authorityComplaint(folio)}`, {
    headers: AUTHORITY_HEADERS,
  });
  if (!response.ok()) throw new Error(`No se pudo leer la denuncia: ${response.status()}`);
  return ComplaintDetailSchema.parse(await response.json());
}

/** Descarga una prueba con el token de la autoridad, desde su ruta de evidencia. */
export async function downloadEvidence(
  request: APIRequestContext,
  evidenceId: string,
): Promise<Buffer> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.authorityEvidence(evidenceId)}`, {
    headers: AUTHORITY_HEADERS,
  });
  if (!response.ok()) throw new Error(`No se pudo descargar la prueba: ${response.status()}`);
  return response.body();
}

/** Pide a la autoridad abrir la identidad sellada (queda registrado) y devuelve la respuesta. */
export function requestIdentityOpening(
  request: APIRequestContext,
  folio: string,
  legalBasis: string,
): Promise<APIResponse> {
  return request.post(`${API_ORIGIN}${ROUTES.authorityIdentity(folio)}`, {
    headers: AUTHORITY_HEADERS,
    data: { legalBasis },
  });
}
