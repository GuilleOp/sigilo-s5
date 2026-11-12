// Red completa en memoria para las pruebas de integración: enrutador ciego real, nodos Federal y
// Querétaro con el servidor de referencia, evaluador e índice de corroboración, fuentes sintéticas
// de la PDN y un reloj común. Todo con llaves nuevas y datos sintéticos del escenario de la demo.
import type { NodeFront } from '../http/exposure.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Hono } from 'hono';
import { NETWORK_ROUTES, PDN_SCOPES, ROUTES } from '@sigilo/contracts';
import type {
  AuthorityFunction,
  AuthorityAccountsFile,
  NetworkTrustAnchor,
  RoutedReply,
  SignedAuthorityDirectory,
  SubmitComplaintRequest,
} from '@sigilo/contracts';
import { buildPublicKeySet, keyIdFor, randomBytes, toDayDate } from '@sigilo/core';
import type { KeyPair } from '@sigilo/core';
import {
  DEMO_INBOX_AUTHORITY_IDS,
  DEMO_WITNESS_IDS,
  cosignDirectory,
  demoWitnessPrivateKey,
  openRoutedReply,
  sealRoutedRequest,
  signDirectory,
  trustAnchorFromDirectory,
} from '@sigilo/red';
import type { DemoNodeId, FetchLike } from '@sigilo/red';
import { createTestCorroboration } from '../../../corroboracion/src/test-support.ts';
import type { TestCorroboration } from '../../../corroboracion/src/test-support.ts';
import { createRouterApp } from '../../../enrutador/src/app.ts';
import { openRouterDatabase } from '../../../enrutador/src/database.ts';
import { loadDirectoryStore } from '../../../enrutador/src/directory-store.ts';
import { createNationalLedgerService } from '../../../enrutador/src/national-ledger-service.ts';
import { createNodeStatisticsAggregator } from '../../../enrutador/src/node-statistics.ts';
import type { NodeStatisticsAggregator } from '../../../enrutador/src/node-statistics.ts';
import { createNodeTokenClient } from '../../../enrutador/src/oauth/token-client.ts';
import type { NodeTokenClient } from '../../../enrutador/src/oauth/token-client.ts';
import { createOpenDataAggregator } from '../../../enrutador/src/open-data-aggregator.ts';
import type { OpenDataAggregator } from '../../../enrutador/src/open-data-aggregator.ts';
import { createQueuePow } from '../../../enrutador/src/queue-pow.ts';
import type { QueuePow } from '../../../enrutador/src/queue-pow.ts';
import { createRelayQueue } from '../../../enrutador/src/relay-queue.ts';
import type { RelayQueue } from '../../../enrutador/src/relay-queue.ts';
import { createRelayService } from '../../../enrutador/src/relay-service.ts';
import type { RelayService } from '../../../enrutador/src/relay-service.ts';
import type { AppContext } from '../context.ts';
import type { ServerKeys } from '../keys-file.ts';
import type { NodeNetwork } from '../network/network-context.ts';
import { createNetworkTasks } from '../network/network-tasks.ts';
import { clientSecretDigest, createNodeOAuthServer } from '../network/oauth-server.ts';
import type { NetworkTasks } from '../network/network-tasks.ts';
import { createAuthorityRegistry } from '../security/authority-registry.ts';
import { hashPassword } from '../security/passwords.ts';
import { createSessionStore } from '../security/sessions.ts';
import { syntheticPdnSources } from '../services/pdn-sources.ts';
import { createTestServer } from './harness.ts';
import type { TestServer } from './harness.ts';

const ROUTER_URL = 'http://enrutador.invalid';

/** Credenciales sintéticas que cada nodo de prueba entrega a la SESNA (OAuth 2.0). */
export const SESNA_CLIENT = {
  clientId: 'sesna',
  clientSecret: 'secreto-sintetico-de-la-sesna-0123456789',
  username: 'sesna.pdn',
  password: 'contraseña-sintética-de-la-sesna',
} as const;

const SESNA_PASSWORD_HASH = hashPassword(SESNA_CLIENT.password, 10);

/** Día 0 del escenario a las 10 de la mañana en el centro de México. */
export const DAY_ZERO = '2026-11-09';

