// Reinicia la demostración: borra la base y las pruebas del directorio de datos y conserva las
// llaves (`keys.json`, `authority-demo-key.json` y `supervisor-demo-key.json`) y las cuentas de la
// autoridad (`authority-accounts.json`). Las cuentas de la demostración que tenían segundo factor
// lo vuelven a tener con el mismo secreto (`authority-demo-credentials.json`) y códigos de
// recuperación nuevos.
// Uso: npm run demo:reset -- --yes (o con el marcador `.sigilo-demo` en el directorio de datos).
// Se niega si el servidor está en marcha (bloqueo del directorio de datos o puerto ocupado).
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { AuthorityAccountsFileSchema } from '@sigilo/contracts';
import { ACCOUNTS_FILE_NAME } from '../apps/server/src/config.ts';
import type { DemoCredential } from '../apps/server/src/security/demo-accounts.ts';
import { fromBase32 } from '../apps/server/src/security/totp.ts';
import { isPortInUse, lockHolder } from '../apps/server/src/server-lock.ts';
import { provisionMfaInDataDir } from '../apps/server/src/services/mfa-provisioning.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const PORT = Number(process.env.SIGILO_PORT || 8787);
const TARGETS = ['sigilo.db', 'sigilo.db-wal', 'sigilo.db-shm', 'evidence'];

/** Archivo que marca un directorio de datos como de demostración (permite omitir `--yes`). */
const DEMO_MARKER = '.sigilo-demo';

const CREDENTIALS_FILE = 'authority-demo-credentials.json';

/**
 * Vuelve a inscribir el segundo factor de las cuentas de la demostración que lo tenían (mismo
 * secreto, códigos de recuperación nuevos en las credenciales). Devuelve los usuarios inscritos.
 */
function restoreDemoMfa(): string[] {
  const accountsPath = join(DATA_DIR, ACCOUNTS_FILE_NAME);
  const credentialsPath = join(DATA_DIR, CREDENTIALS_FILE);
  if (!existsSync(accountsPath) || !existsSync(credentialsPath)) return [];
  const accounts = AuthorityAccountsFileSchema.parse(
    JSON.parse(readFileSync(accountsPath, 'utf8')),
  );
  const stored = JSON.parse(readFileSync(credentialsPath, 'utf8')) as {
    credenciales: DemoCredential[];
  };
  const provisions = stored.credenciales.flatMap((credential) => {
    const account = accounts.accounts.find((item) => item.username === credential.username);
    return credential.mfaSecret === undefined || account === undefined
      ? []
      : [{ accountId: account.accountId, secret: fromBase32(credential.mfaSecret) }];
  });
  if (provisions.length === 0) return [];
  const codes = provisionMfaInDataDir(DATA_DIR, provisions);
  const credenciales = stored.credenciales.map((credential) => {
    const account = accounts.accounts.find((item) => item.username === credential.username);
    const recoveryCodes = account === undefined ? undefined : codes.get(account.accountId);
    return recoveryCodes === undefined ? credential : { ...credential, recoveryCodes };
  });
  writeFileSync(credentialsPath, `${JSON.stringify({ ...stored, credenciales }, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(credentialsPath, 0o600);
  return provisions.map(
    (item) =>
      accounts.accounts.find((account) => account.accountId === item.accountId)?.username ?? '',
  );
}

function displayPath(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

async function main(): Promise<void> {
  const where = displayPath(DATA_DIR);
  // Seguridad: borrar la base es irreversible; se exige una confirmación explícita.
  const isConfirmed = process.argv.includes('--yes') || existsSync(join(DATA_DIR, DEMO_MARKER));
  if (!isConfirmed) {
    throw new Error(
      `Esto borra la base y las pruebas de ${where}. Confírmalo con npm run demo:reset -- --yes o crea el marcador ${DEMO_MARKER} en ese directorio.`,
    );
  }
  const holder = lockHolder(DATA_DIR);
  if (holder !== null) {
    throw new Error(`El servidor está en marcha (PID ${holder}); detenlo antes de reiniciar.`);
  }
  if (Number.isInteger(PORT) && (await isPortInUse(PORT))) {
    throw new Error(`Hay un servidor escuchando en el puerto ${PORT}; detenlo antes de reiniciar.`);
  }
  const removed = TARGETS.map((name) => join(DATA_DIR, name)).filter((path) => existsSync(path));
  for (const path of removed) rmSync(path, { recursive: true, force: true });
  const restored = restoreDemoMfa();
  if (restored.length > 0) {
    console.log(
      `Segundo factor inscrito de nuevo en ${restored.join(', ')} (códigos de recuperación nuevos).`,
    );
  }
  console.log(
    removed.length === 0
      ? `No había datos de demostración en ${where}.`
      : `Se borraron la base y las pruebas de ${where}; las llaves y las cuentas se conservan.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo reiniciar la demostración.');
  process.exit(1);
});
