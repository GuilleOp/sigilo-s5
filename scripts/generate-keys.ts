// Genera las llaves del despliegue de demostración (firma del servidor y buzón y firma de la
// autoridad), regenera las llaves fijadas de la web y crea `apps/server/.env` con un token.
// Uso: npm run keys:generate [-- --force]
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { AuthorityDemoKey, KeysFile } from '@sigilo/contracts';
import {
  assertBoxKeyPair,
  assertSigningKeyPair,
  buildPublicKeySet,
  generateBoxKeyPair,
  generateSigningKeyPair,
  randomBytes,
  toBase64Url,
} from '@sigilo/core';
import { parseAuthorityDemoKey, parseKeysFile } from '../apps/server/src/keys-file.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const PINNED_KEYS_PATH = resolve(
  process.env.SIGILO_PINNED_KEYS_FILE || join(ROOT, 'apps/web/src/config/pinned-keys.json'),
);
const ENV_PATH = resolve(process.env.SIGILO_ENV_FILE || join(ROOT, 'apps/server/.env'));
const KEYS_PATH = join(DATA_DIR, 'keys.json');
const AUTHORITY_PATH = join(DATA_DIR, 'authority-demo-key.json');
const TOKEN_BYTES = 32;

interface GeneratedKeys {
  keysFile: KeysFile;
  authority: AuthorityDemoKey;
}

function generate(): GeneratedKeys {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  assertSigningKeyPair(server);
  assertBoxKeyPair(authorityBox);
  assertSigningKeyPair(authoritySigning);
  const publicKeys = buildPublicKeySet({
    serverSigningPublicKey: server.publicKey,
    authorityBoxPublicKey: authorityBox.publicKey,
    authoritySigningPublicKey: authoritySigning.publicKey,
  });
  return {
    keysFile: {
      version: 1,
      publicKeys,
      server: { signingPrivateKey: toBase64Url(server.privateKey) },
    },
    authority: {
      version: 1,
      keyId: publicKeys.authority.keyId,
      boxPublicKey: toBase64Url(authorityBox.publicKey),
      boxPrivateKey: toBase64Url(authorityBox.privateKey),
      signingPublicKey: toBase64Url(authoritySigning.publicKey),
      signingPrivateKey: toBase64Url(authoritySigning.privateKey),
    },
  };
}

function writeFile(path: string, content: string, mode: number): void {
  // Los directorios con secretos solo los recorre su dueño.
  mkdirSync(dirname(path), { recursive: true, mode: mode === 0o600 ? 0o700 : 0o755 });
  writeFileSync(path, content, { mode });
  // `mode` solo aplica al crear; con --force el archivo ya existía.
  chmodSync(path, mode);
}

function writeJson(path: string, value: unknown, mode: number): void {
  writeFile(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}

/** Crea `.env` con un token aleatorio si no existe; nunca reemplaza uno existente. */
function ensureEnvFile(): boolean {
  if (existsSync(ENV_PATH)) return false;
  const token = toBase64Url(randomBytes(TOKEN_BYTES));
  const content = [
    '# Generado por npm run keys:generate. No se versiona.',
    '# Token bearer del panel de autoridad (/autoridad).',
    `SIGILO_AUTHORITY_TOKEN=${token}`,
    '',
  ].join('\n');
  // Seguridad: el token da acceso al panel; solo lo lee su dueño.
  writeFile(ENV_PATH, content, 0o600);
  return true;
}

/** Ruta relativa al directorio actual si está dentro de él; si no, la absoluta. */
function display(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

function main(): void {
  const isForced = process.argv.includes('--force');
  // Las llaves fijadas se versionan, así que existen en un clon nuevo: solo se revisan las privadas.
  const existing = [KEYS_PATH, AUTHORITY_PATH].filter((path) => existsSync(path));
  if (existing.length > 0 && !isForced) {
    console.error(
      `Ya existen llaves (${existing.map(display).join(', ')}). Usa --force para reemplazarlas.`,
    );
    process.exit(1);
  }
  const { keysFile, authority } = generate();
  // Se valida con el mismo código que usa el servidor al arrancar.
  parseKeysFile(keysFile);
  parseAuthorityDemoKey(authority, keysFile.publicKeys);
  // Seguridad: los archivos con llaves privadas solo los puede leer su dueño (0600).
  writeJson(KEYS_PATH, keysFile, 0o600);
  writeJson(AUTHORITY_PATH, authority, 0o600);
  // Las llaves fijadas siempre se regeneran junto con las privadas para que coincidan.
  writeJson(PINNED_KEYS_PATH, keysFile.publicKeys, 0o644);
  const createdEnv = ensureEnvFile();
  console.log(`Llaves privadas escritas en ${display(DATA_DIR)}.`);
  console.log(`Llaves fijadas de la web escritas en ${display(PINNED_KEYS_PATH)}.`);
  console.log(
    createdEnv
      ? `Token de la autoridad creado en ${display(ENV_PATH)} (SIGILO_AUTHORITY_TOKEN).`
      : `Se conserva el token de la autoridad de ${display(ENV_PATH)}.`,
  );
  console.log(`Para entrar al panel, importa ${display(AUTHORITY_PATH)}.`);
}

main();
