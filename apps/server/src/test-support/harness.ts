// Utilidades de prueba: servidor en memoria con llaves generadas, reloj controlable y datos sintéticos.
import type { DatabaseSync } from 'node:sqlite';
import type { Hono } from 'hono';
import {
  IdentityOpeningRequestViewSchema,
  OpenIdentityResponseSchema,
  ROUTES,
} from '@sigilo/contracts';
import type {
  ComplaintMode,
  EvidenceDescriptor,
  EvidenceMediaType,
  HpkeEnvelope,
  OpenIdentityResponse,
  ProcedureActionRequest,
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
  sealEscalation,
  sealIdentity,
  toBase64Url,
} from '@sigilo/core';
import type { KeyPair, ReceiptKeys } from '@sigilo/core';
import { createAppFromContext } from '../app.ts';
import type { AppContext, AppDeps, RequestLogEntry } from '../app.ts';
import { createContext } from '../context.ts';
import { openDatabase } from '../db/database.ts';
import { createLedgerRepository } from '../db/ledger-repository.ts';
import { createLedgerService } from '../ledger-service.ts';
import { createRequestLog } from '../http/request-log.ts';
import type { ServerKeys } from '../keys-file.ts';
import { createAuthorityRegistry } from '../security/authority-registry.ts';
import type { AuthorityRegistry } from '../security/authority-registry.ts';
import { hashPassword } from '../security/passwords.ts';
import { createSessionStore } from '../security/sessions.ts';
import { runEscalationRules } from '../services/rules-engine.ts';
import type { RulesRunResult } from '../services/rules-engine.ts';
import { createMemoryEvidenceStore } from '../storage/evidence-store.ts';
import type { EvidenceStore } from '../storage/evidence-store.ts';

/** Autoridades sintéticas del nodo de prueba. */
export const TEST_AUTHORITIES = {
  inbox: 'authority.buzon-prueba',
  oic: 'authority.oic-prueba',
  other: 'authority.otra-prueba',
  supervisor: 'authority.supervision-prueba',
} as const;

/** Cuentas sintéticas del nodo de prueba: autoridad, función, usuario y contraseña. */
export const TEST_ACCOUNTS = {
  inboxIntake: {
    accountId: 'acct-0000000000000001',
    username: 'recepcion.buzon',
    authorityId: TEST_AUTHORITIES.inbox,
    functions: ['intake'],
  },
  inboxInvestigator: {
    accountId: 'acct-0000000000000002',
    username: 'investigacion.buzon.uno',
    authorityId: TEST_AUTHORITIES.inbox,
    functions: ['investigation'],
  },
  inboxInvestigator2: {
    accountId: 'acct-0000000000000003',
    username: 'investigacion.buzon.dos',
    authorityId: TEST_AUTHORITIES.inbox,
    functions: ['investigation'],
  },
  inboxSupervision: {
    accountId: 'acct-0000000000000004',
    username: 'supervision.buzon',
    authorityId: TEST_AUTHORITIES.inbox,
    functions: ['supervision'],
  },
  oicIntake: {
    accountId: 'acct-0000000000000005',
    username: 'recepcion.oic',
    authorityId: TEST_AUTHORITIES.oic,
    functions: ['intake'],
  },
  oicInvestigator: {
    accountId: 'acct-0000000000000006',
    username: 'investigacion.oic.uno',
    authorityId: TEST_AUTHORITIES.oic,
    functions: ['investigation'],
  },
  oicInvestigator2: {
    accountId: 'acct-0000000000000007',
    username: 'investigacion.oic.dos',
    authorityId: TEST_AUTHORITIES.oic,
    functions: ['investigation'],
  },
  otherInvestigator: {
    accountId: 'acct-0000000000000008',
    username: 'investigacion.otra',
    authorityId: TEST_AUTHORITIES.other,
    functions: ['investigation'],
  },
  supervisor: {
    accountId: 'acct-0000000000000009',
    username: 'supervision.central',
    authorityId: TEST_AUTHORITIES.supervisor,
    functions: ['supervision'],
  },
  /** Recepción e investigación en la misma cuenta, como el área de quejas de un OIC. */
  oicIntakeInvestigator: {
    accountId: 'acct-000000000000000a',
    username: 'oic.recepcion-investigacion',
    authorityId: TEST_AUTHORITIES.oic,
    functions: ['intake', 'investigation'],
  },
  /** Substanciación y resolución del OIC: avanza lo posterior al IPRA. */
  oicSubstantiation: {
    accountId: 'acct-000000000000000b',
    username: 'oic.substanciacion',
    authorityId: TEST_AUTHORITIES.oic,
    functions: ['substantiation'],
  },
  /** Operación del nodo: solo resuelve solicitudes de alta; nunca ve denuncias. */
  nodeOperation: {
    accountId: 'acct-000000000000000c',
    username: 'operacion.nodo',
    authorityId: TEST_AUTHORITIES.inbox,
    functions: ['operation'],
  },
} as const;

/** Nombre de una cuenta sintética de prueba. */
export type TestAccountName = keyof typeof TEST_ACCOUNTS;

