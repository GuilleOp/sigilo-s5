// Pruebas del bloqueo del servidor: un solo servidor por directorio, bloqueos obsoletos y puerto.
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acquireServerLock,
  isPortInUse,
  LOCK_FILE,
  LOCK_STALE_MS,
  lockHolder,
  refreshServerLock,
} from './server-lock.ts';

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
    const warnings: string[] = [];
    acquireServerLock(dataDir, process.pid, { warn: (message) => warnings.push(message) })();
    expect(warnings).toEqual([
      'Se sustituyó un bloqueo abandonado de server.lock: el proceso 999999999 ya terminó.',
    ]);
  });

  it('crea el bloqueo de forma exclusiva: un segundo intento del mismo directorio falla', () => {
    const dataDir = temporaryDir();
    const release = acquireServerLock(dataDir, process.ppid);
    expect(() => acquireServerLock(dataDir)).toThrow(`PID ${process.ppid}`);
    // Solo libera quien lo tiene.
    acquireServerLock(dataDir, process.ppid);
    release();
    expect(existsSync(join(dataDir, LOCK_FILE))).toBe(false);
  });

  it('sustituye con aviso un bloqueo con PID vivo pero anterior al arranque o sin renovar', () => {
    const dataDir = temporaryDir();
    const path = join(dataDir, LOCK_FILE);
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(message);
    writeFileSync(path, `${process.ppid}\n`);
    const old = new Date(Date.now() - 2 * LOCK_STALE_MS);
    utimesSync(path, old, old);
    expect(lockHolder(dataDir)).toBeNull();
    acquireServerLock(dataDir, process.pid, { warn })();
    expect(warnings.at(-1)).toContain('no se renovó en más de una hora');

    writeFileSync(path, `${process.ppid}\n`);
    const bootTime = () => Date.now() + 1000;
    expect(lockHolder(dataDir, { bootTime })).toBeNull();
    expect(lockHolder(dataDir)).toBe(process.ppid);
    const release = acquireServerLock(dataDir, process.pid, { warn, bootTime });
    expect(warnings.at(-1)).toContain('anterior al último arranque del sistema');
    expect(readFileSync(path, 'utf8')).toBe(`${process.pid}\n`);
    release();
  });

  it('renueva la fecha del bloqueo para que no parezca abandonado', () => {
    const dataDir = temporaryDir();
    const path = join(dataDir, LOCK_FILE);
    writeFileSync(path, `${process.ppid}\n`);
    const old = new Date(Date.now() - 2 * LOCK_STALE_MS);
    utimesSync(path, old, old);
    expect(lockHolder(dataDir)).toBeNull();
    refreshServerLock(dataDir);
    expect(lockHolder(dataDir)).toBe(process.ppid);
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
