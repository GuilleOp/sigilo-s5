// Proceso de un testigo (CPC, academia, nodo u otro observador): cada cierto tiempo verifica y
// cofirma la cabeza nacional pendiente. Uso: npm run witness -w @sigilo/enrutador
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { Base64UrlSchema, NetworkTrustAnchorSchema, WitnessIdSchema } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor } from '@sigilo/core';
import { signingPublicKeyOf, withOutboundDefaults } from '@sigilo/red';
import { parseNodeUrls } from '../config.ts';
import { runWitnessOnce } from './witness.ts';

/** Archivo `witness-key.json` del testigo. */
const WitnessKeyFileSchema = z
  .object({
    version: z.literal(1),
    witnessId: WitnessIdSchema,
    keyId: z.string(),
    signingPrivateKey: Base64UrlSchema,
  })
  .strict();

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`No se pudo leer ${path}.`);
  }
}

function start(): void {
  const dataDir = resolve(process.env.SIGILO_WITNESS_DATA_DIR || 'data');
  const routerUrl = process.env.SIGILO_WITNESS_ROUTER_URL || 'http://127.0.0.1:8790';
  const intervalSeconds = Number(process.env.SIGILO_WITNESS_INTERVAL_SECONDS || '60');
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) {
    throw new Error('SIGILO_WITNESS_INTERVAL_SECONDS debe ser un entero positivo.');
  }
  const nodeUrls = parseNodeUrls(process.env.SIGILO_WITNESS_NODE_URLS);
  const key = WitnessKeyFileSchema.parse(readJson(join(dataDir, 'witness-key.json')));
  const trust = NetworkTrustAnchorSchema.parse(readJson(join(dataDir, 'trust.json')));
  const signingPrivateKey = fromBase64Url(key.signingPrivateKey);
  if (keyIdFor(signingPublicKeyOf(signingPrivateKey)) !== key.keyId) {
    throw new Error('La llave del testigo no corresponde a su identificador.');
  }
  const run = async (): Promise<void> => {
    try {
      const outcome = await runWitnessOnce({
        routerUrl,
        witnessId: key.witnessId,
        signingPrivateKey,
        trust,
        statePath: join(dataDir, 'witness-state.json'),
        fetch: withOutboundDefaults((input, init) => fetch(input, init)),
        nodeUrl: (node) => nodeUrls[node.id] ?? node.baseUrl,
      });
      process.stdout.write(`${JSON.stringify({ witness: key.witnessId, outcome })}\n`);
    } catch {
      console.error('La vuelta del testigo falló.');
    }
  };
  void run();
  const timer = setInterval(() => void run(), intervalSeconds * 1000);
  const stop = (): void => {
    clearInterval(timer);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

try {
  start();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo iniciar el testigo.');
  process.exit(1);
}
