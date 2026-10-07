// Entorno compartido de las pruebas E2E: puertos, token sintético y directorio temporal de datos.
// Seguridad: todo es sintético; nunca se usan la base ni las pruebas del despliegue local.
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Raíz del repositorio. */
export const REPO_ROOT = resolve(import.meta.dirname, '../..');

/** Puerto del servidor de la API (el proxy de `vite preview` apunta a él). */
export const SERVER_PORT = 8787;
/** Puerto de `vite preview`. */
export const PREVIEW_PORT = 4173;
/** Origen de la aplicación web construida. */
export const WEB_ORIGIN = `http://127.0.0.1:${PREVIEW_PORT}`;
/** Origen directo de la API, para las comprobaciones desde Node. */
export const API_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;

/** Token bearer de prueba (más de 32 caracteres, sin valor fuera de estas pruebas). */
export const AUTHORITY_TOKEN = 'token-e2e-sintetico-0123456789-abcdefghijklmnop';

const WORKSPACE_VARIABLE = 'SIGILO_E2E_WORKSPACE';

/** Directorio temporal de la corrida (datos del servidor y archivos de prueba). */
export function workspaceDir(): string {
  const dir = process.env[WORKSPACE_VARIABLE];
  if (dir === undefined || dir === '') {
    throw new Error('Falta el directorio temporal de E2E; ejecuta las pruebas con Playwright.');
  }
  return dir;
}

/** Directorio de datos del servidor de prueba: base SQLite, pruebas y `keys.json`. */
export function dataDir(): string {
  return join(workspaceDir(), 'data');
}

/** Directorio con los archivos sintéticos que se adjuntan en las pruebas. */
export function fixturesDir(): string {
  return join(workspaceDir(), 'fixtures');
}

/**
 * Archivo del reloj de pruebas del servidor (`SIGILO_TEST_CLOCK_FILE`): desplazamiento en
 * milisegundos que el servidor suma a la hora real. Vive en el directorio de la corrida, así cada
 * corrida empieza con el reloj real.
 */
export function clockFilePath(workspace: string = workspaceDir()): string {
  return join(workspace, 'clock-offset');
}

/** Ruta de la base SQLite del servidor de prueba. */
export function databasePath(): string {
  return join(dataDir(), 'sigilo.db');
}

/**
 * Crea el directorio temporal una sola vez por corrida y copia `keys.json`.
 *
 * Playwright arranca `webServer` antes que `globalSetup`, así que el directorio de datos debe
 * existir desde que se carga la configuración. La ruta viaja en una variable de entorno para que
 * los procesos de trabajo, que vuelven a cargar la configuración, reutilicen el mismo directorio.
 * Se copia `keys.json` en lugar de regenerarlo para que coincida con las llaves fijadas en la web.
 */
export function ensureWorkspace(): string {
  const existing = process.env[WORKSPACE_VARIABLE];
  if (existing !== undefined && existing !== '') return existing;
  const dir = mkdtempSync(join(tmpdir(), 'sigilo-e2e-'));
  process.env[WORKSPACE_VARIABLE] = dir;
  // Seguridad: el directorio de datos guarda una llave privada; solo lo recorre su dueño.
  mkdirSync(join(dir, 'data'), { recursive: true, mode: 0o700 });
  copyFileSync(join(REPO_ROOT, 'apps/server/data/keys.json'), join(dir, 'data', 'keys.json'));
  return dir;
}
