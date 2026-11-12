// Genera las cuentas individuales sintéticas de la autoridad para la demostración: el archivo de
// cuentas que lee el servidor (solo digestos scrypt) y las credenciales en claro para entrar al
// panel (con el secreto TOTP sintético de las cuentas que ya tienen segundo factor, que se inscriben
// en la base del directorio de datos). Ninguno de los dos se versiona.
// Uso: npm run accounts:generate [-- --force]
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { ACCOUNTS_FILE_NAME } from '../apps/server/src/config.ts';
import { createAuthorityRegistry } from '../apps/server/src/security/authority-registry.ts';
import { buildDemoAccounts, withRecoveryCodes } from '../apps/server/src/security/demo-accounts.ts';
import { provisionMfaInDataDir } from '../apps/server/src/services/mfa-provisioning.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const ACCOUNTS_PATH = resolve(
  process.env.SIGILO_ACCOUNTS_FILE || join(DATA_DIR, ACCOUNTS_FILE_NAME),
);
const CREDENTIALS_PATH = join(dirname(ACCOUNTS_PATH), 'authority-demo-credentials.json');

function display(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

function writeSecret(path: string, value: unknown): void {
  // Seguridad: solo su dueño lee el directorio y los archivos (0700 y 0600).
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function main(): void {
  const isForced = process.argv.includes('--force');
  const existing = [ACCOUNTS_PATH, CREDENTIALS_PATH].filter((path) => existsSync(path));
  if (existing.length > 0 && !isForced) {
    console.error(
      `Ya existen cuentas (${existing.map(display).join(', ')}). Usa --force para reemplazarlas; las sesiones abiertas dejarán de valer.`,
    );
    process.exit(1);
  }
  const { file, credentials, mfa } = buildDemoAccounts();
  // Se valida con el mismo código que usa el servidor al arrancar.
  createAuthorityRegistry(file);
  writeSecret(ACCOUNTS_PATH, file);
  // Segundo factor ya inscrito de algunas cuentas (secretos sintéticos, cifrados con mfa-key).
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const codes = provisionMfaInDataDir(DATA_DIR, mfa);
  writeSecret(CREDENTIALS_PATH, {
    aviso:
      'Credenciales sintéticas de la demostración. No se versionan; regenera con npm run accounts:generate -- --force. Código del segundo factor: npm run demo:codigo -- <usuario>.',
    credenciales: withRecoveryCodes(credentials, mfa, codes),
  });
  console.log(`Cuentas de la autoridad escritas en ${display(ACCOUNTS_PATH)} (solo digestos).`);
  console.log(
    `Credenciales de demostración en ${display(CREDENTIALS_PATH)}: una por persona, con su autoridad y su función.`,
  );
  console.log(
    `Segundo factor ya inscrito en ${mfa.map((item) => item.username).join(', ')}: npm run demo:codigo -- <usuario> da el código vigente.`,
  );
}

main();
