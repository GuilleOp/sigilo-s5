// Configuración de los dos servicios desde el entorno y lectura de sus archivos: la llave del
// evaluador y, para el índice, el directorio firmado con su raíz de confianza.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  Base64UrlSchema,
  DayDateSchema,
  MAX_POW_BITS,
  NetworkTrustAnchorSchema,
} from '@sigilo/contracts';
import type { AuthorityDirectory, CorroborationEvaluatorKey } from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import { assertEvaluatorKey, buildEvaluatorKey } from '@sigilo/corroboracion';
import type { EvaluatorKeyPair } from '@sigilo/corroboracion';
import { ristretto255 } from '@noble/curves/ed25519.js';
import { verifySignedDirectory } from '@sigilo/red';

/** Configuración común de un servicio. */
export interface ServiceConfig {
  host: string;
  port: number;
  dataDir: string;
  hstsMaxAgeSeconds: number | null;
}

/** Configuración del evaluador. */
export interface EvaluatorConfig extends ServiceConfig {
  powBits: number;
  maxDailyEvaluations: number | null;
}

const INTEGER_PATTERN = /^\d{1,9}$/u;
const DEFAULT_EVALUATOR_PORT = 8791;
const DEFAULT_INDEX_PORT = 8792;
const DEFAULT_POW_BITS = 18;

/** Directorios de datos por omisión. */
export const DEFAULT_EVALUATOR_DATA_DIR = resolve(import.meta.dirname, '..', 'data', 'evaluador');
export const DEFAULT_INDEX_DATA_DIR = resolve(import.meta.dirname, '..', 'data', 'indice');

function parseInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (!INTEGER_PATTERN.test(value)) throw new Error(`${name} debe ser un número entero.`);
  return Number(value);
}

function loadServiceConfig(
  env: NodeJS.ProcessEnv,
  prefix: 'SIGILO_EVALUATOR' | 'SIGILO_INDEX',
  defaults: { port: number; dataDir: string },
): ServiceConfig {
  const port = parseInteger(`${prefix}_PORT`, env[`${prefix}_PORT`], defaults.port);
  if (port < 1 || port > 65535) throw new Error(`${prefix}_PORT debe ser un puerto válido.`);
  const host = env[`${prefix}_HOST`] || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '0.0.0.0' && host !== '::1') {
    throw new Error(`${prefix}_HOST debe ser 127.0.0.1, ::1 o 0.0.0.0.`);
  }
  const hsts = env[`${prefix}_HSTS_MAX_AGE`] ?? '';
  return {
    host,
    port,
    dataDir: resolve(env[`${prefix}_DATA_DIR`] || defaults.dataDir),
    hstsMaxAgeSeconds: hsts === '' ? null : parseInteger(`${prefix}_HSTS_MAX_AGE`, hsts, 0),
  };
}

/**
 * Configuración del evaluador. Lanza error si algún valor no es válido.
 * Seguridad: por omisión escucha solo en 127.0.0.1.
 */
export function loadEvaluatorConfig(env: NodeJS.ProcessEnv): EvaluatorConfig {
  const base = loadServiceConfig(env, 'SIGILO_EVALUATOR', {
    port: DEFAULT_EVALUATOR_PORT,
    dataDir: DEFAULT_EVALUATOR_DATA_DIR,
  });
  const powBits = parseInteger(
    'SIGILO_EVALUATOR_POW_BITS',
    env.SIGILO_EVALUATOR_POW_BITS,
    DEFAULT_POW_BITS,
  );
  if (powBits > MAX_POW_BITS) {
    throw new Error(`SIGILO_EVALUATOR_POW_BITS no puede pasar de ${MAX_POW_BITS}.`);
  }
  const max = env.SIGILO_EVALUATOR_MAX_DAILY ?? '';
  return {
    ...base,
    powBits,
    maxDailyEvaluations: max === '' ? null : parseInteger('SIGILO_EVALUATOR_MAX_DAILY', max, 0),
  };
}

/** Configuración del índice. Lanza error si algún valor no es válido. */
export function loadIndexConfig(env: NodeJS.ProcessEnv): ServiceConfig {
  return loadServiceConfig(env, 'SIGILO_INDEX', {
    port: DEFAULT_INDEX_PORT,
    dataDir: DEFAULT_INDEX_DATA_DIR,
  });
}

/** Archivo `evaluator-key.json`: llave privada OPRF y semilla Ed25519 del evaluador. */
export const EvaluatorKeyFileSchema = z
  .object({
    version: z.literal(1),
    epoch: z.number().int().min(1),
    validFrom: DayDateSchema,
    oprfSecretKey: Base64UrlSchema,
    signingPrivateKey: Base64UrlSchema,
  })
  .strict();
export type EvaluatorKeyFile = z.infer<typeof EvaluatorKeyFileSchema>;

/** Llaves del evaluador listas para usar. */
export interface EvaluatorKeys {
  keyPair: EvaluatorKeyPair;
  signingPrivateKey: Uint8Array;
  key: CorroborationEvaluatorKey;
}

function readJsonFile(path: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`No se pudo leer ${name}; revisa el README de apps/corroboracion.`);
  }
}

/**
 * Llaves del evaluador a partir del archivo. Lanza error si el archivo no cumple su esquema o si
 * las llaves no miden 32 bytes.
 */
export function evaluatorKeysFromFile(file: EvaluatorKeyFile): EvaluatorKeys {
  const secretKey = fromBase64Url(file.oprfSecretKey);
  const signingPrivateKey = fromBase64Url(file.signingPrivateKey);
  if (secretKey.length !== 32 || signingPrivateKey.length !== 32) {
    throw new Error('Las llaves del evaluador deben medir 32 bytes.');
  }
  const scalar = ristretto255.Point.Fn.fromBytes(secretKey);
  const publicKey = ristretto255.Point.BASE.multiply(scalar).toBytes();
  const keyPair = { secretKey, publicKey };
  const key = assertEvaluatorKey(
    buildEvaluatorKey({ keyPair, epoch: file.epoch, signingPrivateKey, validFrom: file.validFrom }),
  );
  return { keyPair, signingPrivateKey, key };
}

/** Lee `evaluator-key.json` del directorio de datos. Lanza error si falta o no es válido. */
export function loadEvaluatorKeys(dataDir: string): EvaluatorKeys {
  const parsed = EvaluatorKeyFileSchema.safeParse(
    readJsonFile(join(dataDir, 'evaluator-key.json'), 'evaluator-key.json'),
  );
  if (!parsed.success) throw new Error('evaluator-key.json no tiene el formato esperado.');
  return evaluatorKeysFromFile(parsed.data);
}

/**
 * Lee y verifica `directory.json` contra `trust.json` (firma de la operación y m de n testigos).
 * Lanza error si falta alguno o la verificación falla.
 * Seguridad: el índice solo acepta firmas de nodos que estén en un directorio verificado.
 */
export function loadVerifiedDirectory(dataDir: string): AuthorityDirectory {
  const signed = readJsonFile(join(dataDir, 'directory.json'), 'directory.json');
  const trust = NetworkTrustAnchorSchema.safeParse(
    readJsonFile(join(dataDir, 'trust.json'), 'trust.json'),
  );
  if (!trust.success) throw new Error('trust.json no tiene el formato esperado.');
  const result = verifySignedDirectory(signed, trust.data);
  if (!result.valid) throw new Error(`El directorio no es válido (${result.reason}).`);
  return result.directory;
}