/** Momento del día N del escenario a la hora indicada (UTC). */
export function scenarioDate(day: number, time = '16:00:00'): Date {
  const date = new Date(`${DAY_ZERO}T${time}Z`);
  date.setUTCDate(date.getUTCDate() + day);
  return date;
}

/** Cuenta sintética de un nodo de prueba. */
interface NodeAccount {
  name: string;
  accountId: string;
  username: string;
  authorityId: string;
  functions: readonly AuthorityFunction[];
}

/** Cuentas de los dos nodos de prueba. */
export const NETWORK_ACCOUNTS = {
  federalInboxIntake: {
    accountId: 'acct-00000000000000f1',
    username: 'recepcion.buzon.federal',
    authorityId: 'authority.buzon-federal',
    functions: ['intake'],
  },
  iffeIntake: {
    accountId: 'acct-00000000000000f2',
    username: 'recepcion.oic.iffe',
    authorityId: 'authority.oic-iffe',
    functions: ['intake'],
  },
  iffeInvestigator: {
    accountId: 'acct-00000000000000f3',
    username: 'investigacion.oic.iffe',
    authorityId: 'authority.oic-iffe',
    functions: ['investigation'],
  },
  iffeSupervision: {
    accountId: 'acct-00000000000000f5',
    username: 'supervision.oic.iffe',
    authorityId: 'authority.oic-iffe',
    functions: ['supervision'],
  },
  oversight: {
    accountId: 'acct-00000000000000f4',
    username: 'supervision.federal',
    authorityId: 'authority.oversight-federal',
    functions: ['supervision'],
  },
  queretaroIntake: {
    accountId: 'acct-00000000000000e1',
    username: 'recepcion.contraloria.queretaro',
    authorityId: 'authority.comptroller-queretaro',
    functions: ['intake'],
  },
} as const satisfies Record<string, Omit<NodeAccount, 'name'>>;

export type NetworkAccountName = keyof typeof NETWORK_ACCOUNTS;

/** Token de sesión ya abierta de una cuenta de la red de prueba. */
export function networkToken(name: NetworkAccountName): string {
  return `sesion-de-red-${name}-0123456789abcdef`;
}

/** Titular sintética del OIC del IFFE: la misma persona que el S1 sintético (escenario 5.1). */
const IFFE_HEAD = {
  fullName: 'Servidora Ficticia Dos',
  institution: 'Instituto Federal Ficticio de Equipamiento',
  stateCode: '00',
};

function accountsFile(nodeId: DemoNodeId): AuthorityAccountsFile {
  const accounts = Object.entries(NETWORK_ACCOUNTS)
    .filter(([name]) => (nodeId === 'node.federal') !== name.startsWith('queretaro'))
    .map(([name, account]) => ({
      ...account,
      functions: [...account.functions],
      passwordHash: hashPassword(`contraseña-sintética-${name}`, 10),
    }));
  if (nodeId === 'node.queretaro') {
    return {
      version: 1,
      inboxAuthorityId: 'authority.buzon-queretaro',
      authorities: [
        { authorityId: 'authority.buzon-queretaro', name: 'Buzón general de Querétaro' },
        {
          authorityId: 'authority.comptroller-queretaro',
          name: 'Contraloría Estatal Ficticia de Querétaro',
        },
      ],
      accounts,
    };
  }
  const supervisorId = 'authority.oversight-federal';
  return {
    version: 1,
    inboxAuthorityId: 'authority.buzon-federal',
    authorities: [
      {
        authorityId: 'authority.buzon-federal',
        name: 'Buzón general del nodo Federal',
        supervisorId,
      },
      {
        authorityId: 'authority.oic-iffe',
        name: 'Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento',
        supervisorId,
        head: IFFE_HEAD,
      },
      {
        authorityId: 'authority.oic-dfps',
        name: 'Órgano Interno de Control en la Delegación Federal Ficticia de Programas Sociales',
        supervisorId,
      },
      {
        authorityId: supervisorId,
        name: 'Unidad Ficticia de Supervisión de Órganos Internos de Control',
      },
    ],
    accounts,
  };
}

