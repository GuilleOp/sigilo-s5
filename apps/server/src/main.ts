// Punto de entrada del servidor: lee la configuración, las llaves y las cuentas de la autoridad,
// toma el bloqueo del directorio de datos, abre la base, entra a la red federada si está
// configurada, programa las tareas periódicas (cierre de la bitácora, red, corroboración, auditor,
// sanciones, reglas de escalamiento, datos abiertos y retención) y escucha en 127.0.0.1.
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromBase64Url, randomBytes, toBase64Url } from '@sigilo/core';
import { HTTP_SERVER_OPTIONS, withOutboundDefaults } from '@sigilo/red';
import { serve } from '@hono/node-server';
import { createAppFromContext } from './app.ts';
import type { RequestLogLine } from './app.ts';
import { createOffsetClock, loadConfig, loadServerKeys } from './config.ts';
import { createContext } from './context.ts';
import { openDatabase } from './db/database.ts';
import { restrictToFronts } from './http/exposure.ts';
import type { NodeFront } from './http/exposure.ts';
import { createRequestLog } from './http/request-log.ts';
import { loadNodeNetwork } from './network/network-context.ts';
import { createNetworkTasks } from './network/network-tasks.ts';
import { createNodeOAuthServer, loadOAuthClients } from './network/oauth-server.ts';
import { runNodeAudit } from './services/audit-service.ts';
import { syncCorroboration } from './services/corroboration-service.ts';
import { recheckPendingSanctions } from './services/pdn-context.ts';
import { openPdnSources } from './services/pdn-sources.ts';
import { loadAuthorityRegistry } from './security/authority-registry.ts';
import { acquireServerLock, refreshServerLock } from './server-lock.ts';
import {
  intervalScheduler,
  purgeUnattendedEvidence,
  startEvidencePurge,
} from './services/evidence-service.ts';
import { freezeClosedMonths } from './services/open-data.ts';
import { runEscalationRules } from './services/rules-engine.ts';
import { createFileEvidenceStore } from './storage/evidence-store.ts';

/** Frentes del puerto propio del panel (`SIGILO_PANEL_PORT`): el panel y las lecturas públicas. */
const PANEL_LISTENER_FRONTS: readonly NodeFront[] = ['panel', 'publico'];

/** Cada cuánto se cierran los días de la bitácora, se congelan los meses y se vacía el registro. */
const DAILY_TASKS_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Con el reloj de pruebas las tareas corren cada segundo: las lecturas ya no cierran días, así que
 * las pruebas E2E esperan a esta tarea después de adelantar el reloj.
 */
const TEST_CLOCK_TASKS_INTERVAL_MS = 1000;

function writeLog(line: RequestLogLine): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

/** Archivo del secreto del nodo para los folios opacos del índice de corroboración. */
const CORROBORATION_SECRET_FILE = 'corroboration-secret';
const CORROBORATION_SECRET_BYTES = 32;

/**
 * Lee el secreto del nodo para el índice, o lo crea (0600) la primera vez.
 * Seguridad: con él, el índice no puede ligar sus folios opacos con los folios del nodo; nunca sale
 * del directorio de datos.
 */
function corroborationSecret(dataDir: string): Uint8Array {
  const path = join(dataDir, CORROBORATION_SECRET_FILE);
  if (!existsSync(path)) {
    writeFileSync(path, `${toBase64Url(randomBytes(CORROBORATION_SECRET_BYTES))}\n`, {
      mode: 0o600,
    });
    chmodSync(path, 0o600);
  }
  const secret = fromBase64Url(readFileSync(path, 'utf8').trim());
  if (secret.length < CORROBORATION_SECRET_BYTES) {
    throw new Error('El secreto de corroboración del nodo es demasiado corto.');
  }
  return secret;
}

