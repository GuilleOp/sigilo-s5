// Utilidades de prueba: servidor en memoria con llaves generadas, reloj controlable y datos sintéticos.
import type { Hono } from 'hono';
import { ROUTES } from '@sigilo/contracts';
import type {
  ComplaintMode,
  EvidenceDescriptor,
  EvidenceMediaType,
  PublicKeySet,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import {
  deriveReceiptKeys,
  generateBoxKeyPair,
  generateReceiptPhrase,
  generateSigningKeyPair,
  keyIdFor,
  sealIdentity,
  toBase64Url,
} from '@sigilo/core';
import type { KeyPair, ReceiptKeys } from '@sigilo/core';
import { createApp } from '../app.ts';
import type { AppDeps, RequestLogEntry } from '../app.ts';
import { openDatabase } from '../db/database.ts';
import type { ServerKeys } from '../keys-file.ts';
import { createMemoryEvidenceStore } from '../storage/evidence-store.ts';

/** Token sintético de la autoridad para pruebas. */
export const TEST_TOKEN = 'token-de-prueba-0123456789-abcdefghijkl';

/** Servidor de prueba con sus llaves y su reloj. */
export interface TestServer {
  app: Hono;
  keys: ServerKeys;
  serverPublicKey: Uint8Array;
  authorityBox: KeyPair;
  authoritySigning: KeyPair;
  logs: RequestLogEntry[];
  setNow(date: Date): void;
}

/** Crea un servidor con SQLite en memoria y llaves nuevas. */
export function createTestServer(overrides: Partial<AppDeps> = {}): TestServer {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const publicKeySet: PublicKeySet = {
    server: { keyId: keyIdFor(server.publicKey), signingPublicKey: toBase64Url(server.publicKey) },
    authority: {
      keyId: keyIdFor(authorityBox.publicKey),
      boxPublicKey: toBase64Url(authorityBox.publicKey),
      signingPublicKey: toBase64Url(authoritySigning.publicKey),
    },
  };
  const keys: ServerKeys = {
    publicKeySet,
    serverSigningPrivateKey: server.privateKey,
    authoritySigningPublicKey: authoritySigning.publicKey,
  };
  let now = new Date('2026-10-20T15:42:17Z');
  const logs: RequestLogEntry[] = [];
  const app = createApp({
    db: openDatabase(':memory:'),
    keys,
    evidenceStore: createMemoryEvidenceStore(),
    authorityToken: TEST_TOKEN,
    now: () => now,
    logger: (entry) => logs.push(entry),
    ...overrides,
  });
  return {
    app,
    keys,
    serverPublicKey: server.publicKey,
    authorityBox,
    authoritySigning,
    logs,
    setNow: (date) => {
      now = date;
    },
  };
}

/** Imagen PNG sintética: firma real seguida de bytes de relleno. */
export function samplePng(size = 64): Uint8Array {
  const bytes = new Uint8Array(size).fill(7);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

/** Imagen JPEG sintética: firma real seguida de bytes de relleno. */
export function sampleJpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size).fill(9);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

/** Envía JSON con el token de autoridad si se indica. */
export function postJson(app: Hono, path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

/** Petición GET con el token de autoridad. */
export function getAsAuthority(app: Hono, path: string, token = TEST_TOKEN) {
  return app.request(path, { headers: { Authorization: `Bearer ${token}` } });
}

/** Sube una prueba y devuelve la respuesta cruda. */
export function uploadEvidence(
  app: Hono,
  bytes: Uint8Array,
  mediaType: EvidenceMediaType | string,
) {
  return app.request(ROUTES.evidenceUpload, {
    method: 'POST',
    headers: { 'Content-Type': mediaType },
    body: bytes,
  });
}

/** Persona denunciante sintética: llaves derivadas de un recibo nuevo. */
export function createReporter(): ReceiptKeys {
  return deriveReceiptKeys(generateReceiptPhrase().entropy);
}

/** Opciones de una denuncia sintética. */
export interface ComplaintOptions {
  mode: ComplaintMode;
  reporter: ReceiptKeys;
  evidence?: EvidenceDescriptor[];
  stateCode?: string;
  offenseCode?: string;
}

/** Construye una solicitud de denuncia con hechos sintéticos y, si es sellada, su identidad. */
export async function buildComplaintRequest(
  server: TestServer,
  options: ComplaintOptions,
): Promise<SubmitComplaintRequest> {
  const { mode, reporter } = options;
  const request: SubmitComplaintRequest = {
    version: 1,
    mode,
    facts: {
      stateCode: options.stateCode ?? '22',
      entityId: 'ente-sintetico-001',
      offenseCode: options.offenseCode ?? 'LGRA-52',
      occurredPeriod: '2026-08',
      accused: 'Titular de la unidad sintética de compras',
      description: 'Descripción sintética de hechos para pruebas automatizadas del servidor.',
    },
    evidence: options.evidence ?? [],
    protectionRequested: mode === 'sealed',
    reporterKeys: {
      boxPublicKey: toBase64Url(reporter.box.publicKey),
      signingPublicKey: toBase64Url(reporter.signing.publicKey),
    },
    authVerifier: reporter.authVerifier,
  };
  if (mode === 'sealed') {
    request.sealedIdentity = await sealIdentity(
      {
        fullName: 'Persona Sintética de Prueba',
        witnesses: [],
        originalEvidenceSha256: [],
      },
      { keyId: server.keys.publicKeySet.authority.keyId, publicKey: server.authorityBox.publicKey },
      reporter.authVerifier,
    );
  }
  return request;
}

/** Envía una denuncia y devuelve la respuesta ya leída; falla si no es 201. */
export async function submitComplaint(
  server: TestServer,
  request: SubmitComplaintRequest,
): Promise<SubmitComplaintResponse> {
  const response = await postJson(server.app, ROUTES.complaints, request);
  if (response.status !== 201) throw new Error(`Estatus inesperado ${response.status}`);
  return (await response.json()) as SubmitComplaintResponse;
}

/** Credenciales de seguimiento de la persona denunciante. */
export function credentialsFor(folio: string, reporter: ReceiptKeys) {
  return { folio, authKey: toBase64Url(reporter.authKey) };
}
