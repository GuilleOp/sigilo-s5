// Arnés de pruebas del enrutador: red sintética con llaves nuevas, base en un archivo temporal y
// nodos falsos que responden con el buzón de red real de @sigilo/red.
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Hono } from 'hono';
import { LEDGER_GENESIS_HASH, NETWORK_ROUTES, ROUTES } from '@sigilo/contracts';
import type { LedgerEvent, NetworkTrustAnchor, SignedAuthorityDirectory } from '@sigilo/contracts';
import { keyIdFor, randomBytes, signLedgerHead } from '@sigilo/core';
import {
  DEMO_WITNESS_IDS,
  buildDemoDirectory,
  checkNodeHistory,
  cosignDirectory,
  createNodeInboxHandler,
  demoWitnessPrivateKey,
  generateDemoNetworkKeys,
  signDirectory,
  trustAnchorFromDirectory,
} from '@sigilo/red';
import type { DemoNetworkKeys, DemoNodeId, FetchLike } from '@sigilo/red';
import { createRouterApp } from './app.ts';
import { openRouterDatabase } from './database.ts';
import { loadDirectoryStore } from './directory-store.ts';
import type { DirectoryStore } from './directory-store.ts';
import { createNationalLedgerService } from './national-ledger-service.ts';
import type { NationalLedgerService } from './national-ledger-service.ts';
import { createNodeHealthMonitor } from './node-health.ts';
import type { NodeHealthMonitor } from './node-health.ts';
import { createQueuePow } from './queue-pow.ts';
import { createRelayQueue } from './relay-queue.ts';
import type { RelayQueue, RelayQueueLimits } from './relay-queue.ts';
import { createRelayService } from './relay-service.ts';
import type { RelayService } from './relay-service.ts';

export const TEST_DAY = '2026-11-09';

/** Token de la operación del enrutador de prueba: con él, la salud incluye la cola por nodo. */
export const TEST_OPERATION_TOKEN = 'token-sintetico-de-la-operacion-de-pruebas-0123456789';
export const NODE_URLS: Record<DemoNodeId, string> = {
  'node.queretaro': 'http://nodo-queretaro.invalid',
  'node.federal': 'http://nodo-federal.invalid',
  'node.oaxaca': 'http://nodo-oaxaca.invalid',
};

/** Red sintética firmada y cofirmada por los tres testigos. */
export function createTestNetwork(): {
  keys: DemoNetworkKeys;
  signed: SignedAuthorityDirectory;
  trust: NetworkTrustAnchor;
} {
  const keys = generateDemoNetworkKeys();
  const directory = buildDemoDirectory(keys, { issuedOn: TEST_DAY, baseUrls: NODE_URLS });
  let signed = signDirectory(directory, keys.operator.privateKey);
  for (const id of DEMO_WITNESS_IDS) {
    signed = cosignDirectory(signed, id, demoWitnessPrivateKey(keys, id));
  }
  return { keys, signed, trust: trustAnchorFromDirectory(directory) };
}

/** Petición que recibió un nodo falso. */
export interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Enrutador de prueba con sus piezas expuestas. */
export interface TestRouter {
  app: Hono;
  db: DatabaseSync;
  dbPath: string;
  keys: DemoNetworkKeys;
  signed: SignedAuthorityDirectory;
  trust: NetworkTrustAnchor;
  directory: DirectoryStore;
  national: NationalLedgerService;
  relay: RelayService;
  /** Cola de entrega (reto de dificultad 0). */
  queue: RelayQueue;
  /** Monitor de salud de los nodos. */
  health: NodeHealthMonitor;
  /** Versión de software que reporta cada nodo falso en su salud (se puede cambiar). */
  nodeVersions: Record<DemoNodeId, string>;
  /** Avisos del monitor de salud. */
  warnings: string[];
  /** Reloj del enrutador (se puede mover). */
  setNow(date: Date): void;
  /** Apaga o prende un nodo falso: apagado, la conexión falla. */
  setNodeDown(nodeId: DemoNodeId, isDown: boolean): void;
  /** Peticiones que llegaron a los nodos falsos. */
  captured: CapturedRequest[];
  /** `fetch` que entra a la aplicación del enrutador (para el cliente del nodo y los testigos). */
  routerFetch: FetchLike;
  /** Cabeza firmada sintética del nodo. */
  nodeHead(nodeId: DemoNodeId, seq: number, hash: string): ReturnType<typeof signLedgerHead>;
  /** Bitácora que sirve cada nodo falso en `GET ledgerEvents` (se puede reemplazar). */
  nodeLedgers: Record<DemoNodeId, LedgerEvent[]>;
  /** `fetch` hacia el enrutador y hacia los nodos falsos (para los testigos). */
  networkFetch: FetchLike;
}