function start(): void {
  // Seguridad (H18): bases, WAL, secretos y pruebas se crean 0600 (y carpetas 0700) aunque el
  // umask del sistema sea 022.
  process.umask(0o077);
  const config = loadConfig(process.env);
  const keys = loadServerKeys(config.dataDir);
  const authorities = loadAuthorityRegistry(config.accountsFile);
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
  const requestLog = createRequestLog({ mode: config.requestLogMode, now, write: writeLog });
  // Seguridad (H12): toda petición saliente del nodo lleva tiempo límite y no sigue redirecciones.
  const platformFetch = withOutboundDefaults(
    (input: string | Request, init?: RequestInit): Promise<Response> => fetch(input, init),
  );
  const network =
    config.network === null ? undefined : loadNodeNetwork(config.network, platformFetch);
  const pdn = openPdnSources(config.pdn);
  for (const reason of pdn.disabled) console.warn(`Fuente de la PDN desactivada (${reason}).`);
  const corroboration =
    config.corroborationIndexUrl === null || network === undefined
      ? undefined
      : {
          indexUrl: config.corroborationIndexUrl,
          nodeSecret: corroborationSecret(config.dataDir),
          fetch: platformFetch,
        };
  // Servidor de autorización del nodo para la SESNA (entregas y estadística de la PDN).
  const oauth = createNodeOAuthServer({
    issuer: network?.nodeId ?? 'node.local',
    clients: loadOAuthClients(config.oauthClientsFile),
  });
  // Un solo contexto para las rutas y las tareas: la misma bitácora, los mismos repositorios.
  const ctx = createContext({
    db,
    keys,
    evidenceStore,
    authorities,
    now,
    allowedOrigin: config.allowedOrigin,
    ...(config.webDistDir === null ? {} : { webDistDir: config.webDistDir }),
    ...(config.hstsMaxAgeSeconds === null ? {} : { hstsMaxAgeSeconds: config.hstsMaxAgeSeconds }),
    requestLog,
    powBits: config.powBits,
    powMaxBits: config.powMaxBits,
    evidenceQuotaBytes: config.evidenceQuotaBytes,
    evidenceRetentionDays: config.evidenceRetentionDays,
    ...(network === undefined ? {} : { network }),
    ...(pdn.provider === null ? {} : { pdnSources: pdn.provider }),
    ...(corroboration === undefined ? {} : { corroboration }),
    isAuditEnabled: config.isAuditEnabled,
    oauth,
    exposedFronts: config.fronts,
    allowLegacyRelayAuth: config.allowLegacyRelayAuth,
  });
  const networkTasks =
    network === undefined
      ? null
      : createNetworkTasks(ctx, network, config.network?.witnessStateFile ?? null);
  const { evidence, complaints, ledger, openData } = ctx;
  const stopPurge = startEvidencePurge({ evidence, evidenceStore, now }, undefined, () =>
    console.error('No se pudieron purgar las pruebas pendientes.'),
  );
  // Tarea programada con el mismo reloj inyectado: renueva el bloqueo, cierra los días de la
  // bitácora (la única vía: las lecturas solo muestran lo publicado), congela los meses completos,
  // aplica la retención de pruebas de denuncias sin atender o archivadas y vacía los contadores por hora. Cada
  // tarea va en su propio `try`, para que el fallo de una no impida las demás.
  const runTask = async (name: string, task: () => unknown): Promise<void> => {
    try {
      await task();
    } catch {
      console.error(`No se pudo ejecutar la tarea periódica: ${name}.`);
    }
  };
  let isRunningTasks = false;
  const runDailyTasks = async (): Promise<void> => {
    if (isRunningTasks) return;
    isRunningTasks = true;
    try {
      await runTask('renovar el bloqueo', () => refreshServerLock(config.dataDir));
      await runTask('cerrar los días de la bitácora', () => ledger.publishClosedDays());
      // Después del cierre: la cabeza que se publica en la bitácora nacional ya incluye el día.
      if (networkTasks !== null) {
        await runTask('registrar el nodo y publicar su cabeza', () => networkTasks.run());
      }
      if (corroboration !== undefined) {
        await runTask('sincronizar la corroboración', () => syncCorroboration(ctx));
      }
      if (config.isAuditEnabled) {
        await runTask('correr el auditor', () => runNodeAudit(ctx));
      }
      if (pdn.provider !== null) {
        await runTask('reverificar sanciones', () => recheckPendingSanctions(ctx));
      }
      // Después del cierre: las reglas registran sus eventos con la fecha de hoy.
      await runTask('evaluar las reglas de escalamiento', () => runEscalationRules(ctx));
      await runTask('congelar los meses de datos abiertos', () =>
        freezeClosedMonths({ db, complaints, openData, now }),
      );
      await runTask('aplicar la retención de pruebas', () =>
        purgeUnattendedEvidence({
          evidence,
          evidenceStore,
          now,
          retentionDays: config.evidenceRetentionDays,
        }),
      );
      await runTask('vaciar el registro de peticiones', () => requestLog.flush());
    } finally {
      isRunningTasks = false;
    }
  };
  void runDailyTasks();
  const stopDailyTasks = intervalScheduler.every(
    config.testClockFile === null ? DAILY_TASKS_INTERVAL_MS : TEST_CLOCK_TASKS_INTERVAL_MS,
    () => void runDailyTasks(),
  );
  const app = createAppFromContext(ctx);
  // Frentes de cada escucha (H03): con SIGILO_PANEL_PORT, el panel sale por su propio puerto y el
  // principal queda para la red de la SESNA y las lecturas públicas.
  const mainFronts = new Set<NodeFront>(config.fronts);
  if (config.panelPort !== null) mainFronts.delete('panel');
  const listen = (port: number, fronts: ReadonlySet<NodeFront>, label: string) =>
    serve(
      {
        fetch: restrictToFronts(app.fetch, fronts),
        hostname: config.host,
        port,
        serverOptions: HTTP_SERVER_OPTIONS,
      },
      (info) => {
        process.stdout.write(
          `SIGILO (${label}: ${[...fronts].join(', ')}) escuchando en http://${config.host}:${info.port}\n`,
        );
      },
    );
  const server = listen(config.port, mainFronts, `perfil ${config.profile}`);
  const panelServer =
    config.panelPort === null
      ? null
      : listen(
          config.panelPort,
          new Set(PANEL_LISTENER_FRONTS.filter((front) => config.fronts.has(front))),
          'panel',
        );
  const shutdown = (): void => {
    stopPurge();
    stopDailyTasks();
    requestLog.flush();
    panelServer?.close();
    server.close(() => {
      db.close();
      pdn.close();
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
