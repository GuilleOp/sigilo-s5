// Ayudantes de API desde Node: siembra de denuncias anónimas y selladas con la misma criptografía
// que usa la web, sesiones de las cuentas de prueba, trámite y apertura de identidad 2 de 3.
import type { APIRequestContext, APIResponse } from '@playwright/test';
import {
  AuthorityDemoKeySchema,
  LoginResponseSchema,
  LoginSessionStepSchema,
  ComplaintDetailSchema,
  IdentityOpeningRequestViewSchema,
  NODE_KEY_AUTHORITY_ID,
  OpenIdentityResponseSchema,
  POW_HEADER,
  PowChallengeSchema,
  PublicKeySetSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import type {
  ComplaintDetail,
  ComplaintFacts,
  EvidenceDescriptor,
  HpkeEnvelope,
  OpenIdentityResponse,
  ProcedureActionRequest,
  SubmitComplaintRequest,
} from '@sigilo/contracts';
import {
  formatPowHeader,
  fromBase64Url,
  openEvidenceBody,
  openEvidenceKey,
  solvePow,
} from '@sigilo/core';
import type { PowPurpose } from '@sigilo/contracts';
import type { PinnedKeys } from '../../apps/web/src/config/pinned-keys.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  sealReporterIdentity,
} from '../../apps/web/src/crypto/submission.ts';
import type { FreshReceipt } from '../../apps/web/src/crypto/submission.ts';
import { API_ORIGIN, E2E_ACCOUNTS, E2E_AUTHORITY, e2ePassword } from './environment.ts';
import { nextTotpCode } from './mfa.ts';
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

/**
 * Recibo de una denuncia sembrada, con el identificador (`payloadDigest`) de su evento en la
 * bitácora: su secuencia no existe hasta que se publica el día.
 */
export interface SeededComplaint extends Receipt {
  payloadDigest: string;
}

/**
 * Pide un reto de prueba de trabajo al servidor de prueba y lo resuelve en Node, igual que el
 * worker del navegador. Devuelve el valor de la cabecera `POW_HEADER`.
 */
export async function solveProofOfWork(
  request: APIRequestContext,
  purpose: PowPurpose,
): Promise<string> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.powChallenge}?purpose=${purpose}`);
  const { token, bits } = PowChallengeSchema.parse(await response.json());
  const counter = solvePow(token, bits);
  if (counter === null) throw new Error('No se pudo resolver la prueba de trabajo.');
  return formatPowHeader(token, counter);
}

/** Envía una solicitud de denuncia tal cual, con su prueba de trabajo, sin comprobar la respuesta. */
export async function postComplaint(
  request: APIRequestContext,
  body: SubmitComplaintRequest,
): Promise<APIResponse> {
  const proof = await solveProofOfWork(request, 'complaint');
  return request.post(`${API_ORIGIN}${ROUTES.complaints}`, {
    data: body,
    headers: { [POW_HEADER]: proof },
  });
}

async function submitSeed(
  request: APIRequestContext,
  body: SubmitComplaintRequest,
  receipt: FreshReceipt,
): Promise<SeededComplaint> {
  const response = await postComplaint(request, body);
  if (!response.ok()) throw new Error(`No se pudo sembrar la denuncia: ${response.status()}`);
  const parsed = SubmitComplaintResponseSchema.parse(await response.json());
  return {
    folio: parsed.folio,
    words: receipt.words,
    payloadDigest: parsed.receipt.payloadDigest,
  };
}

/**
 * Siembra una denuncia anónima: genera el recibo y las llaves igual que el navegador y la envía.
 * Devuelve el folio, las 8 palabras para dar seguimiento y el identificador de su evento.
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

/**
 * Abre una sesión de la cuenta y devuelve sus cabeceras. Se inicia sesión en cada llamada: las
 * pruebas adelantan el reloj del servidor y una sesión vieja vencería por inactividad.
 */
export async function sessionHeaders(
  request: APIRequestContext,
  username: string,
): Promise<Record<string, string>> {
  const response = await request.post(`${API_ORIGIN}${ROUTES.authLogin}`, {
    data: { username, password: e2ePassword(username) },
  });
  if (!response.ok()) throw new Error(`No se pudo iniciar sesión: ${response.status()}`);
  const first = LoginResponseSchema.parse(await response.json());
  if (first.step === 'session') return { Authorization: `Bearer ${first.token}` };
  if (first.step === 'enroll') throw new Error(`${username} debe inscribir el segundo factor.`);
  // Cuenta con segundo factor: el código TOTP de su secreto sintético.
  const second = await request.post(`${API_ORIGIN}${ROUTES.authLoginCode}`, {
    data: { challenge: first.challenge, code: await nextTotpCode(username) },
  });
  if (!second.ok()) throw new Error(`No se pudo verificar el código: ${second.status()}`);
  const { token } = LoginSessionStepSchema.parse(await second.json());
  return { Authorization: `Bearer ${token}` };
}

/** Acción del trámite con la cuenta dada; falla si el servidor la rechaza. */
export async function applyProcedure(
  request: APIRequestContext,
  username: string,
  folio: string,
  action: ProcedureActionRequest,
): Promise<void> {
  const response = await request.post(`${API_ORIGIN}${ROUTES.authorityProcedure(folio)}`, {
    headers: await sessionHeaders(request, username),
    data: action,
  });
  if (!response.ok()) throw new Error(`Acción rechazada: ${response.status()}`);
}

/** El buzón general turna la denuncia al OIC de prueba y su recepción la acepta. */
export async function routeToInvestigation(
  request: APIRequestContext,
  folio: string,
): Promise<void> {
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
    note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, folio, { action: 'accept' });
}

/** Detalle de una denuncia tal como lo ve la cuenta dada (por omisión, el buzón general). */
export async function fetchComplaintDetail(
  request: APIRequestContext,
  folio: string,
  username: string = E2E_ACCOUNTS.inboxIntake,
): Promise<ComplaintDetail> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.authorityComplaint(folio)}`, {
    headers: await sessionHeaders(request, username),
  });
  if (!response.ok()) throw new Error(`No se pudo leer la denuncia: ${response.status()}`);
  return ComplaintDetailSchema.parse(await response.json());
}

