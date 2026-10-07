// Punto de entrada del servidor: lee la configuración, abre la base y escucha en 127.0.0.1.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import type { RequestLogEntry } from './app.ts';
import { loadConfig, loadServerKeys } from './config.ts';
import { openDatabase } from './db/database.ts';
import { createFileEvidenceStore } from './storage/evidence-store.ts';

function writeLog(entry: RequestLogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function start(): void {
  const config = loadConfig(process.env);
  const keys = loadServerKeys(config.dataDir);
  const db = openDatabase(join(config.dataDir, 'sigilo.db'));
  const app = createApp({
    db,
    keys,
    evidenceStore: createFileEvidenceStore(join(config.dataDir, 'evidence')),
    authorityToken: config.authorityToken,
    now: () => new Date(),
    allowedOrigin: config.allowedOrigin,
    logger: writeLog,
  });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    process.stdout.write(`SIGILO escuchando en http://${config.host}:${info.port}\n`);
  });
  const shutdown = (): void => {
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
  // Los mensajes de arranque son propios y no contienen secretos.
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el servidor.');
  process.exit(1);
}
