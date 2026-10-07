// Punto de entrada del servidor: lee la configuración, toma el bloqueo del directorio de datos,
// abre la base, programa las tareas periódicas y escucha en 127.0.0.1.
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import type { RequestLogLine } from './app.ts';
import { createOffsetClock, loadConfig, loadServerKeys } from './config.ts';
import { createComplaintsRepository } from './db/complaints-repository.ts';
import { openDatabase } from './db/database.ts';
import { createEvidenceRepository } from './db/evidence-repository.ts';
import { createLedgerRepository } from './db/ledger-repository.ts';
import { createOpenDataRepository } from './db/open-data-repository.ts';
import { createRequestLog } from './http/request-log.ts';
import { createLedgerService } from './ledger-service.ts';
import { acquireServerLock } from './server-lock.ts';
import {
  intervalScheduler,
  purgeUntrackedEvidence,
  startEvidencePurge,
} from './services/evidence-service.ts';
import { freezeClosedMonths } from './services/open-data.ts';
import { createFileEvidenceStore } from './storage/evidence-store.ts';

/** Cada cuánto se cierran los días de la bitácora, se congelan los meses y se vacía el registro. */
const DAILY_TASKS_INTERVAL_MS = 10 * 60 * 1000;

function writeLog(line: RequestLogLine): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

function start(): void {
  const config = loadConfig(process.env);
  const keys = loadServerKeys(config.dataDir);
  const releaseLock = acquireServerLock(config.dataDir);
  const db = openDatabase(join(config.dataDir, 'sigilo.db'));
  const evidenceStore = createFileEvidenceStore(join(config.dataDir, 'evidence'));
  const now =
    config.testClockFile === null
      ? (): Date => new Date()
      : createOffsetClock(config.testClockFile);
  if (config.testClockFile !== null) {
    console.warn('Atención: reloj de pruebas activo (SIGILO_TEST_CLOCK_FILE).');
  }
  const evidence = createEvidenceRepository(db);
  const complaints = createComplaintsRepository(db);
  const stopPurge = startEvidencePurge({ evidence, evidenceStore, now }, undefined, () =>
    console.error('No se pudieron purgar las pruebas pendientes.'),
  );
  const requestLog = createRequestLog({ mode: config.requestLogMode, now, write: writeLog });
  const ledger = createLedgerService({
    db,
    repository: createLedgerRepository(db),
    serverKeyId: keys.publicKeySet.server.keyId,
    serverSigningPrivateKey: keys.serverSigningPrivateKey,
    now,
  });
  const openData = createOpenDataRepository(db);
  // Tarea programada con el mismo reloj inyectado: cierra los días de la bitácora aunque nadie la
  // consulte, congela los meses completos, aplica la retención y vacía los contadores por hora.
  const runDailyTasks = (): void => {
    try {
      ledger.publishClosedDays();
      freezeClosedMonths({ db, complaints, openData, now });
      purgeUntrackedEvidence({
        complaints,
        evidence,
        evidenceStore,
        now,
        retentionDays: config.untrackedRetentionDays,
      });
      requestLog.flush();
    } catch {
      console.error('No se pudieron ejecutar las tareas periódicas.');
    }
  };
  runDailyTasks();
  const stopDailyTasks = intervalScheduler.every(DAILY_TASKS_INTERVAL_MS, runDailyTasks);
  const app = createApp({
    db,
    keys,
    evidenceStore,
    authorityToken: config.authorityToken,
    now,
    allowedOrigin: config.allowedOrigin,
    ...(config.webDistDir === null ? {} : { webDistDir: config.webDistDir }),
    ...(config.hstsMaxAgeSeconds === null ? {} : { hstsMaxAgeSeconds: config.hstsMaxAgeSeconds }),
    requestLog,
    powBits: config.powBits,
    evidenceQuotaBytes: config.evidenceQuotaBytes,
  });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    process.stdout.write(`SIGILO escuchando en http://${config.host}:${info.port}\n`);
  });
  const shutdown = (): void => {
    stopPurge();
    stopDailyTasks();
    requestLog.flush();
    server.close(() => {
      db.close();
      releaseLock();
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
