// Punto de entrada del índice de coincidencias: verifica el directorio, abre su base y escucha.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { HTTP_SERVER_OPTIONS } from '@sigilo/red';
import { loadIndexConfig, loadVerifiedDirectory } from './config.ts';
import { INDEX_SCHEMA, openDatabase } from './database.ts';
import { createIndexApp } from './index-app.ts';
import { createIndexService } from './index-service.ts';

const OFFSET_PATTERN = /^\d{1,15}$/u;
const MAX_DEMO_OFFSET_MS = 400 * 24 * 60 * 60 * 1000;

/**
 * Reloj del índice. Con `SIGILO_INDEX_CLOCK_FILE` (solo con `SIGILO_DEMO=1` y fuera de producción)
 * suma al reloj real el desfase en milisegundos del archivo, el mismo reloj simulado de los nodos
 * en la demostración; si no, el reloj real. Lanza error si se pide fuera de una demostración.
 * Seguridad: un reloj manipulable cambia qué registros se aceptan; nunca se usa en producción.
 */
function indexClock(env: NodeJS.ProcessEnv): () => Date {
  const file = env.SIGILO_INDEX_CLOCK_FILE ?? '';
  if (file === '') return () => new Date();
  if (env.SIGILO_DEMO !== '1' || env.NODE_ENV === 'production') {
    throw new Error('SIGILO_INDEX_CLOCK_FILE solo se usa en demostración (SIGILO_DEMO=1).');
  }
  return () => {
    const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
    const offset = OFFSET_PATTERN.test(text) ? Number(text) : 0;
    return new Date(Date.now() + Math.min(offset, MAX_DEMO_OFFSET_MS));
  };
}

function start(): void {
  // Seguridad (H18): bases, WAL y llaves se crean 0600 aunque el umask del sistema sea 022.
  process.umask(0o077);
  const config = loadIndexConfig(process.env);
  const now = indexClock(process.env);
  const directory = loadVerifiedDirectory(config.dataDir);
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(join(config.dataDir, 'indice.db'), INDEX_SCHEMA);
  const index = createIndexService({ db, directory: () => directory, now });
  const app = createIndexApp({ index, hstsMaxAgeSeconds: config.hstsMaxAgeSeconds });
  // H12: tiempos límite de cabeceras y peticiones, menores que los de Node.
  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.host,
      port: config.port,
      serverOptions: HTTP_SERVER_OPTIONS,
    },
    (info) => {
      process.stdout.write(
        `Índice de coincidencias de SIGILO en http://${config.host}:${info.port}\n`,
      );
    },
  );
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
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el índice.');
  process.exit(1);
}
