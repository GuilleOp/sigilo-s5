// Configuración del enrutador desde el entorno y lectura de sus archivos (directorio firmado, raíz
// de confianza y llave de la operación) en el directorio de datos.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {
  Base64UrlSchema,
  NetworkTrustAnchorSchema,
  NodeIdSchema,
  SignedAuthorityDirectorySchema,
} from '@sigilo/contracts';
import type { NetworkTrustAnchor, SignedAuthorityDirectory } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor } from '@sigilo/core';
import { signingPublicKeyOf } from '@sigilo/red';

/** Configuración del proceso del enrutador. */
export interface RouterConfig {
  host: string;
  port: number;
  dataDir: string;
  /**
   * Direcciones internas de los nodos, si difieren de la `baseUrl` pública del directorio (por
   * ejemplo, en la red de `docker compose`). Las conoce solo la operación.
   */
  nodeUrls: Readonly<Record<string, string>>;
  /** Cada cuánto se recogen las cabezas de los nodos y se emite la cabeza nacional, en segundos. */
  collectIntervalSeconds: number;
  hstsMaxAgeSeconds: number | null;
  /** Cada cuánto se consulta la salud de los nodos, en segundos. */
  healthIntervalSeconds: number;
  /** Versión mínima del software de los nodos (`mayor.menor.parche`), o `null`. */
  minimumNodeVersion: string | null;
  /** Cola de entrega: reto propio, cada cuánto se reintenta y sus límites por nodo y en total. */
  queue: {
    powBits: number;
    intervalSeconds: number;
    ttlDays: number;
    maxPerNode: number;
    maxBytesPerNode: number;
    maxTotalBytes: number;
  };
  /** Relevo: reenvíos simultáneos y bytes de cuerpos en vuelo (H02). */
  relay: { maxConcurrent: number; maxBytesInFlight: number };
  /**
   * SHA-256 del token de la operación (`SIGILO_ROUTER_OPERATION_TOKEN`), con el que la salud
   * incluye la cola por nodo (H08), o `null`.
   */
  operationTokenDigest: Uint8Array | null;
  /** Versión de la etiqueta HMAC hacia los buzones (`SIGILO_ROUTER_RELAY_AUTH`, v2 por omisión). */
  relayAuthVersion: 1 | 2;
  /**
   * Si se admiten direcciones `http://` de nodos fuera de una demostración o del desarrollo
   * (`SIGILO_ROUTER_ALLOW_HTTP_NODES=1`, solo para redes privadas con su propio cifrado).
   */
  allowHttpNodes: boolean;
  /** Si el enrutador corre en producción (`NODE_ENV=production` sin `SIGILO_DEMO=1`). */
  isProduction: boolean;
}

const DEFAULT_PORT = 8790;
const DEFAULT_COLLECT_INTERVAL_SECONDS = 600;
const DEFAULT_QUEUE_INTERVAL_SECONDS = 15;
const DEFAULT_HEALTH_INTERVAL_SECONDS = 60;
const VERSION_PATTERN = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u;
const DEFAULT_QUEUE_POW_BITS = 18;
const DEFAULT_QUEUE_TTL_DAYS = 7;
const DEFAULT_QUEUE_MAX_PER_NODE = 500;
const DEFAULT_QUEUE_MAX_MB_PER_NODE = 64;
const DEFAULT_QUEUE_MAX_TOTAL_MB = 256;
const DEFAULT_MAX_RELAYS = 64;
const DEFAULT_RELAY_MAX_MB_IN_FLIGHT = 256;
const MIN_OPERATION_TOKEN_LENGTH = 32;
/** `max-age` mínimo de HSTS: un año, como en el nodo (H20). */
export const MIN_ROUTER_HSTS_MAX_AGE_SECONDS = 31_536_000;
const INTEGER_PATTERN = /^\d{1,9}$/u;
const URL_PATTERN = /^https?:\/\/[^\s/?#]+$/u;

/** Directorio de datos por omisión: `apps/enrutador/data`. */
export const DEFAULT_ROUTER_DATA_DIR = resolve(import.meta.dirname, '..', 'data');

function parseInteger(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  if (!INTEGER_PATTERN.test(value)) throw new Error(`${name} debe ser un número entero.`);
  return Number(value);
}

/**
 * Lee `SIGILO_ROUTER_NODE_URLS`: pares `node.id=http://host:puerto` separados por comas.
 * Lanza error si un par no es válido.
 */
export function parseNodeUrls(value: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of (value ?? '').split(',').map((item) => item.trim())) {
    if (pair === '') continue;
    const [id, url, ...rest] = pair.split('=');
    if (
      id === undefined ||
      url === undefined ||
      rest.length > 0 ||
      !NodeIdSchema.safeParse(id).success ||
      !URL_PATTERN.test(url)
    ) {
      throw new Error('SIGILO_ROUTER_NODE_URLS debe tener la forma node.id=http://host:puerto.');
    }
    result[id] = url;
  }
  return result;
}