/** Un nodo de la red de prueba. */
export interface TestNode {
  nodeId: DemoNodeId;
  server: TestServer;
  ctx: AppContext;
  app: Hono;
  tasks: NetworkTasks;
  /** Llave del buzón general del nodo (la de `keys.json`, que es la publicada en el directorio). */
  inboxBox: KeyPair;
}

/** Red de prueba completa. */
export interface TestNetwork {
  services: TestCorroboration;
  signed: SignedAuthorityDirectory;
  trust: NetworkTrustAnchor;
  routerApp: Hono;
  relay: RelayService;
  /** Cola de entrega del enrutador y su reto (dificultad 0 en pruebas). */
  queue: RelayQueue;
  queuePow: QueuePow;
  /** Apaga o prende un nodo: apagado, el enrutador no recibe respuesta de su buzón. */
  setNodeDown(nodeId: DemoNodeId, isDown: boolean): void;
  /** Agregador nacional de datos abiertos del enrutador. */
  openData: OpenDataAggregator;
  /** Corte nacional de la estadística que la SESNA consulta a cada nodo con OAuth 2.0. */
  statistics: NodeStatisticsAggregator;
  /** Cliente OAuth 2.0 de la SESNA ante cada nodo. */
  tokens: NodeTokenClient;
  /** Cuerpos que el enrutador reenvió a los nodos (para comprobar que no ve el contenido). */
  forwarded: string[];
  federal: TestNode;
  queretaro: TestNode;
  /** Mueve el reloj común (nodos, enrutador e índice). */
  setNow(date: Date): void;
  /** Lo que hace la tarea periódica de cada nodo después de cerrar los días de su bitácora. */
  runNodeTasks(node: TestNode): Promise<void>;
}

function createNode(
  nodeId: DemoNodeId,
  services: TestCorroboration,
  signed: SignedAuthorityDirectory,
  trust: NetworkTrustAnchor,
  networkFetch: FetchLike,
  now: () => Date,
  relaySecret: Uint8Array,
  exposedFronts?: ReadonlySet<NodeFront>,
): TestNode {
  const nodeKeys = services.network.nodes[nodeId];
  // El buzón general está en el directorio (papel `inbox`): `keys.json` lleva su llave publicada.
  const inbox = services.network.authorities[DEMO_INBOX_AUTHORITY_IDS[nodeId]];
  const inboxBox = inbox.box;
  const inboxSigning = inbox.signing;
  const supervisor =
    nodeId === 'node.federal'
      ? services.network.authorities['authority.oversight-federal'].box.publicKey
      : undefined;
  const keys: ServerKeys = {
    publicKeySet: buildPublicKeySet({
      serverSigningPublicKey: nodeKeys.signing.publicKey,
      authorityBoxPublicKey: inboxBox.publicKey,
      authoritySigningPublicKey: inboxSigning.publicKey,
      ...(supervisor === undefined ? {} : { supervisorBoxPublicKey: supervisor }),
    }),
    serverSigningPrivateKey: nodeKeys.signing.privateKey,
    authoritySigningPublicKey: inboxSigning.publicKey,
  };
  const network: NodeNetwork = {
    nodeId,
    nodeBoxPrivateKey: nodeKeys.box.privateKey,
    relaySecret,
    directory: services.directory,
    trust,
    signedDirectory: signed,
    routerUrl: ROUTER_URL,
    fetch: networkFetch,
  };
  const longLived = 400 * 24 * 60 * 60 * 1000;
  const sessions = createSessionStore(now, { idleMs: longLived, absoluteMs: longLived });
  for (const [name, account] of Object.entries(NETWORK_ACCOUNTS)) {
    sessions.issue(account.accountId, networkToken(name as NetworkAccountName));
  }
  // El nodo es su propio servidor de autorización y la SESNA su cliente (como en la PDN).
  const oauth = createNodeOAuthServer({
    issuer: nodeId,
    clients: [
      {
        clientId: SESNA_CLIENT.clientId,
        clientSecretDigest: clientSecretDigest(SESNA_CLIENT.clientSecret),
        scopes: [PDN_SCOPES.deliveries, PDN_SCOPES.statistics],
        grantTypes: ['client_credentials', 'password', 'refresh_token'],
        user: { username: SESNA_CLIENT.username, passwordHash: SESNA_PASSWORD_HASH },
      },
    ],
  });
  const server = createTestServer({
    keys,
    oauth,
    authorities: createAuthorityRegistry(accountsFile(nodeId), { minScryptLogN: 10 }),
    sessions,
    network,
    pdnSources: syntheticPdnSources(),
    corroboration: {
      indexUrl: 'http://indice.invalid',
      nodeSecret: services.nodeSecrets[nodeId],
      fetch: networkFetch,
    },
    isAuditEnabled: true,
    ...(exposedFronts === undefined ? {} : { exposedFronts }),
  });
  const witnessDir = mkdtempSync(join(tmpdir(), `sigilo-testigo-${nodeId}-`));
  return {
    nodeId,
    server,
    ctx: server.ctx,
    app: server.app,
    tasks: createNetworkTasks(server.ctx, network, join(witnessDir, 'witness-state.json')),
    inboxBox,
  };
}