/** Descarga una prueba con la sesión del buzón general, desde su ruta de evidencia. */
export async function downloadEvidence(
  request: APIRequestContext,
  evidenceId: string,
): Promise<Buffer> {
  const response = await request.get(`${API_ORIGIN}${ROUTES.authorityEvidence(evidenceId)}`, {
    headers: await sessionHeaders(request, E2E_ACCOUNTS.inboxIntake),
  });
  if (!response.ok()) throw new Error(`No se pudo descargar la prueba: ${response.status()}`);
  return response.body();
}

/**
 * Abre en Node, como lo hace el panel, una prueba descargada con la llave de autoridad de la
 * demostración (`authority-demo-key.json`, la del buzón general del nodo): las pruebas llegan
 * cifradas hacia esa llave, con el folio y la llave del nodo en el AAD.
 */
export async function decryptEvidence(
  container: Uint8Array,
  descriptor: EvidenceDescriptor,
  folio: string,
  keyFileText: string,
): Promise<Uint8Array> {
  const key = AuthorityDemoKeySchema.parse(JSON.parse(keyFileText));
  const fileKey = await openEvidenceKey(container, fromBase64Url(key.boxPrivateKey), key.keyId, {
    folio,
    authorityId: NODE_KEY_AUTHORITY_ID,
  });
  return (await openEvidenceBody(container, fileKey, folio, descriptor.mediaType)).plaintext;
}

/** Solicitud de apertura de una cuenta; devuelve la respuesta cruda. */
export async function requestIdentityOpening(
  request: APIRequestContext,
  folio: string,
  legalBasis: string,
  username: string = E2E_ACCOUNTS.iffeInvestigator,
): Promise<APIResponse> {
  return request.post(`${API_ORIGIN}${ROUTES.authorityIdentityRequests(folio)}`, {
    headers: await sessionHeaders(request, username),
    data: { legalBasis },
  });
}

/** Aprobación de otra cuenta a una solicitud de apertura; devuelve la respuesta cruda. */
export async function approveIdentityOpening(
  request: APIRequestContext,
  folio: string,
  requestId: string,
  username: string = E2E_ACCOUNTS.iffeInvestigator2,
): Promise<APIResponse> {
  return request.post(`${API_ORIGIN}${ROUTES.authorityIdentityApprovals(folio, requestId)}`, {
    headers: await sessionHeaders(request, username),
    data: { legalBasis: 'Segunda aprobación sintética: coincido con el fundamento.' },
  });
}

/**
 * Apertura 2 de 3 completa por la API (la denuncia ya debe estar con el OIC de prueba): solicita la
 * investigación uno, aprueba la dos y la uno recibe el sobre.
 */
export async function openIdentityTwoOfThree(
  request: APIRequestContext,
  folio: string,
  legalBasis: string,
): Promise<OpenIdentityResponse> {
  const requested = await requestIdentityOpening(request, folio, legalBasis);
  if (!requested.ok()) throw new Error(`Solicitud rechazada: ${requested.status()}`);
  const { requestId } = IdentityOpeningRequestViewSchema.parse(await requested.json());
  const approved = await approveIdentityOpening(request, folio, requestId);
  if (!approved.ok()) throw new Error(`Aprobación rechazada: ${approved.status()}`);
  const released = await request.post(
    `${API_ORIGIN}${ROUTES.authorityIdentityEnvelope(folio, requestId)}`,
    { headers: await sessionHeaders(request, E2E_ACCOUNTS.iffeInvestigator) },
  );
  if (!released.ok()) throw new Error(`Entrega rechazada: ${released.status()}`);
  return OpenIdentityResponseSchema.parse(await released.json());
}
