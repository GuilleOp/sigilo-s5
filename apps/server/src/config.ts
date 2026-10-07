// Lectura de la configuración desde el entorno y carga de las llaves del despliegue.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MAX_POW_BITS } from '@sigilo/contracts';
import type { RequestLogMode } from './http/request-log.ts';
import { REQUEST_LOG_MODES } from './http/request-log.ts';
import { parseKeysFile } from './keys-file.ts';
import type { ServerKeys } from './keys-file.ts';
import { DEFAULT_EVIDENCE_QUOTA_BYTES } from './services/evidence-service.ts';

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
  /** Dificultad de la prueba de trabajo (`SIGILO_POW_BITS`); 0 la desactiva. */
  powBits: number;
  /** Cuota total de almacenamiento de pruebas (`SIGILO_EVIDENCE_QUOTA_BYTES`). */
  evidenceQuotaBytes: number;
  /** Días de retención de pruebas sin seguimiento (`SIGILO_UNTRACKED_RETENTION_DAYS`); 0 desactiva. */
  untrackedRetentionDays: number;
  /** Registro de peticiones (`SIGILO_REQUEST_LOG`). */
  requestLogMode: RequestLogMode;
}

const DEFAULT_PORT = 8787;
const MIN_TOKEN_LENGTH = 32;
const SERVER_ROOT = resolve(import.meta.dirname, '..');
const INTEGER_PATTERN = /^\d{1,15}$/;

/** Dificultad de la prueba de trabajo por omisión: unos 260 mil hashes en promedio. */
export const DEFAULT_POW_BITS = 18;

/** Mayor desplazamiento que admite el reloj de pruebas: 400 días. */
export const MAX_TEST_CLOCK_OFFSET_MS = 400 * 24 * 60 * 60 * 1000;

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

function parseInteger(name: string, value: string | undefined, fallback: number | null) {
  if (value === undefined || value === '') return fallback;
  if (!INTEGER_PATTERN.test(value)) throw new Error(`${name} debe ser un número entero.`);
  return Number(value);
}

function parsePowBits(value: string | undefined): number {
  const bits = parseInteger('SIGILO_POW_BITS', value, DEFAULT_POW_BITS) ?? DEFAULT_POW_BITS;
  if (bits > MAX_POW_BITS) throw new Error(`SIGILO_POW_BITS debe estar entre 0 y ${MAX_POW_BITS}.`);
  return bits;
}

function isTestEnvironment(env: NodeJS.ProcessEnv): boolean {
  return env.SIGILO_E2E === '1' || env.NODE_ENV === 'test';
}

function parseRequestLog(env: NodeJS.ProcessEnv): RequestLogMode {
  const value = env.SIGILO_REQUEST_LOG ?? '';
  if (value === '') return 'aggregate';
  const mode = REQUEST_LOG_MODES.find((candidate) => candidate === value);
  if (mode === undefined) {
    throw new Error(`SIGILO_REQUEST_LOG debe ser ${REQUEST_LOG_MODES.join(', ')}.`);
  }
  // Seguridad: una línea por petición permite correlacionar envíos; solo para desarrollo.
  if (mode === 'requests' && env.NODE_ENV === 'production') {
    throw new Error('SIGILO_REQUEST_LOG=requests solo puede usarse en desarrollo.');
  }
  return mode;
}

/**
 * Comprueba que el archivo del reloj sea del usuario del proceso y que ni el grupo ni otros
 * puedan escribirlo. Un archivo ausente se acepta (equivale a desplazamiento 0).
 * Lanza error si no cumple.
 * Seguridad: quien pueda escribir el archivo decide qué días publica la bitácora.
 */
export function assertTestClockFileSafe(file: string): void {
  if (!existsSync(file)) return;
  const stats = statSync(file);
  const uid = process.getuid?.();
  if (uid !== undefined && stats.uid !== uid) {
    throw new Error('El archivo del reloj de pruebas debe pertenecer al usuario del servidor.');
  }
  if ((stats.mode & 0o022) !== 0) {
    throw new Error(
      'El archivo del reloj de pruebas no debe ser escribible por el grupo ni otros.',
    );
  }
}

const OFFSET_PATTERN = /^\d{1,15}$/;

/**
 * Reloj de pruebas: la hora real más el desplazamiento en milisegundos que contiene `file` (un
 * entero entre 0 y `MAX_TEST_CLOCK_OFFSET_MS`; archivo ausente o vacío equivale a 0). El archivo
 * se lee en cada llamada, así las pruebas E2E pueden adelantar el reloj del servidor en marcha,
 * por ejemplo para que la bitácora publique los eventos de "ayer" o los datos abiertos el mes
 * "anterior". Lanza error si el contenido no es válido, si el desfase está fuera de rango o si el
 * archivo deja de ser seguro (`assertTestClockFileSafe`).
 */
export function createOffsetClock(file: string, realNow: () => number = Date.now): () => Date {
  return () => {
    assertTestClockFileSafe(file);
    const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
    if (text !== '' && !OFFSET_PATTERN.test(text)) {
      throw new Error('El reloj de pruebas debe ser un entero de milisegundos no negativo.');
    }
    const offset = text === '' ? 0 : Number(text);
    if (offset > MAX_TEST_CLOCK_OFFSET_MS) {
      throw new Error('El desfase del reloj de pruebas está fuera del rango permitido.');
    }
    return new Date(realNow() + offset);
  };
}

/**
 * Construye la configuración a partir de las variables de entorno.
 * Lanza error si `SIGILO_AUTHORITY_TOKEN` falta o mide menos de 32 caracteres, si algún número no
 * es válido, si `SIGILO_TEST_CLOCK_FILE` se define fuera de un entorno de pruebas
 * (`SIGILO_E2E=1` o `NODE_ENV=test`) o con un archivo inseguro, o si `SIGILO_REQUEST_LOG` no es
 * válido para el entorno.
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
  // Seguridad: un reloj manipulable cambiaría qué publica la bitácora. Se acepta solo con una
  // lista positiva de entornos de prueba, nunca por ausencia de `NODE_ENV=production`.
  if (testClock !== '' && (!isTestEnvironment(env) || env.NODE_ENV === 'production')) {
    throw new Error(
      'SIGILO_TEST_CLOCK_FILE solo puede usarse en pruebas (SIGILO_E2E=1 o NODE_ENV=test).',
    );
  }
  const testClockFile = testClock === '' ? null : resolve(testClock);
  if (testClockFile !== null) assertTestClockFileSafe(testClockFile);
  return {
    host: '127.0.0.1',
    port: parsePort(env.SIGILO_PORT),
    dataDir: resolve(env.SIGILO_DATA_DIR || DEFAULT_DATA_DIR),
    authorityToken,
    allowedOrigin: env.SIGILO_ALLOWED_ORIGIN ?? '',
    webDistDir: webDist === '' ? null : resolve(webDist),
    hstsMaxAgeSeconds: parseInteger('SIGILO_HSTS_MAX_AGE', env.SIGILO_HSTS_MAX_AGE, null),
    testClockFile,
    powBits: parsePowBits(env.SIGILO_POW_BITS),
    evidenceQuotaBytes:
      parseInteger('SIGILO_EVIDENCE_QUOTA_BYTES', env.SIGILO_EVIDENCE_QUOTA_BYTES, null) ??
      DEFAULT_EVIDENCE_QUOTA_BYTES,
    untrackedRetentionDays:
      parseInteger('SIGILO_UNTRACKED_RETENTION_DAYS', env.SIGILO_UNTRACKED_RETENTION_DAYS, 0) ?? 0,
    requestLogMode: parseRequestLog(env),
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
