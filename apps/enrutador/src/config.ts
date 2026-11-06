// Configuración del enrutador desde el entorno y lectura de sus archivos (directorio firmado, raíz
// de confianza y llave de la operación) en el directorio de datos.
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
}

const DEFAULT_PORT = 8790;
const DEFAULT_COLLECT_INTERVAL_SECONDS = 600;
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
  return {
    host,
    port,
    dataDir: resolve(env.SIGILO_ROUTER_DATA_DIR || DEFAULT_ROUTER_DATA_DIR),
    nodeUrls: parseNodeUrls(env.SIGILO_ROUTER_NODE_URLS),
    collectIntervalSeconds: interval,
    hstsMaxAgeSeconds: hsts === '' ? null : parseInteger('SIGILO_ROUTER_HSTS_MAX_AGE', hsts, 0),
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