/** Contraseña sintética de una cuenta de prueba (nunca se usa fuera de estas pruebas). */
export function testPassword(name: TestAccountName): string {
  return `contraseña-sintética-${name}`;
}

/** Token de sesión ya abierta de una cuenta de prueba (el servidor de prueba lo acepta). */
export function testToken(name: TestAccountName): string {
  return `sesion-de-prueba-${name}-0123456789abcdef`;
}

/**
 * Sesión de la investigación del buzón general, que es donde llegan las denuncias nuevas: la que
 * usan las pruebas que no son de cuentas ni del trámite.
 */
export const TEST_TOKEN = testToken('inboxInvestigator');

let cachedRegistry: AuthorityRegistry | null = null;

/** Registro de autoridades y cuentas de prueba, con digestos baratos (2^10) para que sea rápido. */
export function testAuthorityRegistry(): AuthorityRegistry {
  cachedRegistry ??= createAuthorityRegistry(
    {
      version: 1,
      inboxAuthorityId: TEST_AUTHORITIES.inbox,
      authorities: [
        {
          authorityId: TEST_AUTHORITIES.inbox,
          name: 'Buzón general de prueba',
          supervisorId: TEST_AUTHORITIES.supervisor,
        },
        {
          authorityId: TEST_AUTHORITIES.oic,
          name: 'Órgano interno de control de prueba',
          supervisorId: TEST_AUTHORITIES.supervisor,
        },
        {
          authorityId: TEST_AUTHORITIES.other,
          name: 'Otra autoridad de prueba',
          supervisorId: TEST_AUTHORITIES.supervisor,
        },
        { authorityId: TEST_AUTHORITIES.supervisor, name: 'Supervisora de prueba' },
      ],
      accounts: Object.entries(TEST_ACCOUNTS).map(([name, account]) => ({
        ...account,
        functions: [...account.functions],
        passwordHash: hashPassword(testPassword(name as TestAccountName), 10),
      })),
    },
    { minScryptLogN: 10 },
  );
  return cachedRegistry;
}

/** Servidor de prueba con sus llaves, su base y su reloj. */
export interface TestServer {
  app: Hono;
  db: DatabaseSync;
  evidenceStore: EvidenceStore;
  keys: ServerKeys;
  serverPublicKey: Uint8Array;
  authorityBox: KeyPair;
  authoritySigning: KeyPair;
  /** Llave de la supervisora (segunda llave). */
  supervisorBox: KeyPair;
  /** Contexto con los mismos servicios que las rutas. */
  ctx: AppContext;
  logs: RequestLogEntry[];
  setNow(date: Date): void;
  /**
   * Cierra los días de la bitácora como la tarea programada de `main.ts` (las lecturas ya no lo
   * hacen) y devuelve cuántos eventos encadenó.
   */
  closeDays(): Promise<number>;
  /** Cambia el reloj y después cierra los días, como si hubiera corrido la tarea programada. */
  advanceTo(date: Date): Promise<number>;
  /** Esperas que pidió el freno global, en milisegundos (no se espera de verdad). */
  sleeps: number[];
  /** Corre el motor de reglas de escalamiento como la tarea programada. */
  runRules(): RulesRunResult;
}

/** Momento inicial del reloj de prueba: un martes a media tarde (UTC). */
export const TEST_START = new Date('2026-10-20T15:42:17Z');

/** Un día después del inicio: los eventos del día inicial ya se publicaron en la bitácora. */
export const NEXT_DAY = new Date('2026-10-21T09:00:00Z');

/** Primer día del mes siguiente: el mes inicial ya está completo para datos abiertos. */
export const NEXT_MONTH = new Date('2026-11-02T09:00:00Z');

/**
 * Crea un servidor con SQLite en memoria y llaves nuevas. La prueba de trabajo queda desactivada
 * (`powBits` 0) salvo que se indique otra cosa.
 */
