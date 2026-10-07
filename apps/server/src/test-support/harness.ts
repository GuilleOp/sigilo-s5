// Utilidades de prueba: servidor en memoria con llaves generadas, reloj controlable y datos sintéticos.
import type { DatabaseSync } from 'node:sqlite';
import type { Hono } from 'hono';
import { ROUTES } from '@sigilo/contracts';
import type {
  ComplaintMode,
  EvidenceDescriptor,
  EvidenceMediaType,
  IdentityBlock,
  PublicKeySet,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import {
  buildPublicKeySet,
  deriveReceiptKeys,
  generateBoxKeyPair,
  generateReceiptPhrase,
  generateSigningKeyPair,
  identityContextFor,
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
import type { EvidenceStore } from '../storage/evidence-store.ts';

/** Token sintético de la autoridad para pruebas. */
export const TEST_TOKEN = 'token-de-prueba-0123456789-abcdefghijkl';

/** Servidor de prueba con sus llaves, su base y su reloj. */
export interface TestServer {
  app: Hono;
  db: DatabaseSync;
  evidenceStore: EvidenceStore;
  keys: ServerKeys;
  serverPublicKey: Uint8Array;
  authorityBox: KeyPair;
  authoritySigning: KeyPair;
  logs: RequestLogEntry[];
  setNow(date: Date): void;
  /** Esperas que pidió el freno global, en milisegundos (no se espera de verdad). */
  sleeps: number[];
}

/** Momento inicial del reloj de prueba: un martes a media tarde (UTC). */
export const TEST_START = new Date('2026-10-20T15:42:17Z');

/** Un día después del inicio: los eventos del día inicial ya se publicaron en la bitácora. */
export const NEXT_DAY = new Date('2026-10-21T09:00:00Z');

/** Primer día del mes siguiente: el mes inicial ya está completo para datos abiertos. */
export const NEXT_MONTH = new Date('2026-11-02T09:00:00Z');

/** Crea un servidor con SQLite en memoria y llaves nuevas. */
export function createTestServer(overrides: Partial<AppDeps> = {}): TestServer {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const publicKeySet: PublicKeySet = buildPublicKeySet({
    serverSigningPublicKey: server.publicKey,
    authorityBoxPublicKey: authorityBox.publicKey,
    authoritySigningPublicKey: authoritySigning.publicKey,
  });
  const keys: ServerKeys = {
    publicKeySet,
    serverSigningPrivateKey: server.privateKey,
    authoritySigningPublicKey: authoritySigning.publicKey,
  };
  let now = TEST_START;
  const logs: RequestLogEntry[] = [];
  const sleeps: number[] = [];
  const db = overrides.db ?? openDatabase(':memory:');
  const evidenceStore = overrides.evidenceStore ?? createMemoryEvidenceStore();
  const app = createApp({
    db,
    keys,
    evidenceStore,
    authorityToken: TEST_TOKEN,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    logger: (entry) => logs.push(entry),
    ...overrides,
  });
  return {
    app,
    db,
    evidenceStore,
    sleeps,
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

/** Bloque de identidad sintético de las denuncias selladas de prueba. */
export const SYNTHETIC_IDENTITY: IdentityBlock = {
  fullName: 'Persona Sintética de Prueba',
  witnesses: [],
  originalEvidenceSha256: [],
};

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
      entityId: 'VE-OBRAS',
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
      SYNTHETIC_IDENTITY,
      { keyId: server.keys.publicKeySet.authority.keyId, publicKey: server.authorityBox.publicKey },
      identityContextFor(request),
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

/** Destinatario de los sobres hacia la autoridad de prueba. */
export function authorityRecipient(server: TestServer) {
  return {
    keyId: server.keys.publicKeySet.authority.keyId,
    publicKey: server.authorityBox.publicKey,
  };
}

/** Destinatario de los sobres hacia el buzón de la persona denunciante. */
export function reporterRecipient(reporter: ReceiptKeys) {
  return { keyId: keyIdFor(reporter.box.publicKey), publicKey: reporter.box.publicKey };
}
