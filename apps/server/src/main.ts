// Punto de entrada del servidor: lee la configuración, abre la base, purga pruebas pendientes
// vencidas y escucha en 127.0.0.1.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import type { RequestLogEntry } from './app.ts';
import { createOffsetClock, loadConfig, loadServerKeys } from './config.ts';
import { openDatabase } from './db/database.ts';
import { createEvidenceRepository } from './db/evidence-repository.ts';
import { startEvidencePurge } from './services/evidence-service.ts';
import { createFileEvidenceStore } from './storage/evidence-store.ts';

function writeLog(entry: RequestLogEntry): void {
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

function start(): void {
  const config = loadConfig(process.env);
  const keys = loadServerKeys(config.dataDir);
  const db = openDatabase(join(config.dataDir, 'sigilo.db'));
  const evidenceStore = createFileEvidenceStore(join(config.dataDir, 'evidence'));
  const now =
    config.testClockFile === null
      ? (): Date => new Date()
      : createOffsetClock(config.testClockFile);
  if (config.testClockFile !== null) {
    console.warn('Atención: reloj de pruebas activo (SIGILO_TEST_CLOCK_FILE).');
  }
  const stopPurge = startEvidencePurge(
    { evidence: createEvidenceRepository(db), evidenceStore, now },
    undefined,
    () => console.error('No se pudieron purgar las pruebas pendientes.'),
  );
  const app = createApp({
    db,
    keys,
    evidenceStore,
    authorityToken: config.authorityToken,
    now,
    allowedOrigin: config.allowedOrigin,
    ...(config.webDistDir === null ? {} : { webDistDir: config.webDistDir }),
    ...(config.hstsMaxAgeSeconds === null ? {} : { hstsMaxAgeSeconds: config.hstsMaxAgeSeconds }),
    logger: writeLog,
  });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    process.stdout.write(`SIGILO escuchando en http://${config.host}:${info.port}\n`);
  });
  const shutdown = (): void => {
    stopPurge();
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
