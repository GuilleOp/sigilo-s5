// Punto de entrada del enrutador: lee la configuración y sus archivos, verifica el directorio,
// abre la base, programa la recolección de cabezas y escucha.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import type { DirectoryNode } from '@sigilo/contracts';
import { toDayDate, toHourDate } from '@sigilo/core';
import { checkNodeHistory } from '@sigilo/red';
import { createRouterApp } from './app.ts';
import { collectNodeHeads } from './collector.ts';
import { loadRelaySecrets, loadRouterConfig, loadRouterFiles } from './config.ts';
import { openRouterDatabase } from './database.ts';
import { loadDirectoryStore } from './directory-store.ts';
import { createNationalLedgerService } from './national-ledger-service.ts';
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
  const relay = createRelayService({
    db,
    nodeUrl,
    fetch: doFetch,
    relaySecret: (node) => relaySecrets.get(node.id) ?? null,
  });
  const app = createRouterApp({
    directory,
    national,
    relay,
    now,
    hstsMaxAgeSeconds: config.hstsMaxAgeSeconds,
  });

  let isCollecting = false;
  const collect = async (): Promise<void> => {
    if (isCollecting) return;
    isCollecting = true;
    try {
      const nodes = await collectNodeHeads({
        national,
        directory: directory.directory,
        nodeUrl,
        fetch: doFetch,
        today,
      });
      // Seguridad: una línea agregada por vuelta, sin destinos, IP ni contenidos.
      process.stdout.write(
        `${JSON.stringify({ hour: toHourDate(now()), relay: relay.drainCounters(), nodes })}\n`,
      );
    } catch {
      console.error('No se pudo completar la recolección de cabezas.');
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
