// Lectura de la configuración desde el entorno y carga de las llaves del despliegue.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseKeysFile } from './keys-file.ts';
import type { ServerKeys } from './keys-file.ts';

/** Configuración del proceso del servidor. */
export interface ServerConfig {
  host: string;
  port: number;
  dataDir: string;
  authorityToken: string;
  /** Origen permitido por CORS; cadena vacía (por omisión) desactiva CORS. */
  allowedOrigin: string;
  /** Directorio de la web construida para servirla en el mismo origen, o `null`. */
  webDistDir: string | null;
  /** `max-age` de `Strict-Transport-Security` en segundos, o `null` para no enviarla. */
  hstsMaxAgeSeconds: number | null;
  /**
   * Solo pruebas: archivo con un desplazamiento del reloj en milisegundos
   * (`SIGILO_TEST_CLOCK_FILE`), o `null` para usar el reloj real. Ver `createOffsetClock`.
   */
  testClockFile: string | null;
}

const DEFAULT_PORT = 8787;
const MIN_TOKEN_LENGTH = 32;
const SERVER_ROOT = resolve(import.meta.dirname, '..');
const INTEGER_PATTERN = /^\d{1,10}$/;

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

function parseHsts(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  if (!INTEGER_PATTERN.test(value)) {
    throw new Error('SIGILO_HSTS_MAX_AGE debe ser un número entero de segundos.');
  }
  return Number(value);
}

const OFFSET_PATTERN = /^\d{1,15}$/;

/**
 * Reloj de pruebas: la hora real más el desplazamiento en milisegundos que contiene `file` (un
 * entero no negativo; archivo ausente o vacío equivale a 0). El archivo se lee en cada llamada,
 * así las pruebas E2E pueden adelantar el reloj del servidor en marcha, por ejemplo para que la
 * bitácora publique los eventos de "ayer" o los datos abiertos el mes "anterior".
 * Lanza error si el contenido no es un entero no negativo.
 */
export function createOffsetClock(file: string, realNow: () => number = Date.now): () => Date {
  return () => {
    const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
    if (text !== '' && !OFFSET_PATTERN.test(text)) {
      throw new Error('El reloj de pruebas debe ser un entero de milisegundos no negativo.');
    }
    return new Date(realNow() + (text === '' ? 0 : Number(text)));
  };
}

/**
 * Construye la configuración a partir de las variables de entorno.
 * Lanza error si `SIGILO_AUTHORITY_TOKEN` falta o mide menos de 32 caracteres, o si el puerto o
 * `SIGILO_HSTS_MAX_AGE` no son válidos, o si `SIGILO_TEST_CLOCK_FILE` se define con
 * `NODE_ENV=production`.
 * Seguridad: CORS queda desactivado salvo que `SIGILO_ALLOWED_ORIGIN` lo configure; la web se
 * sirve en el mismo origen (por el proxy de Vite o con `SIGILO_WEB_DIST`).
 */
export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const authorityToken = env.SIGILO_AUTHORITY_TOKEN ?? '';
  // Seguridad: un token corto es adivinable; se exige longitud mínima antes de arrancar.
  if (authorityToken.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `SIGILO_AUTHORITY_TOKEN es obligatorio y debe medir al menos ${MIN_TOKEN_LENGTH} caracteres.`,
    );
  }
  const webDist = env.SIGILO_WEB_DIST ?? '';
  const testClock = env.SIGILO_TEST_CLOCK_FILE ?? '';
  // Seguridad: un reloj manipulable cambiaría qué publica la bitácora; nunca en producción.
  if (testClock !== '' && env.NODE_ENV === 'production') {
    throw new Error('SIGILO_TEST_CLOCK_FILE solo puede usarse en pruebas.');
  }
  return {
    host: '127.0.0.1',
    port: parsePort(env.SIGILO_PORT),
    dataDir: resolve(env.SIGILO_DATA_DIR || DEFAULT_DATA_DIR),
    authorityToken,
    allowedOrigin: env.SIGILO_ALLOWED_ORIGIN ?? '',
    webDistDir: webDist === '' ? null : resolve(webDist),
    hstsMaxAgeSeconds: parseHsts(env.SIGILO_HSTS_MAX_AGE),
    testClockFile: testClock === '' ? null : resolve(testClock),
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
