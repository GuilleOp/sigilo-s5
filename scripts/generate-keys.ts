// Genera las llaves del despliegue de demostración: firma del servidor y buzón y firma de la
// autoridad. Uso: npm run keys:generate [-- --force]
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { PublicKeySet } from '@sigilo/contracts';
import { generateBoxKeyPair, generateSigningKeyPair, keyIdFor, toBase64Url } from '@sigilo/core';
import type { AuthorityDemoKey, KeysFile } from '../apps/server/src/keys-file.ts';
import { parseKeysFile } from '../apps/server/src/keys-file.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const PINNED_KEYS_PATH = resolve(
  process.env.SIGILO_PINNED_KEYS_FILE || join(ROOT, 'apps/web/src/config/pinned-keys.json'),
);
const ENV_EXAMPLE_PATH = join(ROOT, 'apps/server/.env.example');
const KEYS_PATH = join(DATA_DIR, 'keys.json');
const AUTHORITY_PATH = join(DATA_DIR, 'authority-demo-key.json');

const ENV_EXAMPLE = `# Variables del servidor de SIGILO. Copiar a .env y completar; .env no se versiona.
# Puerto de escucha (siempre en 127.0.0.1).
SIGILO_PORT=8787
# Directorio de datos: base SQLite, pruebas y keys.json. Por omisión, apps/server/data.
# SIGILO_DATA_DIR=
# Token bearer de la autoridad: obligatorio, al menos 32 caracteres aleatorios.
# Generar con: node -e "console.log(crypto.randomBytes(32).toString('base64url'))"
SIGILO_AUTHORITY_TOKEN=
# Origen permitido por CORS en desarrollo (vacío lo desactiva).
SIGILO_ALLOWED_ORIGIN=http://localhost:5173
`;

interface GeneratedKeys {
  keysFile: KeysFile;
  authority: AuthorityDemoKey;
}

function generate(): GeneratedKeys {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const authorityKeyId = keyIdFor(authorityBox.publicKey);
  const publicKeys: PublicKeySet = {
    server: { keyId: keyIdFor(server.publicKey), signingPublicKey: toBase64Url(server.publicKey) },
    authority: {
      keyId: authorityKeyId,
      boxPublicKey: toBase64Url(authorityBox.publicKey),
      signingPublicKey: toBase64Url(authoritySigning.publicKey),
    },
  };
  return {
    keysFile: {
      version: 1,
      publicKeys,
      server: { signingPrivateKey: toBase64Url(server.privateKey) },
    },
    authority: {
      version: 1,
      keyId: authorityKeyId,
      boxPublicKey: toBase64Url(authorityBox.publicKey),
      boxPrivateKey: toBase64Url(authorityBox.privateKey),
      signingPublicKey: toBase64Url(authoritySigning.publicKey),
      signingPrivateKey: toBase64Url(authoritySigning.privateKey),
    },
  };
}

function writeJson(path: string, value: unknown, mode: number): void {
  // Los directorios con secretos solo los recorre su dueño.
  mkdirSync(dirname(path), { recursive: true, mode: mode === 0o600 ? 0o700 : 0o755 });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode });
  // `mode` solo aplica al crear; con --force el archivo ya existía.
  chmodSync(path, mode);
}

function main(): void {
  const isForced = process.argv.includes('--force');
  const outputs = [KEYS_PATH, AUTHORITY_PATH, PINNED_KEYS_PATH];
  const existing = outputs.filter((path) => existsSync(path));
  if (existing.length > 0 && !isForced) {
    console.error(`Ya existen llaves (${existing.join(', ')}). Usa --force para reemplazarlas.`);
    process.exit(1);
  }
  const { keysFile, authority } = generate();
  // Se valida con el mismo código que usa el servidor al arrancar.
  parseKeysFile(keysFile);
  // Seguridad: los archivos con llaves privadas solo los puede leer su dueño (0600).
  writeJson(KEYS_PATH, keysFile, 0o600);
  writeJson(AUTHORITY_PATH, authority, 0o600);
  writeJson(PINNED_KEYS_PATH, keysFile.publicKeys, 0o644);
  if (!existsSync(ENV_EXAMPLE_PATH)) writeFileSync(ENV_EXAMPLE_PATH, ENV_EXAMPLE);
  console.log(`Llaves escritas en ${DATA_DIR} y ${PINNED_KEYS_PATH}.`);
}

main();