/**
 * Crea un enrutador con base en archivo temporal (para inspeccionar el archivo y su WAL) y nodos
 * falsos: cada uno abre los sobres con su llave y responde `201` con un cuerpo fijo.
 */
export function createTestRouter(
  options: {
    network?: ReturnType<typeof createTestNetwork>;
    /** Simula un enrutador que no verifica la historia de los nodos (para probar a los testigos). */
    skipNodeHistory?: boolean;
    /** Secreto HMAC del buzón de cada nodo falso (necesario para las entregas diferidas). */
    withRelaySecrets?: boolean;
    /** Límites de la cola de entrega. */
    queueLimits?: Partial<RelayQueueLimits>;
    /** Versión mínima del software de los nodos. */
    minimumNodeVersion?: string;
    /** Topes del relevo (reenvíos simultáneos y bytes en vuelo). */
    relayLimits?: { maxConcurrentRelays?: number; maxRelayBytesInFlight?: number };
  } = {},
): TestRouter {
  const network = options.network ?? createTestNetwork();
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sigilo-enrutador-')), 'enrutador.db');
  const db = openRouterDatabase(dbPath);
  const nodeLedgers: Record<DemoNodeId, LedgerEvent[]> = {
    'node.queretaro': [],
    'node.federal': [],
    'node.oaxaca': [],
  };
  const ledgerFetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const nodeId = (Object.keys(NODE_URLS) as DemoNodeId[]).find(
      (id) => NODE_URLS[id] === url.origin,
    );
    if (nodeId === undefined || url.pathname !== ROUTES.ledgerEvents) {
      return new Response('', { status: 404 });
    }
    const from = Number(url.searchParams.get('from') ?? '0');
    const limit = Number(url.searchParams.get('limit') ?? '100');
    const events = nodeLedgers[nodeId];
    const last = events.at(-1);
    const signing = network.keys.nodes[nodeId].signing;
    const head = signLedgerHead(
      {
        seq: last?.seq ?? 0,
        hash: last?.hash ?? LEDGER_GENESIS_HASH,
        at: TEST_DAY,
        serverKeyId: keyIdFor(signing.publicKey),
      },
      signing.privateKey,
    );
    return Response.json({
      events: events.filter((event) => event.seq >= from).slice(0, limit),
      head,
    });
  };
  const national = createNationalLedgerService({
    db,
    operatorPrivateKey: network.keys.operator.privateKey,
    verifyNodeHistory: async (node, previous, next) =>
      options.skipNodeHistory === true
        ? { valid: true }
        : checkNodeHistory({ fetch: ledgerFetch, baseUrl: node.baseUrl, previous, next }),
  });
  const directory = loadDirectoryStore(db, network.signed, network.trust, national, TEST_DAY);
  const captured: CapturedRequest[] = [];
  const secrets: Record<DemoNodeId, Uint8Array> = {
    'node.queretaro': randomBytes(32),
    'node.federal': randomBytes(32),
    'node.oaxaca': randomBytes(32),
  };
  const inboxes = new Map(
    (Object.keys(NODE_URLS) as DemoNodeId[]).map((id) => [
      NODE_URLS[id],
      createNodeInboxHandler({
        nodeBoxPrivateKey: network.keys.nodes[id].box.privateKey,
        nodeId: id,
        ...(options.withRelaySecrets === true ? { relaySecret: secrets[id] } : {}),
        handle: async () => ({
          v: 1,
          status: 201,
          body: { kind: 'json', value: { recibido: true } },
        }),
      }),
    ]),
  );
  const down = new Set<string>();
  const nodeVersions: Record<DemoNodeId, string> = {
    'node.queretaro': '1.0.1',
    'node.federal': '1.0.1',
    'node.oaxaca': '1.0.1',
  };
  const warnings: string[] = [];
  let health: NodeHealthMonitor | null = null;
  const nodeFetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const body = await request.clone().text();
    captured.push({ url: request.url, headers: Object.fromEntries(request.headers), body });
    if (down.has(new URL(request.url).origin)) throw new TypeError('fetch failed');
    const nodeId = (Object.keys(NODE_URLS) as DemoNodeId[]).find(
      (id) => NODE_URLS[id] === new URL(request.url).origin,
    );
    if (nodeId !== undefined && new URL(request.url).pathname === NETWORK_ROUTES.nodeHealth) {
      return Response.json({
        v: 1,
        nodeId,
        softwareVersion: nodeVersions[nodeId],
        standardVersion: '0.3.0',
      });
    }
    const handler = inboxes.get(new URL(request.url).origin);
    if (handler === undefined) return new Response('', { status: 502 });
    return handler(request);
  };
  const relay = createRelayService({
    db,
    nodeUrl: (node) => node.baseUrl,
    fetch: nodeFetch,
    ...(options.withRelaySecrets === true
      ? { relaySecret: (node) => secrets[node.id as DemoNodeId] ?? null }
      : {}),
    meetsMinimumVersion: (node) => health?.meetsMinimumVersion(node) ?? true,
  });
  let current = new Date(`${TEST_DAY}T12:00:00Z`);
  const now = (): Date => new Date(current.getTime());
  const queue = createRelayQueue({
    db,
    deliver: relay.deliver,
    directory: directory.directory,
    now,
    operatorPrivateKey: network.keys.operator.privateKey,
    operatorKeyId: keyIdFor(network.keys.operator.publicKey),
    ...(options.queueLimits === undefined ? {} : { limits: options.queueLimits }),
  });
  health = createNodeHealthMonitor({
    directory: directory.directory,
    nodeUrl: (node) => node.baseUrl,
    fetch: nodeFetch,
    now,
    minimumVersion: options.minimumNodeVersion ?? null,
    isRegistered: relay.isRegistered,
    queued: (nodeId) => queue.stats(nodeId).count,
    warn: (message) => warnings.push(message),
  });
  const app = createRouterApp({
    directory,
    national,
    relay,
    queue: { store: queue, pow: createQueuePow({ bits: 0, now }) },
    health,
    now,
    operationTokenDigest: createHash('sha256').update(TEST_OPERATION_TOKEN, 'utf8').digest(),
    ...options.relayLimits,
  });
  return {
    app,
    db,
    dbPath,
    ...network,
    directory,
    national,
    relay,
    queue,
    health,
    nodeVersions,
    warnings,
    setNow(date) {
      current = date;
    },
    setNodeDown(nodeId, isDown) {
      if (isDown) down.add(NODE_URLS[nodeId]);
      else down.delete(NODE_URLS[nodeId]);
    },
    captured,
    routerFetch: async (input, init) => app.request(input, init),
    nodeLedgers,
    networkFetch: async (input, init) => {
      const request = new Request(input, init);
      return new URL(request.url).origin === 'http://enrutador.invalid'
        ? app.request(request)
        : ledgerFetch(request);
    },
    nodeHead(nodeId, seq, hash) {
      const signing = network.keys.nodes[nodeId].signing;
      return signLedgerHead(
        { seq, hash, at: TEST_DAY, serverKeyId: keyIdFor(signing.publicKey) },
        signing.privateKey,
      );
    },
  };
}
