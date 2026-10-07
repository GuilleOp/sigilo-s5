// Pruebas del bloqueo del servidor: un solo servidor por directorio, bloqueos obsoletos y puerto.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireServerLock, isPortInUse, LOCK_FILE, lockHolder } from './server-lock.ts';

const directories: string[] = [];

function temporaryDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'sigilo-lock-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('acquireServerLock', () => {
  it('toma y libera el bloqueo con el PID del proceso', () => {
    const dataDir = temporaryDir();
    expect(lockHolder(dataDir)).toBeNull();
    const release = acquireServerLock(dataDir);
    expect(lockHolder(dataDir)).toBe(process.pid);
    release();
    expect(lockHolder(dataDir)).toBeNull();
  });

  it('rechaza un segundo servidor vivo y reemplaza un bloqueo obsoleto', () => {
    const dataDir = temporaryDir();
    // El proceso padre de las pruebas está vivo y no es este proceso.
    writeFileSync(join(dataDir, LOCK_FILE), `${process.ppid}\n`);
    expect(() => acquireServerLock(dataDir)).toThrow('Ya hay un servidor');
    writeFileSync(join(dataDir, LOCK_FILE), '999999999\n');
    expect(lockHolder(dataDir)).toBeNull();
    acquireServerLock(dataDir)();
  });
});

describe('isPortInUse', () => {
  it('detecta un puerto ocupado y uno libre', async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    expect(await isPortInUse(port)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await isPortInUse(port)).toBe(false);
  });
});
