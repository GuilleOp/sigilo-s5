// Pruebas de los scripts de la raíz en un directorio temporal: generación de llaves, reinicio de la
// demostración y anclaje de la bitácora desde la línea de comandos.
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LedgerAnchorSchema, PublicKeySetSchema } from '@sigilo/contracts';
import { fromBase64Url, toDayDate, verifyLedgerHead } from '@sigilo/core';
import { parseAuthorityDemoKey, parseKeysFile } from './keys-file.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const directories: string[] = [];

function temporaryDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'sigilo-scripts-'));
  directories.push(directory);
  return directory;
}

function runScript(script: string, env: Record<string, string>, args: string[] = []) {
  return spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function paths(directory: string) {
  return {
    dataDir: join(directory, 'data'),
    pinned: join(directory, 'pinned-keys.json'),
    envFile: join(directory, 'server.env'),
    anchors: join(directory, 'anchors'),
  };
}

function keyEnv(directory: string): Record<string, string> {
  const { dataDir, pinned, envFile } = paths(directory);
  return {
    SIGILO_DATA_DIR: dataDir,
    SIGILO_PINNED_KEYS_FILE: pinned,
    SIGILO_ENV_FILE: envFile,
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('scripts/generate-keys.ts', () => {
  it('genera llaves coherentes, regenera las fijadas y crea .env con un token', () => {
    const directory = temporaryDir();
    const { dataDir, pinned, envFile } = paths(directory);
    // Las fijadas existen en un clon nuevo (se versionan) y no deben bloquear la generación.
    writeFileSync(pinned, '{}\n');
    const result = runScript('generate-keys.ts', keyEnv(directory));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(envFile.split('/').at(-1));

    const keysPath = join(dataDir, 'keys.json');
    const authorityPath = join(dataDir, 'authority-demo-key.json');
    const keys = parseKeysFile(readJson(keysPath));
    parseAuthorityDemoKey(readJson(authorityPath), keys.publicKeySet);
    expect(PublicKeySetSchema.parse(readJson(pinned))).toEqual(keys.publicKeySet);
    for (const path of [keysPath, authorityPath, envFile]) {
      expect(statSync(path).mode & 0o777, path).toBe(0o600);
    }
    const token = /^SIGILO_AUTHORITY_TOKEN=(\S+)$/mu.exec(readFileSync(envFile, 'utf8'))?.[1];
    expect(token?.length).toBeGreaterThanOrEqual(32);
  });

  it('se niega a reemplazar llaves privadas sin --force y con --force conserva el token', () => {
    const directory = temporaryDir();
    const { dataDir, pinned, envFile } = paths(directory);
    expect(runScript('generate-keys.ts', keyEnv(directory)).status).toBe(0);
    const firstKeys = readFileSync(join(dataDir, 'keys.json'), 'utf8');
    const firstEnv = readFileSync(envFile, 'utf8');

    const refused = runScript('generate-keys.ts', keyEnv(directory));
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('--force');
    expect(readFileSync(join(dataDir, 'keys.json'), 'utf8')).toBe(firstKeys);

    const forced = runScript('generate-keys.ts', keyEnv(directory), ['--force']);
    expect(forced.status, forced.stderr).toBe(0);
    const secondKeys = parseKeysFile(readJson(join(dataDir, 'keys.json')));
    expect(readFileSync(join(dataDir, 'keys.json'), 'utf8')).not.toBe(firstKeys);
    expect(PublicKeySetSchema.parse(readJson(pinned))).toEqual(secondKeys.publicKeySet);
    expect(readFileSync(envFile, 'utf8')).toBe(firstEnv);
  });
});

describe('scripts/demo-reset.ts', () => {
  it('borra la base y las pruebas y conserva las llaves', () => {
    const directory = temporaryDir();
    const { dataDir } = paths(directory);
    expect(runScript('generate-keys.ts', keyEnv(directory)).status).toBe(0);
    for (const name of ['sigilo.db', 'sigilo.db-wal', 'sigilo.db-shm']) {
      writeFileSync(join(dataDir, name), 'sintético');
    }
    mkdirSync(join(dataDir, 'evidence'));
    writeFileSync(join(dataDir, 'evidence', 'a'.repeat(32)), 'sintético');

    const result = runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir });
    expect(result.status, result.stderr).toBe(0);
    for (const name of ['sigilo.db', 'sigilo.db-wal', 'sigilo.db-shm', 'evidence']) {
      expect(existsSync(join(dataDir, name)), name).toBe(false);
    }
    expect(existsSync(join(dataDir, 'keys.json'))).toBe(true);
    expect(existsSync(join(dataDir, 'authority-demo-key.json'))).toBe(true);
    expect(runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir }).stdout).toContain('No había');
  });
});

describe('scripts/ledger-anchor.ts', () => {
  it('ancla la cabeza pública de la base local con la firma de la llave fijada', () => {
    const directory = temporaryDir();
    const { dataDir, pinned, anchors } = paths(directory);
    expect(runScript('generate-keys.ts', keyEnv(directory)).status).toBe(0);
    const env = { ...keyEnv(directory), SIGILO_ANCHORS_DIR: anchors };
    // El servidor crea la base al arrancar; aquí basta con migrarla una vez.
    const migrate = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { openDatabase } from ${JSON.stringify(join(ROOT, 'apps/server/src/db/database.ts'))};
         openDatabase(${JSON.stringify(join(dataDir, 'sigilo.db'))}).close();`,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(migrate.status, migrate.stderr).toBe(0);

    const result = runScript('ledger-anchor.ts', env);
    expect(result.status, result.stderr).toBe(0);
    const anchorPath = join(anchors, `${toDayDate(new Date())}.json`);
    const anchor = LedgerAnchorSchema.parse(readJson(anchorPath));
    const serverKey = PublicKeySetSchema.parse(readJson(pinned)).server.signingPublicKey;
    expect(verifyLedgerHead(anchor.head, fromBase64Url(serverKey))).toBe(true);
    const again = runScript('ledger-anchor.ts', env);
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain('ya existe');
  });
});
