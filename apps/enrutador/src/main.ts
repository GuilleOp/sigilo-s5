// Punto de entrada del enrutador: lee la configuración y sus archivos, verifica el directorio,
// abre la base, programa la recolección de cabezas y el corte nacional de datos abiertos, y escucha.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { PDN_SCOPES } from '@sigilo/contracts';
import type { DirectoryNode } from '@sigilo/contracts';
import { keyIdFor, toDayDate, toHourDate } from '@sigilo/core';
import {
  HTTP_SERVER_OPTIONS,
  checkNodeHistory,
  signingPublicKeyOf,
  withOutboundDefaults,
} from '@sigilo/red';
import { createRouterApp } from './app.ts';
import { collectNodeHeads } from './collector.ts';
import {
  assertSecureNodeUrls,
  loadRelaySecrets,
  loadRouterConfig,
  loadRouterFiles,
  openDataClock,
} from './config.ts';
import { openRouterDatabase } from './database.ts';
import { loadDirectoryStore } from './directory-store.ts';
import { createNationalLedgerService } from './national-ledger-service.ts';
import { createNodeStatisticsAggregator } from './node-statistics.ts';
import { loadNodeCredentials } from './oauth/node-credentials.ts';
import { createNodeTokenClient } from './oauth/token-client.ts';
import { createOpenDataAggregator } from './open-data-aggregator.ts';
import { createNodeHealthMonitor } from './node-health.ts';
import { createQueuePow } from './queue-pow.ts';
import { createRelayQueue } from './relay-queue.ts';
import { createRelayService } from './relay-service.ts';
import { loadVentanillaConfig } from './web.ts';

function start(): void {
  const config = loadRouterConfig(process.env);
  const files = loadRouterFiles(config.dataDir);
  const now = (): Date => new Date();
  const today = (): string => toDayDate(now());
  const db = openRouterDatabase(join(config.dataDir, 'enrutador.db'));
  const nodeUrl = (node: DirectoryNode): string => config.nodeUrls[node.id] ?? node.baseUrl;
  assertSecureNodeUrls(config, files.directory.directory.nodes.map(nodeUrl));
  // Seguridad (H12): toda petición saliente lleva tiempo límite y no sigue redirecciones.
  const doFetch = withOutboundDefaults((input: string | Request, init?: RequestInit) =>
    fetch(input, init),
  );
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
    // El monitor se crea después; se consulta en cada entrega.
    meetsMinimumVersion: (node) => health.meetsMinimumVersion(node),
    authorization: (node) => tokens.token(node, PDN_SCOPES.deliveries),
    onUnauthorized: (node) => tokens.invalidate(node, PDN_SCOPES.deliveries),
    relayAuthVersion: config.relayAuthVersion,
  });
  // Cola de entrega: sobres cerrados para nodos que no responden, con el reto propio del enrutador.
  const queueStore = createRelayQueue({
    db,
    deliver: relay.deliver,
    directory: directory.directory,
    now,
    operatorPrivateKey: files.operatorPrivateKey,
    operatorKeyId: keyIdFor(signingPublicKeyOf(files.operatorPrivateKey)),
    limits: {
      ttlDays: config.queue.ttlDays,
      maxPerNode: config.queue.maxPerNode,
      maxBytesPerNode: config.queue.maxBytesPerNode,
      maxTotalBytes: config.queue.maxTotalBytes,
    },
  });
  // H07: el reto de la cola sube con su ocupación y con la carga reciente.
  const queuePow = createQueuePow({
    bits: config.queue.powBits,
    now,
    occupancy: () => queueStore.occupancy(),
  });
  // Salud de los nodos y versión mínima: arriba o abajo, versiones, último contacto y cola.
  const health = createNodeHealthMonitor({
    directory: directory.directory,
    nodeUrl,
    fetch: doFetch,
    now,
    minimumVersion: config.minimumNodeVersion,
    isRegistered: relay.isRegistered,
    queued: (nodeId) => queueStore.stats(nodeId).count,
  });
  const openData = createOpenDataAggregator({
    directory: directory.directory,
    national,
    nodeUrl,
    fetch: doFetch,
    now: openDataClock(process.env),
  });
  const statistics = createNodeStatisticsAggregator({
    directory: directory.directory,
    nodeUrl,
    fetch: doFetch,
    tokens,
    now: openDataClock(process.env),
  });
  // Perfil «ventanilla»: la SESNA sirve la web pública en el mismo origen que el enrutador.
  const ventanilla = loadVentanillaConfig(process.env);
  const app = createRouterApp({
    directory,
    national,
    relay,
    queue: { store: queueStore, pow: queuePow },
    health,
    openData,
    statistics,
    now,
    hstsMaxAgeSeconds: config.hstsMaxAgeSeconds,
    maxConcurrentRelays: config.relay.maxConcurrent,
    maxRelayBytesInFlight: config.relay.maxBytesInFlight,
    operationTokenDigest: config.operationTokenDigest,
    ...(ventanilla === null
      ? {}
      : {
          ventanilla: {
            ...ventanilla,
            directory: directory.directory,
            nodeUrl,
            fetch: doFetch,
            openData,
            hstsMaxAgeSeconds: config.hstsMaxAgeSeconds,
          },
        }),
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
      let statisticsNodes: Record<string, string> | null = null;
      try {
        const cut = await statistics.run();
        statisticsNodes = Object.fromEntries(cut.nodes.map((node) => [node.nodeId, node.status]));
      } catch {
        console.error('No se pudo completar el corte nacional de estadística.');
      }
      // Seguridad: una línea agregada por vuelta, sin destinos, IP, tokens ni contenidos.
      process.stdout.write(
        `${JSON.stringify({ hour: toHourDate(now()), relay: relay.drainCounters(), queue: queueStore.drainCounters(), nodes, openData: openDataNodes, statistics: statisticsNodes })}\n`,
      );
    } finally {
      isCollecting = false;
    }
  };
  void collect();
  const timer = setInterval(() => void collect(), config.collectIntervalSeconds * 1000);
  const checkHealth = (): void => {
    health.check().catch(() => {
      console.error('No se pudo completar la consulta de salud de los nodos.');
    });
  };
  checkHealth();
  const healthTimer = setInterval(checkHealth, config.healthIntervalSeconds * 1000);
  // Reintentos de la cola con espera exponencial; cada sobre lleva su siguiente intento.
  const queueTimer = setInterval(() => {
    queueStore.deliverDue().catch(() => {
      console.error('No se pudo completar la vuelta de la cola de entrega.');
    });
  }, config.queue.intervalSeconds * 1000);

  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
      serverOptions: HTTP_SERVER_OPTIONS,
    },
    (info) => {
      process.stdout.write(`Enrutador SIGILO escuchando en http://${config.host}:${info.port}\n`);
    },
  );
  const shutdown = (): void => {
    clearInterval(timer);
    clearInterval(queueTimer);
    clearInterval(healthTimer);
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
