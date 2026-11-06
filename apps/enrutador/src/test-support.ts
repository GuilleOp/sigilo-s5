// Arnés de pruebas del enrutador: red sintética con llaves nuevas, base en un archivo temporal y
// nodos falsos que responden con el buzón de red real de @sigilo/red.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Hono } from 'hono';
import { LEDGER_GENESIS_HASH, ROUTES } from '@sigilo/contracts';
import type { LedgerEvent, NetworkTrustAnchor, SignedAuthorityDirectory } from '@sigilo/contracts';
import { keyIdFor, signLedgerHead } from '@sigilo/core';
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
import { createRelayService } from './relay-service.ts';
import type { RelayService } from './relay-service.ts';

export const TEST_DAY = '2026-11-09';
export const NODE_URLS: Record<DemoNodeId, string> = {
  'node.queretaro': 'http://nodo-queretaro.invalid',
  'node.federal': 'http://nodo-federal.invalid',
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
  } = {},
): TestRouter {
  const network = options.network ?? createTestNetwork();
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sigilo-enrutador-')), 'enrutador.db');
  const db = openRouterDatabase(dbPath);
  const nodeLedgers: Record<DemoNodeId, LedgerEvent[]> = {
    'node.queretaro': [],
    'node.federal': [],
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
  const inboxes = new Map(
    (Object.keys(NODE_URLS) as DemoNodeId[]).map((id) => [
      NODE_URLS[id],
      createNodeInboxHandler({
        nodeBoxPrivateKey: network.keys.nodes[id].box.privateKey,
        handle: async () => ({
          v: 1,
          status: 201,
          body: { kind: 'json', value: { recibido: true } },
        }),
      }),
    ]),
  );
  const nodeFetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    const body = await request.clone().text();
    captured.push({ url: request.url, headers: Object.fromEntries(request.headers), body });
    const handler = inboxes.get(new URL(request.url).origin);
    if (handler === undefined) return new Response('', { status: 502 });
    return handler(request);
  };
  const relay = createRelayService({ db, nodeUrl: (node) => node.baseUrl, fetch: nodeFetch });
  const app = createRouterApp({
    directory,
    national,
    relay,
    now: () => new Date(`${TEST_DAY}T12:00:00Z`),
  });
  return {
    app,
    db,
    dbPath,
    ...network,
    directory,
    national,
    relay,
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
