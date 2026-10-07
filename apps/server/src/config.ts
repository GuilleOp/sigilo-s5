// Lectura de la configuración desde el entorno y carga de las llaves del despliegue.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseKeysFile } from './keys-file.ts';
import type { ServerKeys } from './keys-file.ts';

/** Configuración del proceso del servidor. */
export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  authorityToken: string;
  /** Origen permitido por CORS; cadena vacía desactiva CORS. */
  allowedOrigin: string;
}

const DEFAULT_PORT = 8787;
const DEFAULT_ORIGIN = 'http://localhost:5173';
const MIN_TOKEN_LENGTH = 32;
const SERVER_ROOT = resolve(import.meta.dirname, '..');

/** Directorio de datos por omisión: `apps/server/data`. */
export const DEFAULT_DATA_DIR = join(SERVER_ROOT, 'data');

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SIGILO_PORT debe ser un puerto válido.');
  }
  return port;
}

/**
 * Construye la configuración a partir de las variables de entorno.
 * Lanza error si `SIGILO_AUTHORITY_TOKEN` falta o mide menos de 32 caracteres.
 */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const authorityToken = env.SIGILO_AUTHORITY_TOKEN ?? '';
  // Seguridad: un token corto es adivinable; se exige longitud mínima antes de arrancar.
  if (authorityToken.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `SIGILO_AUTHORITY_TOKEN es obligatorio y debe medir al menos ${MIN_TOKEN_LENGTH} caracteres.`,
    );
  }
  return {
    host: '127.0.0.1',
    port: parsePort(env.SIGILO_PORT),
    dataDir: resolve(env.SIGILO_DATA_DIR || DEFAULT_DATA_DIR),
    authorityToken,
    allowedOrigin: env.SIGILO_ALLOWED_ORIGIN ?? DEFAULT_ORIGIN,
  };
}

/** Lee y valida `keys.json` del directorio de datos. Lanza error si falta o es inválido. */
export function loadServerKeys(dataDir: string): ServerKeys {
  const path = join(dataDir, 'keys.json');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('No se pudo leer keys.json; ejecuta npm run keys:generate.');
  }
  return parseKeysFile(raw);
}