/**
 * Construye la configuración. Lanza error si algún valor no es válido.
 * Seguridad: por omisión escucha solo en 127.0.0.1; en un contenedor se publica con
 * `SIGILO_ROUTER_HOST=0.0.0.0` detrás del puerto que expone `docker compose`.
 */
export function loadRouterConfig(env: NodeJS.ProcessEnv): RouterConfig {
  const port = parseInteger('SIGILO_ROUTER_PORT', env.SIGILO_ROUTER_PORT, DEFAULT_PORT);
  if (port < 1 || port > 65535) throw new Error('SIGILO_ROUTER_PORT debe ser un puerto válido.');
  const interval = parseInteger(
    'SIGILO_ROUTER_COLLECT_INTERVAL_SECONDS',
    env.SIGILO_ROUTER_COLLECT_INTERVAL_SECONDS,
    DEFAULT_COLLECT_INTERVAL_SECONDS,
  );
  if (interval < 1) throw new Error('SIGILO_ROUTER_COLLECT_INTERVAL_SECONDS debe ser mayor que 0.');
  const host = env.SIGILO_ROUTER_HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '0.0.0.0' && host !== '::1') {
    throw new Error('SIGILO_ROUTER_HOST debe ser 127.0.0.1, ::1 o 0.0.0.0.');
  }
  const hsts = env.SIGILO_ROUTER_HSTS_MAX_AGE ?? '';
  const queue = {
    powBits: parseInteger(
      'SIGILO_ROUTER_QUEUE_POW_BITS',
      env.SIGILO_ROUTER_QUEUE_POW_BITS,
      DEFAULT_QUEUE_POW_BITS,
    ),
    intervalSeconds: parseInteger(
      'SIGILO_ROUTER_QUEUE_INTERVAL_SECONDS',
      env.SIGILO_ROUTER_QUEUE_INTERVAL_SECONDS,
      DEFAULT_QUEUE_INTERVAL_SECONDS,
    ),
    ttlDays: parseInteger(
      'SIGILO_ROUTER_QUEUE_TTL_DAYS',
      env.SIGILO_ROUTER_QUEUE_TTL_DAYS,
      DEFAULT_QUEUE_TTL_DAYS,
    ),
    maxPerNode: parseInteger(
      'SIGILO_ROUTER_QUEUE_MAX_PER_NODE',
      env.SIGILO_ROUTER_QUEUE_MAX_PER_NODE,
      DEFAULT_QUEUE_MAX_PER_NODE,
    ),
    maxBytesPerNode:
      parseInteger(
        'SIGILO_ROUTER_QUEUE_MAX_MB_PER_NODE',
        env.SIGILO_ROUTER_QUEUE_MAX_MB_PER_NODE,
        DEFAULT_QUEUE_MAX_MB_PER_NODE,
      ) *
      1024 *
      1024,
  };
  if (queue.intervalSeconds < 1 || queue.ttlDays < 1 || queue.ttlDays > 30) {
    throw new Error(
      'La cola necesita SIGILO_ROUTER_QUEUE_INTERVAL_SECONDS ≥ 1 y SIGILO_ROUTER_QUEUE_TTL_DAYS entre 1 y 30.',
    );
  }
  if (queue.powBits > 24) throw new Error('SIGILO_ROUTER_QUEUE_POW_BITS debe ser a lo más 24.');
  const healthIntervalSeconds = parseInteger(
    'SIGILO_ROUTER_HEALTH_INTERVAL_SECONDS',
    env.SIGILO_ROUTER_HEALTH_INTERVAL_SECONDS,
    DEFAULT_HEALTH_INTERVAL_SECONDS,
  );
  if (healthIntervalSeconds < 1) {
    throw new Error('SIGILO_ROUTER_HEALTH_INTERVAL_SECONDS debe ser mayor que 0.');
  }
  const maxTotalMb = parseInteger(
    'SIGILO_ROUTER_QUEUE_MAX_TOTAL_MB',
    env.SIGILO_ROUTER_QUEUE_MAX_TOTAL_MB,
    DEFAULT_QUEUE_MAX_TOTAL_MB,
  );
  const relay = {
    maxConcurrent: parseInteger(
      'SIGILO_ROUTER_MAX_RELAYS',
      env.SIGILO_ROUTER_MAX_RELAYS,
      DEFAULT_MAX_RELAYS,
    ),
    maxBytesInFlight:
      parseInteger(
        'SIGILO_ROUTER_RELAY_MAX_MB_IN_FLIGHT',
        env.SIGILO_ROUTER_RELAY_MAX_MB_IN_FLIGHT,
        DEFAULT_RELAY_MAX_MB_IN_FLIGHT,
      ) *
      1024 *
      1024,
  };
  if (relay.maxConcurrent < 1 || relay.maxBytesInFlight < 32 * 1024 * 1024) {
    throw new Error(
      'El relevo necesita SIGILO_ROUTER_MAX_RELAYS ≥ 1 y SIGILO_ROUTER_RELAY_MAX_MB_IN_FLIGHT ≥ 32 (un sobre del tramo mayor).',
    );
  }
  const token = env.SIGILO_ROUTER_OPERATION_TOKEN ?? '';
  if (
    token !== '' &&
    (token.length < MIN_OPERATION_TOKEN_LENGTH || !/^[\x21-\x7e]+$/u.test(token))
  ) {
    throw new Error(
      `SIGILO_ROUTER_OPERATION_TOKEN debe tener al menos ${MIN_OPERATION_TOKEN_LENGTH} caracteres visibles.`,
    );
  }
  const relayAuth = env.SIGILO_ROUTER_RELAY_AUTH ?? '';
  if (relayAuth !== '' && relayAuth !== 'v1' && relayAuth !== 'v2') {
    throw new Error('SIGILO_ROUTER_RELAY_AUTH debe ser v1 o v2.');
  }
  const isProduction = env.NODE_ENV === 'production' && env.SIGILO_DEMO !== '1';
  if (hsts !== '') {
    const seconds = parseInteger('SIGILO_ROUTER_HSTS_MAX_AGE', hsts, 0);
    if (seconds < MIN_ROUTER_HSTS_MAX_AGE_SECONDS) {
      throw new Error(
        `SIGILO_ROUTER_HSTS_MAX_AGE debe ser de al menos ${MIN_ROUTER_HSTS_MAX_AGE_SECONDS} segundos (un año).`,
      );
    }
  }
  const minimum = env.SIGILO_ROUTER_MIN_NODE_VERSION ?? '';
  if (minimum !== '' && !VERSION_PATTERN.test(minimum)) {
    throw new Error('SIGILO_ROUTER_MIN_NODE_VERSION debe tener la forma mayor.menor.parche.');
  }
  return {
    host,
    port,
    dataDir: resolve(env.SIGILO_ROUTER_DATA_DIR || DEFAULT_ROUTER_DATA_DIR),
    nodeUrls: parseNodeUrls(env.SIGILO_ROUTER_NODE_URLS),
    collectIntervalSeconds: interval,
    hstsMaxAgeSeconds: hsts === '' ? null : parseInteger('SIGILO_ROUTER_HSTS_MAX_AGE', hsts, 0),
    healthIntervalSeconds,
    minimumNodeVersion: minimum === '' ? null : minimum,
    queue: { ...queue, maxTotalBytes: maxTotalMb * 1024 * 1024 },
    relay,
    operationTokenDigest:
      token === '' ? null : new Uint8Array(createHash('sha256').update(token, 'utf8').digest()),
    relayAuthVersion: relayAuth === 'v1' ? 1 : 2,
    allowHttpNodes: env.SIGILO_ROUTER_ALLOW_HTTP_NODES === '1',
    isProduction,
  };
}

