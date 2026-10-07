// Archivo de bloqueo del servidor en el directorio de datos: impide dos servidores sobre la misma
// base y permite a los scripts saber si el servidor está en marcha.
import { connect } from 'node:net';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Nombre del archivo de bloqueo dentro del directorio de datos. */
export const LOCK_FILE = 'server.lock';

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: el proceso existe pero es de otro usuario.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** PID del servidor que tiene el bloqueo y sigue vivo, o `null` si no hay o está obsoleto. */
export function lockHolder(dataDir: string): number | null {
  const path = join(dataDir, LOCK_FILE);
  if (!existsSync(path)) return null;
  const pid = Number(readFileSync(path, 'utf8').trim());
  return Number.isSafeInteger(pid) && pid > 0 && isProcessAlive(pid) ? pid : null;
}

/**
 * Toma el bloqueo con el PID del proceso y devuelve la función que lo libera. Un bloqueo de un
 * proceso que ya terminó se reemplaza. Lanza error si otro servidor vivo lo tiene.
 */
export function acquireServerLock(dataDir: string, pid: number = process.pid): () => void {
  const holder = lockHolder(dataDir);
  if (holder !== null && holder !== pid) {
    throw new Error(`Ya hay un servidor en marcha con este directorio de datos (PID ${holder}).`);
  }
  const path = join(dataDir, LOCK_FILE);
  writeFileSync(path, `${pid}\n`, { mode: 0o600 });
  return () => {
    if (lockHolder(dataDir) === pid) rmSync(path, { force: true });
  };
}

/** Indica si algo acepta conexiones en `127.0.0.1:port` (espera a lo más `timeoutMs`). */
export function isPortInUse(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = connect({ host: '127.0.0.1', port });
    const finish = (inUse: boolean) => {
      socket.destroy();
      resolvePromise(inUse);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}
