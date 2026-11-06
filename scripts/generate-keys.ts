// Genera las llaves del despliegue de demostración (firma del servidor, buzón y firma de la
// autoridad y la llave de la supervisora, que es la segunda llave) y regenera las llaves fijadas de
// la web. Las cuentas de la autoridad se generan aparte: npm run accounts:generate.
// Uso: npm run keys:generate [-- --force]
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import type { AuthorityDemoKey, KeysFile, SupervisorDemoKey } from '@sigilo/contracts';
import {
  assertBoxKeyPair,
  assertSigningKeyPair,
  buildPublicKeySet,
  generateBoxKeyPair,
  generateSigningKeyPair,
  toBase64Url,
} from '@sigilo/core';
import {
  parseAuthorityDemoKey,
  parseKeysFile,
  parseSupervisorDemoKey,
} from '../apps/server/src/keys-file.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const PINNED_KEYS_PATH = resolve(
  process.env.SIGILO_PINNED_KEYS_FILE || join(ROOT, 'apps/web/src/config/pinned-keys.json'),
);
const KEYS_PATH = join(DATA_DIR, 'keys.json');
const AUTHORITY_PATH = join(DATA_DIR, 'authority-demo-key.json');
const SUPERVISOR_PATH = join(DATA_DIR, 'supervisor-demo-key.json');

interface GeneratedKeys {
  keysFile: KeysFile;
  authority: AuthorityDemoKey;
  supervisor: SupervisorDemoKey;
}

function generate(): GeneratedKeys {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const supervisorBox = generateBoxKeyPair();
  assertSigningKeyPair(server);
  assertBoxKeyPair(authorityBox);
  assertSigningKeyPair(authoritySigning);
  assertBoxKeyPair(supervisorBox);
  const publicKeys = buildPublicKeySet({
    serverSigningPublicKey: server.publicKey,
    authorityBoxPublicKey: authorityBox.publicKey,
    authoritySigningPublicKey: authoritySigning.publicKey,
    supervisorBoxPublicKey: supervisorBox.publicKey,
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
    supervisor: {
      version: 1,
      keyId: publicKeys.supervisor?.keyId ?? '',
      boxPublicKey: toBase64Url(supervisorBox.publicKey),
      boxPrivateKey: toBase64Url(supervisorBox.privateKey),
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

/** Ruta relativa al directorio actual si está dentro de él; si no, la absoluta. */
function display(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

function main(): void {
  const isForced = process.argv.includes('--force');
  // Las llaves fijadas se versionan, así que existen en un clon nuevo: solo se revisan las privadas.
  const existing = [KEYS_PATH, AUTHORITY_PATH, SUPERVISOR_PATH].filter((path) => existsSync(path));
  if (existing.length > 0 && !isForced) {
    console.error(
      `Ya existen llaves (${existing.map(display).join(', ')}). Usa --force para reemplazarlas.`,
    );
    process.exit(1);
  }
  const { keysFile, authority, supervisor } = generate();
  // Se valida con el mismo código que usa el servidor al arrancar.
  parseKeysFile(keysFile);
  parseAuthorityDemoKey(authority, keysFile.publicKeys);
  parseSupervisorDemoKey(supervisor, keysFile.publicKeys);
  // Seguridad: los archivos con llaves privadas solo los puede leer su dueño (0600).
  writeJson(KEYS_PATH, keysFile, 0o600);
  writeJson(AUTHORITY_PATH, authority, 0o600);
  writeJson(SUPERVISOR_PATH, supervisor, 0o600);
  // Las llaves fijadas siempre se regeneran junto con las privadas para que coincidan.
  writeJson(PINNED_KEYS_PATH, keysFile.publicKeys, 0o644);
  console.log(`Llaves privadas escritas en ${display(DATA_DIR)}.`);
  console.log(`Llaves fijadas de la web escritas en ${display(PINNED_KEYS_PATH)}.`);
  console.log(
    `Para entrar al panel, importa ${display(AUTHORITY_PATH)}; la supervisora abre los escalamientos con ${display(SUPERVISOR_PATH)}.`,
  );
  console.log('Las cuentas de la autoridad se generan con npm run accounts:generate.');
}

main();
