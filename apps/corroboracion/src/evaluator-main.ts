// Punto de entrada del evaluador OPRF: lee la configuración y la llave, abre su base y escucha.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { loadEvaluatorConfig, loadEvaluatorKeys } from './config.ts';
import { EVALUATOR_SCHEMA, openDatabase } from './database.ts';
import { createEvaluatorApp } from './evaluator-app.ts';
import { createEvaluatorService } from './evaluator-service.ts';

function start(): void {
  const config = loadEvaluatorConfig(process.env);
  const keys = loadEvaluatorKeys(config.dataDir);
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(join(config.dataDir, 'evaluador.db'), EVALUATOR_SCHEMA);
  const evaluator = createEvaluatorService({
    db,
    ...keys,
    powBits: config.powBits,
    now: () => new Date(),
    ...(config.maxDailyEvaluations === null
      ? {}
      : { maxDailyEvaluations: config.maxDailyEvaluations }),
  });
  const app = createEvaluatorApp({ evaluator, hstsMaxAgeSeconds: config.hstsMaxAgeSeconds });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    process.stdout.write(
      `Evaluador OPRF de SIGILO (época ${keys.key.epoch}, llave ${keys.key.keyId}) en http://${config.host}:${info.port}\n`,
    );
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
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el evaluador.');
  process.exit(1);
}