/**
 * Crea la red: directorio del escenario con la llave del evaluador, firmado por la operación y
 * cofirmado por los tres testigos; enrutador con su base en un archivo temporal; y los dos nodos.
 * Los nodos aún no están registrados: la primera vuelta de sus tareas los registra.
 */
export function createTestNetwork(
  options: {
    /** Frentes que publican los nodos (H03); por omisión, todos. */
    nodeFronts?: ReadonlySet<NodeFront>;
  } = {},
): TestNetwork {
  // El índice exige la confirmación del nodo, como el servicio real (H3).
  const services = createTestCorroboration({ requireConfirmation: true });
  let signed = signDirectory(services.directory, services.network.operator.privateKey);
  for (const id of DEMO_WITNESS_IDS) {
    signed = cosignDirectory(signed, id, demoWitnessPrivateKey(services.network, id));
  }
  const trust = trustAnchorFromDirectory(services.directory);
  let current = scenarioDate(0);
  const now = (): Date => new Date(current.getTime());
  const routerDb = openRouterDatabase(
    join(mkdtempSync(join(tmpdir(), 'sigilo-enrutador-')), 'enrutador.db'),
  );
  const national = createNationalLedgerService({
    db: routerDb,
    operatorPrivateKey: services.network.operator.privateKey,
  });
  const directory = loadDirectoryStore(routerDb, signed, trust, national, DAY_ZERO);
  const forwarded: string[] = [];
  const apps = new Map<string, Hono>();
  // `fetch` de la red: cada origen sintético es una aplicación en memoria.
  const networkFetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const app = apps.get(new URL(request.url).origin);
    if (app === undefined) return new Response('', { status: 502 });
    return app.request(request);
  };
  const downOrigins = new Set<string>();
  const nodeFetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    forwarded.push(await request.clone().text());
    // Un nodo caído: la conexión falla, como si no respondiera.
    if (downOrigins.has(new URL(request.url).origin)) throw new TypeError('fetch failed');
    return networkFetch(request);
  };
  // Secreto del buzón de cada nodo compartido con el enrutador (H11).
  const relaySecrets: Record<DemoNodeId, Uint8Array> = {
    'node.federal': randomBytes(32),
    'node.queretaro': randomBytes(32),
    'node.oaxaca': randomBytes(32),
  };
  const tokens = createNodeTokenClient({
    credentials: new Map(
      (['node.federal', 'node.queretaro'] as const).map((id) => [
        id,
        {
          clientId: SESNA_CLIENT.clientId,
          clientSecret: SESNA_CLIENT.clientSecret,
          grantType: 'client_credentials' as const,
        },
      ]),
    ),
    nodeUrl: (node) => node.baseUrl,
    fetch: networkFetch,
  });
  const relay = createRelayService({
    db: routerDb,
    nodeUrl: (node) => node.baseUrl,
    fetch: nodeFetch,
    relaySecret: (node) => relaySecrets[node.id as DemoNodeId] ?? null,
    authorization: (node) => tokens.token(node, PDN_SCOPES.deliveries),
    onUnauthorized: (node) => tokens.invalidate(node, PDN_SCOPES.deliveries),
  });
  const openData = createOpenDataAggregator({
    directory: directory.directory,
    national,
    nodeUrl: (node) => node.baseUrl,
    fetch: networkFetch,
    now,
  });
  const queue = createRelayQueue({
    db: routerDb,
    deliver: relay.deliver,
    directory: directory.directory,
    now,
    operatorPrivateKey: services.network.operator.privateKey,
    operatorKeyId: keyIdFor(services.network.operator.publicKey),
  });
  const queuePow = createQueuePow({ bits: 0, now });
  const statistics = createNodeStatisticsAggregator({
    directory: directory.directory,
    nodeUrl: (node) => node.baseUrl,
    fetch: networkFetch,
    tokens,
    now,
  });
  const routerApp = createRouterApp({
    directory,
    national,
    relay,
    queue: { store: queue, pow: queuePow },
    openData,
    statistics,
    now,
  });
  const federal = createNode(
    'node.federal',
    services,
    signed,
    trust,
    networkFetch,
    now,
    relaySecrets['node.federal'],
    options.nodeFronts,
  );
  const queretaro = createNode(
    'node.queretaro',
    services,
    signed,
    trust,
    networkFetch,
    now,
    relaySecrets['node.queretaro'],
    options.nodeFronts,
  );
  apps.set(ROUTER_URL, routerApp);
  apps.set('http://indice.invalid', services.indexApp);
  apps.set('http://evaluador.invalid', services.evaluatorApp);
  apps.set('http://nodo-federal.invalid', federal.app);
  apps.set('http://nodo-queretaro.invalid', queretaro.app);
  const setNow = (date: Date): void => {
    current = date;
    services.clock.set(date.toISOString());
    federal.server.setNow(date);
    queretaro.server.setNow(date);
  };
  setNow(current);
  return {
    services,
    signed,
    trust,
    routerApp,
    relay,
    queue,
    queuePow,
    setNodeDown(nodeId, isDown) {
      const origin = services.directory.nodes.find((node) => node.id === nodeId)?.baseUrl;
      if (origin === undefined) throw new Error(`Nodo desconocido: ${nodeId}.`);
      if (isDown) downOrigins.add(origin);
      else downOrigins.delete(origin);
    },
    openData,
    statistics,
    tokens,
    forwarded,
    federal,
    queretaro,
    setNow,
    async runNodeTasks(node) {
      await node.ctx.ledger.publishClosedDays();
      await node.tasks.run();
    },
  };
}