/**
 * Comprueba que, en producción, toda dirección por la que el enrutador habla con un nodo (la
 * interna configurada o la `baseUrl` del directorio) use `https:`. Lanza error con la primera que no.
 * Seguridad (H13): por `http://` el token OAuth y el sobre viajan sin TLS. Solo se admite con
 * `SIGILO_ROUTER_ALLOW_HTTP_NODES=1` (red privada con su propio cifrado, p. ej. una VPN).
 */
export function assertSecureNodeUrls(
  config: Pick<RouterConfig, 'isProduction' | 'allowHttpNodes'>,
  urls: readonly string[],
): void {
  if (!config.isProduction || config.allowHttpNodes) return;
  for (const url of urls) {
    if (!url.startsWith('https://')) {
      throw new Error(
        'En producción el enrutador solo habla con los nodos por https:// (o SIGILO_ROUTER_ALLOW_HTTP_NODES=1 en una red privada cifrada).',
      );
    }
  }
}

const OFFSET_PATTERN = /^\d{1,15}$/u;
const MAX_DEMO_OFFSET_MS = 400 * 24 * 60 * 60 * 1000;

/**
 * Reloj del corte nacional de datos abiertos. Con `SIGILO_ROUTER_CLOCK_FILE` (solo con
 * `SIGILO_DEMO=1` y fuera de producción) suma al reloj real el desfase en milisegundos del archivo,
 * el mismo reloj simulado de los nodos en la demostración, para que «mes cerrado» signifique lo
 * mismo en los nodos y en el agregador. Sin la variable, el reloj real. Lanza error si se pide
 * fuera de una demostración.
 * Seguridad: solo lo usa el agregador; la bitácora nacional y el directorio siguen con el reloj
 * real.
 */
