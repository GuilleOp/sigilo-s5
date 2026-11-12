// Entorno compartido de las pruebas E2E: puertos, cuentas sintéticas de la autoridad y directorio
// temporal de datos.
// Seguridad: todo es sintético; nunca se usan la base ni las pruebas del despliegue local.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildDemoAccounts } from '../../apps/server/src/security/demo-accounts.ts';
import { provisionMfaInDataDir } from '../../apps/server/src/services/mfa-provisioning.ts';

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

/**
 * Contraseña sintética de cada cuenta de demostración en E2E (sin valor fuera de estas pruebas).
 * Las cuentas son las de `npm run accounts:generate` (docs/demo-escenario.md).
 */
export function e2ePassword(username: string): string {
  return `contrasena-e2e-${username}`;
}

/**
 * Cuentas de las pruebas: una por persona, con su autoridad y sus funciones. En el OIC IFFE, la
 * misma persona recibe e investiga (`iffeIntake` e `iffeInvestigator` son la misma cuenta); la
 * segunda persona sirve para la apertura 2 de N.
 */
export const E2E_ACCOUNTS = {
  inboxIntake: 'buzon.federal',
  iffeIntake: 'oic-equipamiento.persona1',
  iffeInvestigator: 'oic-equipamiento.persona1',
  iffeInvestigator2: 'oic-equipamiento.persona2',
  iffeSupervision: 'oic-equipamiento.titular',
  iffeSubstantiation: 'oic-equipamiento.substanciacion',
  supervisor: 'supervision-oic',
  operation: 'operacion.federal',
} as const;

/**
 * Cuentas con el segundo factor ya inscrito en E2E (el servidor de pruebas usa
 * `SIGILO_MFA=opcional`): la supervisora y la operación del nodo, que los ayudantes de inicio de
 * sesión completan con el código TOTP, y la fiscalía, para las pruebas del segundo factor.
 */
export const E2E_MFA_USERS: ReadonlySet<string> = new Set([
  'supervision-oic',
  'operacion.federal',
  'fiscalia',
]);

/** Cuenta marcada con `requireMfa`: inscribe el segundo factor en su primer inicio de sesión. */
export const E2E_MFA_ENROLLMENT_USER = 'oic-programas';

/** Secreto TOTP sintético y fijo de una cuenta de E2E (sin valor fuera de estas pruebas). */
export function e2eTotpSecret(username: string): Uint8Array {
  return new Uint8Array(createHash('sha1').update(`sigilo-e2e-totp:${username}`).digest());
}

/** Archivo de la corrida con los códigos de recuperación de las cuentas inscritas. */
export function recoveryCodesPath(workspace: string = workspaceDir()): string {
  return join(workspace, 'mfa-recovery-codes.json');
}

/** Autoridad investigadora de las pruebas. */
export const E2E_AUTHORITY = 'authority.oic-iffe';

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
  // Cuentas individuales con contraseñas conocidas por las pruebas; costo mínimo de scrypt (2^14).
  const { file, mfa } = buildDemoAccounts({
    passwordFor: e2ePassword,
    logN: 14,
    mfa: {
      enrolled: E2E_MFA_USERS,
      requireEnrollment: new Set([E2E_MFA_ENROLLMENT_USER]),
      secretFor: e2eTotpSecret,
    },
  });
  writeFileSync(join(dir, 'data', 'authority-accounts.json'), JSON.stringify(file), {
    mode: 0o600,
  });
  // Segundo factor inscrito antes de arrancar el servidor (misma base y llave mfa-key).
  const codes = provisionMfaInDataDir(join(dir, 'data'), mfa, { recoveryLogN: 10 });
  writeFileSync(
    recoveryCodesPath(dir),
    JSON.stringify(
      Object.fromEntries(mfa.map((item) => [item.username, codes.get(item.accountId)])),
    ),
    { mode: 0o600 },
  );
  return dir;
}
