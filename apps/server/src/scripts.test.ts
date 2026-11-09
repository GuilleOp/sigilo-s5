// Pruebas de los scripts de la raíz en un directorio temporal: generación de llaves, reinicio de la
// demostración y anclaje de la bitácora desde la línea de comandos.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';
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
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LedgerAnchorSchema, PublicKeySetSchema } from '@sigilo/contracts';
import { fromBase64Url, toDayDate, verifyLedgerHead } from '@sigilo/core';
import { parseAuthorityDemoKey, parseKeysFile, parseSupervisorDemoKey } from './keys-file.ts';
import { createAuthorityRegistry } from './security/authority-registry.ts';
import { verifyPassword } from './security/passwords.ts';
import { MISSING_DATABASE_MESSAGE } from './ledger-anchor.ts';
import { LOCK_FILE } from './server-lock.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const directories: string[] = [];

function temporaryDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'sigilo-scripts-'));
  directories.push(directory);
  return directory;
}

/** Puerto libre de este proceso, para que los scripts no choquen con un servidor de desarrollo. */
let freePort = 0;

function runScript(script: string, env: Record<string, string>, args: string[] = []) {
  return spawnSync(process.execPath, [join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env: { ...process.env, SIGILO_PORT: String(freePort), ...env },
    encoding: 'utf8',
  });
}