export function openDataClock(env: NodeJS.ProcessEnv): () => Date {
  const file = env.SIGILO_ROUTER_CLOCK_FILE ?? '';
  if (file === '') return () => new Date();
  if (env.SIGILO_DEMO !== '1' || env.NODE_ENV === 'production') {
    throw new Error('SIGILO_ROUTER_CLOCK_FILE solo se usa en demostración (SIGILO_DEMO=1).');
  }
  return () => {
    let text: string;
    try {
      text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
    } catch {
      text = '';
    }
    const offset = OFFSET_PATTERN.test(text) ? Number(text) : 0;
    return new Date(Date.now() + Math.min(offset, MAX_DEMO_OFFSET_MS));
  };
}

/** Archivo `operator-key.json`: semilla Ed25519 de la operación. */
export const OperatorKeyFileSchema = z
  .object({ version: z.literal(1), keyId: z.string(), signingPrivateKey: Base64UrlSchema })
  .strict();

/** Archivo `relay-secrets.json`: secreto compartido con el buzón de cada nodo (HMAC). */
export const RelaySecretsFileSchema = z
  .object({ version: z.literal(1), secrets: z.record(z.string(), Base64UrlSchema) })
  .strict();

/**
 * Secretos del buzón de cada nodo (`relay-secrets.json` en el directorio de datos). Sin archivo,
 * el enrutador reenvía sin etiqueta y los nodos que exigen autenticación rechazan los sobres.
 * Lanza error si el archivo existe y no cumple su esquema o un secreto mide menos de 32 bytes.
 */
export function loadRelaySecrets(dataDir: string): ReadonlyMap<string, Uint8Array> {
  const path = join(dataDir, 'relay-secrets.json');
  if (!existsSync(path)) return new Map();
  const parsed = RelaySecretsFileSchema.safeParse(readJsonFile(path, 'relay-secrets.json'));
  if (!parsed.success) throw new Error('relay-secrets.json no tiene el formato esperado.');
  const secrets = new Map<string, Uint8Array>();
  for (const [nodeId, value] of Object.entries(parsed.data.secrets)) {
    const secret = fromBase64Url(value);
    if (secret.length < 32) throw new Error('Un secreto del buzón es demasiado corto.');
    secrets.set(nodeId, secret);
  }
  return secrets;
}

/** Archivos que el enrutador lee al arrancar. */
export interface RouterFiles {
  directory: SignedAuthorityDirectory;
  trust: NetworkTrustAnchor;
  operatorPrivateKey: Uint8Array;
}

function readJsonFile(path: string, name: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`No se pudo leer ${name}; ejecuta npm run red:demo o revisa la guía.`);
  }
}

/**
 * Lee `directory.json`, `trust.json` y `operator-key.json` del directorio de datos.
 * Lanza error si falta alguno, si no cumple su esquema o si la llave no corresponde a su `keyId`.
 */
export function loadRouterFiles(dataDir: string): RouterFiles {
  const directory = SignedAuthorityDirectorySchema.safeParse(
    readJsonFile(join(dataDir, 'directory.json'), 'directory.json'),
  );
  if (!directory.success) throw new Error('directory.json no tiene el formato esperado.');
  const trust = NetworkTrustAnchorSchema.safeParse(
    readJsonFile(join(dataDir, 'trust.json'), 'trust.json'),
  );
  if (!trust.success) throw new Error('trust.json no tiene el formato esperado.');
  const operator = OperatorKeyFileSchema.safeParse(
    readJsonFile(join(dataDir, 'operator-key.json'), 'operator-key.json'),
  );
  if (!operator.success) throw new Error('operator-key.json no tiene el formato esperado.');
  const operatorPrivateKey = fromBase64Url(operator.data.signingPrivateKey);
  if (
    operatorPrivateKey.length !== 32 ||
    keyIdFor(signingPublicKeyOf(operatorPrivateKey)) !== operator.data.keyId
  ) {
    throw new Error('La llave de la operación no corresponde a su identificador.');
  }
  return { directory: directory.data, trust: trust.data, operatorPrivateKey };
}
