// Punto de entrada del enrutador: lee la configuración y sus archivos, verifica el directorio,
// abre la base, programa la recolección de cabezas y el corte nacional de datos abiertos, y escucha.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { PDN_SCOPES } from '@sigilo/contracts';
import type { DirectoryNode } from '@sigilo/contracts';
import { toDayDate, toHourDate } from '@sigilo/core';
import { checkNodeHistory } from '@sigilo/red';
import { createRouterApp } from './app.ts';
import { collectNodeHeads } from './collector.ts';
import { loadRelaySecrets, loadRouterConfig, loadRouterFiles, openDataClock } from './config.ts';
import { openRouterDatabase } from './database.ts';
import { loadDirectoryStore } from './directory-store.ts';
import { createNationalLedgerService } from './national-ledger-service.ts';
import { loadNodeCredentials } from './oauth/node-credentials.ts';
import { createNodeTokenClient } from './oauth/token-client.ts';
import { createOpenDataAggregator } from './open-data-aggregator.ts';
import { createRelayService } from './relay-service.ts';

function start(): void {
  const config = loadRouterConfig(process.env);
  const files = loadRouterFiles(config.dataDir);
  const now = (): Date => new Date();
  const today = (): string => toDayDate(now());
  const db = openRouterDatabase(join(config.dataDir, 'enrutador.db'));
  const nodeUrl = (node: DirectoryNode): string => config.nodeUrls[node.id] ?? node.baseUrl;
  const doFetch = (input: string | Request, init?: RequestInit) => fetch(input, init);
  const national = createNationalLedgerService({
    db,
    operatorPrivateKey: files.operatorPrivateKey,
    // H4: antes de aceptar una cabeza, el enrutador descarga el tramo de la bitácora del nodo.
    verifyNodeHistory: (node, previous, next) =>
      checkNodeHistory({ fetch: doFetch, baseUrl: nodeUrl(node), previous, next }),
  });
  const directory = loadDirectoryStore(db, files.directory, files.trust, national, today());
  const relaySecrets = loadRelaySecrets(config.dataDir);
  // OAuth 2.0: cada nodo es su propio servidor de autorización; la SESNA, el cliente.
  const tokens = createNodeTokenClient({
    credentials: loadNodeCredentials(config.dataDir),
    nodeUrl,
    fetch: doFetch,
  });
  const relay = createRelayService({
    db,
    nodeUrl,
    fetch: doFetch,
    relaySecret: (node) => relaySecrets.get(node.id) ?? null,
    authorization: (node) => tokens.token(node, PDN_SCOPES.deliveries),
    onUnauthorized: (node) => tokens.invalidate(node, PDN_SCOPES.deliveries),
  });
  const openData = createOpenDataAggregator({
    directory: directory.directory,
    national,
    nodeUrl,
    fetch: doFetch,
    now: openDataClock(process.env),
  });
  const app = createRouterApp({
    directory,
    national,
    relay,
    openData,
    now,
    hstsMaxAgeSeconds: config.hstsMaxAgeSeconds,
  });

  let isCollecting = false;
  const collect = async (): Promise<void> => {
    if (isCollecting) return;
    isCollecting = true;
    try {
      let nodes: Awaited<ReturnType<typeof collectNodeHeads>> | null = null;
      try {
        nodes = await collectNodeHeads({
          national,
          directory: directory.directory,
          nodeUrl,
          fetch: doFetch,
          today,
        });
      } catch {
        console.error('No se pudo completar la recolección de cabezas.');
      }
      // Después de las cabezas, para que el corte cite la cabeza más reciente de cada nodo.
      let openDataNodes: Record<string, string> | null = null;
      try {
        const cut = await openData.run();
        openDataNodes = Object.fromEntries(cut.nodes.map((node) => [node.nodeId, node.status]));
      } catch {
        console.error('No se pudo completar el corte nacional de datos abiertos.');
      }
      // Seguridad: una línea agregada por vuelta, sin destinos, IP, tokens ni contenidos.
      process.stdout.write(
        `${JSON.stringify({ hour: toHourDate(now()), relay: relay.drainCounters(), nodes, openData: openDataNodes })}\n`,
      );
    } finally {
      isCollecting = false;
    }
  };
  void collect();
  const timer = setInterval(() => void collect(), config.collectIntervalSeconds * 1000);

  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    process.stdout.write(`Enrutador SIGILO escuchando en http://${config.host}:${info.port}\n`);
  });
  const shutdown = (): void => {
    clearInterval(timer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

try {
  start();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el enrutador.');
  process.exit(1);
}