async function listenOnFreePort(): Promise<Server> {
  const server = createServer();
  await new Promise<void>((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  return server;
}

function paths(directory: string) {
  return {
    dataDir: join(directory, 'data'),
    pinned: join(directory, 'pinned-keys.json'),
    anchors: join(directory, 'anchors'),
  };
}

function keyEnv(directory: string): Record<string, string> {
  const { dataDir, pinned } = paths(directory);
  return { SIGILO_DATA_DIR: dataDir, SIGILO_PINNED_KEYS_FILE: pinned };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

beforeAll(async () => {
  // Se reserva un puerto y se libera: queda libre para los scripts durante las pruebas.
  const server = await listenOnFreePort();
  freePort = (server.address() as AddressInfo).port;
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
});

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('scripts/generate-keys.ts', () => {
  it('genera llaves coherentes con la de la supervisora y regenera las fijadas', () => {
    const directory = temporaryDir();
    const { dataDir, pinned } = paths(directory);
    // Las fijadas existen en un clon nuevo (se versionan) y no deben bloquear la generación.
    writeFileSync(pinned, '{}\n');
    const result = runScript('generate-keys.ts', keyEnv(directory));
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('accounts:generate');

    const keysPath = join(dataDir, 'keys.json');
    const authorityPath = join(dataDir, 'authority-demo-key.json');
    const supervisorPath = join(dataDir, 'supervisor-demo-key.json');
    const keys = parseKeysFile(readJson(keysPath));
    parseAuthorityDemoKey(readJson(authorityPath), keys.publicKeySet);
    parseSupervisorDemoKey(readJson(supervisorPath), keys.publicKeySet);
    expect(keys.publicKeySet.supervisor).toBeDefined();
    expect(PublicKeySetSchema.parse(readJson(pinned))).toEqual(keys.publicKeySet);
    for (const path of [keysPath, authorityPath, supervisorPath]) {
      expect(statSync(path).mode & 0o777, path).toBe(0o600);
    }
    // Ya no se crea ningún token compartido.
    expect(existsSync(join(directory, 'server.env'))).toBe(false);
  });

  it('se niega a reemplazar llaves privadas sin --force', () => {
    const directory = temporaryDir();
    const { dataDir, pinned } = paths(directory);
    expect(runScript('generate-keys.ts', keyEnv(directory)).status).toBe(0);
    const firstKeys = readFileSync(join(dataDir, 'keys.json'), 'utf8');

    const refused = runScript('generate-keys.ts', keyEnv(directory));
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('--force');
    expect(readFileSync(join(dataDir, 'keys.json'), 'utf8')).toBe(firstKeys);

    const forced = runScript('generate-keys.ts', keyEnv(directory), ['--force']);
    expect(forced.status, forced.stderr).toBe(0);
    const secondKeys = parseKeysFile(readJson(join(dataDir, 'keys.json')));
    expect(readFileSync(join(dataDir, 'keys.json'), 'utf8')).not.toBe(firstKeys);
    expect(PublicKeySetSchema.parse(readJson(pinned))).toEqual(secondKeys.publicKeySet);
  });
});

describe('scripts/generate-accounts.ts', () => {
  it('genera cuentas individuales con digestos y credenciales de demostración privadas', async () => {
    const directory = temporaryDir();
    const { dataDir } = paths(directory);
    const result = runScript('generate-accounts.ts', { SIGILO_DATA_DIR: dataDir });
    expect(result.status, result.stderr).toBe(0);
    const accountsPath = join(dataDir, 'authority-accounts.json');
    const credentialsPath = join(dataDir, 'authority-demo-credentials.json');
    const registry = createAuthorityRegistry(readJson(accountsPath));
    for (const path of [accountsPath, credentialsPath]) {
      expect(statSync(path).mode & 0o777, path).toBe(0o600);
    }
    const { credenciales } = readJson(credentialsPath) as {
      credenciales: { username: string; password: string; functions: string[] }[];
    };
    const functions = new Set(credenciales.flatMap((item) => item.functions));
    expect([...functions].sort()).toEqual([
      'intake',
      'investigation',
      'operation',
      'substantiation',
      'supervision',
    ]);
    // El buzón general solo recibe y turna; la substanciación nunca investiga (LGRA art. 115).
    const functionsOf = (username: string) =>
      credenciales.find((item) => item.username === username)?.functions;
    expect(functionsOf('buzon.federal')).toEqual(['intake']);
    expect(functionsOf('operacion.federal')).toEqual(['operation']);
    expect(functionsOf('oic-equipamiento.persona1')).toEqual(['intake', 'investigation']);
    expect(functionsOf('oic-equipamiento.substanciacion')).toEqual(['substantiation']);
    const [first] = credenciales;
    if (first === undefined) throw new Error('Faltan credenciales.');
    const account = registry.findByUsername(first.username);
    if (account === null) throw new Error('Falta la cuenta.');
    await expect(verifyPassword(first.password, account.passwordHash)).resolves.toBe(true);
    // El archivo que lee el servidor nunca trae contraseñas en claro.
    expect(readFileSync(accountsPath, 'utf8')).not.toContain(first.password);
    const refused = runScript('generate-accounts.ts', { SIGILO_DATA_DIR: dataDir });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('--force');
  });
});

describe('scripts/demo-reset.ts', () => {
  function prepare(): string {
    const directory = temporaryDir();
    const { dataDir } = paths(directory);
    expect(runScript('generate-keys.ts', keyEnv(directory)).status).toBe(0);
    for (const name of ['sigilo.db', 'sigilo.db-wal', 'sigilo.db-shm']) {
      writeFileSync(join(dataDir, name), 'sintético');
    }
    mkdirSync(join(dataDir, 'evidence'));
    writeFileSync(join(dataDir, 'evidence', 'a'.repeat(32)), 'sintético');
    return dataDir;
  }

  it('borra la base y las pruebas con --yes y conserva las llaves', () => {
    const dataDir = prepare();
    const result = runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir }, ['--yes']);
    expect(result.status, result.stderr).toBe(0);
    for (const name of ['sigilo.db', 'sigilo.db-wal', 'sigilo.db-shm', 'evidence']) {
      expect(existsSync(join(dataDir, name)), name).toBe(false);
    }
    expect(existsSync(join(dataDir, 'keys.json'))).toBe(true);
    expect(existsSync(join(dataDir, 'authority-demo-key.json'))).toBe(true);
    expect(runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir }, ['--yes']).stdout).toContain(
      'No había',
    );
  });

  it('sin --yes ni marcador no borra nada; con el marcador sí', () => {
    const dataDir = prepare();
    const refused = runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir });
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('--yes');
    expect(existsSync(join(dataDir, 'sigilo.db'))).toBe(true);
    writeFileSync(join(dataDir, '.sigilo-demo'), '');
    expect(runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir }).status).toBe(0);
    expect(existsSync(join(dataDir, 'sigilo.db'))).toBe(false);
  });

  it('no se ejecuta si el servidor tiene el bloqueo o el puerto está ocupado', async () => {
    const dataDir = prepare();
    // Un proceso vivo distinto de este, como si fuera el servidor.
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']);
    try {
      writeFileSync(join(dataDir, LOCK_FILE), `${holder.pid}\n`);
      const locked = runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir }, ['--yes']);
      expect(locked.status).toBe(1);
      expect(locked.stderr).toContain('en marcha');
    } finally {
      holder.kill();
    }
    rmSync(join(dataDir, LOCK_FILE));
    const server = await listenOnFreePort();
    try {
      const port = String((server.address() as AddressInfo).port);
      const busy = runScript('demo-reset.ts', { SIGILO_DATA_DIR: dataDir, SIGILO_PORT: port }, [
        '--yes',
      ]);
      expect(busy.status).toBe(1);
      expect(busy.stderr).toContain(`puerto ${port}`);
    } finally {
      await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
    }
    expect(existsSync(join(dataDir, 'sigilo.db'))).toBe(true);
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

    // El directorio de anclajes no existe todavía: el script lo crea.
    expect(existsSync(anchors)).toBe(false);
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

  it('da un mensaje claro y sale con error si la base local no existe', () => {
    const directory = temporaryDir();
    const { anchors } = paths(directory);
    expect(runScript('generate-keys.ts', keyEnv(directory)).status).toBe(0);
    const result = runScript('ledger-anchor.ts', {
      ...keyEnv(directory),
      SIGILO_ANCHORS_DIR: anchors,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(MISSING_DATABASE_MESSAGE);
    expect(existsSync(anchors)).toBe(false);
  });
});