export function createTestServer(overrides: Partial<AppDeps> = {}): TestServer {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const supervisorBox = generateBoxKeyPair();
  const publicKeySet: PublicKeySet = buildPublicKeySet({
    serverSigningPublicKey: server.publicKey,
    authorityBoxPublicKey: authorityBox.publicKey,
    authoritySigningPublicKey: authoritySigning.publicKey,
    supervisorBoxPublicKey: supervisorBox.publicKey,
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
  // Las pruebas adelantan el reloj días o meses: las sesiones abiertas aquí no vencen. Los
  // vencimientos se prueban con su propio almacén (`sessions.test.ts`).
  const longLived = 400 * 24 * 60 * 60 * 1000;
  const sessions = createSessionStore(() => now, { idleMs: longLived, absoluteMs: longLived });
  // Una sesión abierta por cuenta, con su token fijo, para no iniciar sesión en cada prueba.
  for (const [name, account] of Object.entries(TEST_ACCOUNTS)) {
    sessions.issue(account.accountId, testToken(name as TestAccountName));
  }
  const ctx = createContext({
    db,
    keys,
    evidenceStore,
    authorities: testAuthorityRegistry(),
    sessions,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    // Una línea por petición para poder revisar en las pruebas que no se registran datos.
    requestLog: createRequestLog({
      mode: 'requests',
      now: () => now,
      write: (line) => {
        if ('route' in line) logs.push(line);
      },
    }),
    ...overrides,
  });
  const app = createAppFromContext(ctx);
  const ledger = createLedgerService({
    db,
    repository: createLedgerRepository(db),
    serverKeyId: keys.publicKeySet.server.keyId,
    serverSigningPrivateKey: keys.serverSigningPrivateKey,
    now: () => now,
    ...(overrides.maxPendingEventsPerDay === undefined
      ? {}
      : { maxPendingPerDay: overrides.maxPendingEventsPerDay }),
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
    supervisorBox,
    ctx,
    logs,
    setNow: (date) => {
      now = date;
    },
    closeDays: () => ledger.publishClosedDays(),
    advanceTo: (date) => {
      now = date;
      return ledger.publishClosedDays();
    },
    runRules: () => runEscalationRules(ctx),
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
  /** Agrega la segunda llave: el sobre de escalamiento hacia la supervisora de prueba. */
  withEscalation?: boolean;
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
  if (options.withEscalation === true) {
    request.escalationEnvelope = await sealEscalation(
      request,
      {
        keyId: keyIdFor(server.supervisorBox.publicKey),
        publicKey: server.supervisorBox.publicKey,
      },
      { authVerifier: request.authVerifier, reporterKeys: request.reporterKeys },
    );
  }
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

/**
 * Cuerpo de un mensaje del buzón tal como lo define el contrato: sin `from`, que el servidor
 * deduce de la ruta (las peticiones con campos de más se rechazan).
 */
export function messageBody(sealed: {
  sequence: number;
  envelope: HpkeEnvelope;
  signature: string;
}): { sequence: number; envelope: HpkeEnvelope; signature: string } {
  return { sequence: sealed.sequence, envelope: sealed.envelope, signature: sealed.signature };
}

/** Acción del trámite con la sesión de una cuenta de prueba; devuelve la respuesta cruda. */
export function procedureAs(
  server: TestServer,
  name: TestAccountName,
  folio: string,
  request: ProcedureActionRequest,
) {
  return postJson(server.app, ROUTES.authorityProcedure(folio), request, testToken(name));
}

/** Acuerdo sintético en versión pública para los cierres de prueba. */
export const SYNTHETIC_AGREEMENT =
  'Acuerdo sintético de prueba: se concluye el trámite del expediente ficticio con fundamento en el artículo 100 de la ley.';

async function expectOk(response: Response): Promise<void> {
  if (response.status !== 200) {
    throw new Error(`Acción del trámite rechazada: ${response.status} ${await response.text()}`);
  }
}

/**
 * Lleva una denuncia del buzón general al estatus pedido con acciones reales del trámite:
 * `routing` la turna y la devuelve (vuelve al buzón); `archived` la cierra en el buzón por
 * información insuficiente; `routed` la turna al OIC de prueba.
 */
export async function moveTo(
  server: TestServer,
  folio: string,
  status: 'routing' | 'archived' | 'routed',
): Promise<void> {
  if (status === 'archived') {
    await expectOk(
      await procedureAs(server, 'inboxIntake', folio, {
        action: 'close',
        reason: 'insufficient_information',
        legalBasis: 'Fundamento sintético: no hay datos suficientes para tramitar.',
        agreement: SYNTHETIC_AGREEMENT,
      }),
    );
    return;
  }
  await expectOk(
    await procedureAs(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
    }),
  );
  if (status === 'routing') {
    await expectOk(
      await procedureAs(server, 'oicIntake', folio, {
        action: 'return',
        note: 'No nos corresponde: se devuelve al buzón general (sintético).',
      }),
    );
  }
}

/**
 * Apertura de identidad 2 de 3 con cuentas de prueba de la misma autoridad: `first` solicita con
 * su fundamento, `second` aprueba con el suyo y `first` recibe el sobre.
 */
export async function openIdentityTwoOfThree(
  server: TestServer,
  folio: string,
  legalBasis: string,
  first: TestAccountName = 'inboxInvestigator',
  second: TestAccountName = 'inboxInvestigator2',
): Promise<OpenIdentityResponse> {
  const requested = await postJson(
    server.app,
    ROUTES.authorityIdentityRequests(folio),
    { legalBasis },
    testToken(first),
  );
  if (requested.status !== 201) throw new Error(`Solicitud rechazada: ${requested.status}`);
  const { requestId } = IdentityOpeningRequestViewSchema.parse(await requested.json());
  const approved = await postJson(
    server.app,
    ROUTES.authorityIdentityApprovals(folio, requestId),
    { legalBasis: 'Segunda aprobación sintética con su propio fundamento legal.' },
    testToken(second),
  );
  if (approved.status !== 200) throw new Error(`Aprobación rechazada: ${approved.status}`);
  const released = await postJson(
    server.app,
    ROUTES.authorityIdentityEnvelope(folio, requestId),
    {},
    testToken(first),
  );
  if (released.status !== 200) throw new Error(`Entrega rechazada: ${released.status}`);
  return OpenIdentityResponseSchema.parse(await released.json());
}