/**
 * Lo que hace el navegador en la ventanilla única: cifra la operación hacia el nodo de la autoridad,
 * la manda al enrutador ciego y abre la respuesta con su llave efímera.
 */
export async function sendThroughRouter(
  network: TestNetwork,
  to: string,
  operation: { operationId: 'submitComplaint' | 'getTracking'; body: unknown },
): Promise<RoutedReply> {
  const relay = await sealedRelay(network, to, operation);
  const response = await network.routerApp.request(`${ROUTER_URL}${NETWORK_ROUTES.relay}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relay.relay),
  });
  if (response.status !== 200) throw new Error(`El enrutador respondió ${response.status}.`);
  return openRoutedReply(await response.json(), relay.replyPrivateKey, to);
}

/** Sobre de red hacia la autoridad `to`, con la llave efímera para abrir la respuesta. */
export async function sealedRelay(
  network: TestNetwork,
  to: string,
  operation: { operationId: 'submitComplaint' | 'getTracking'; body: unknown; folio?: string },
) {
  const authority = network.services.directory.authorities.find((item) => item.id === to);
  const node = network.services.directory.nodes.find((item) => item.id === authority?.nodeId);
  if (node === undefined) throw new Error(`Autoridad sin nodo: ${to}.`);
  return sealRoutedRequest(
    {
      to,
      operationId: operation.operationId,
      query: {},
      proofOfWork: null,
      body: { kind: 'json', value: operation.body },
      ...(operation.folio === undefined ? {} : { folio: operation.folio }),
    },
    node,
  );
}

/** Envía una denuncia directo a la entrada propia del nodo (sin enrutador). */
export async function submitDirect(node: TestNode, request: SubmitComplaintRequest) {
  const response = await node.app.request(ROUTES.complaints, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (response.status !== 201) throw new Error(`El nodo respondió ${response.status}.`);
  return response;
}

/** Día legal del reloj del nodo. */
export function nodeDay(node: TestNode): string {
  return toDayDate(node.ctx.deps.now());
}
