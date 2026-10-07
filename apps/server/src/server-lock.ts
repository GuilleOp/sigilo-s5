// Archivo de bloqueo del servidor en el directorio de datos: impide dos servidores sobre la misma
// base y permite a los scripts saber si el servidor está en marcha.
import { connect } from 'node:net';
import {
  linkSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { uptime } from 'node:os';
import { join } from 'node:path';
import { randomBytes, toHex } from '@sigilo/core';

/** Nombre del archivo de bloqueo dentro del directorio de datos. */
export const LOCK_FILE = 'server.lock';

/**
 * Antigüedad a partir de la cual un bloqueo se considera abandonado aunque su PID siga vivo: el
 * servidor lo renueva cada 10 minutos (`refreshServerLock`), así que una hora sin renovar indica
 * que el PID ya es de otro proceso.
 */
export const LOCK_STALE_MS = 60 * 60 * 1000;

/**
 * Antigüedad mínima para que un bloqueo con contenido inválido se considere abandonado: uno
 * reciente puede ser de otra herramienta que aún lo está escribiendo.
 */
export const INVALID_LOCK_GRACE_MS = 10 * 1000;

/** Opciones de lectura y toma del bloqueo; se inyectan para probar. */
export interface LockOptions {
  now?: () => number;
  /** Momento del último arranque del sistema, en milisegundos. */
  bootTime?: () => number;
  staleAfterMs?: number;
  /** Recibe el aviso cuando se sustituye un bloqueo abandonado (por omisión, a stderr). */
  warn?: (message: string) => void;
}

interface LockState {
  content: string;
  pid: number | null;
  modifiedAt: number;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: el proceso existe pero es de otro usuario.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readLock(path: string): LockState | null {
  try {
    const content = readFileSync(path, 'utf8');
    const modifiedAt = statSync(path).mtimeMs;
    const pid = Number(content.trim());
    return { content, pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null, modifiedAt };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function defaultBootTime(): number {
  return Date.now() - uptime() * 1000;
}

function writeWarning(message: string): void {
  process.stderr.write(`${message}\n`);
}

/** Motivo por el que un bloqueo ya no pertenece a un servidor vivo, o `null` si sigue vigente. */
function staleReason(state: LockState, options: LockOptions): string | null {
  const now = (options.now ?? Date.now)();
  if (state.pid === null) {
    return now - state.modifiedAt < INVALID_LOCK_GRACE_MS
      ? null
      : 'su contenido no es un PID válido';
  }
  if (!isProcessAlive(state.pid)) return `el proceso ${state.pid} ya terminó`;
  if (state.modifiedAt < (options.bootTime ?? defaultBootTime)()) {
    return `es anterior al último arranque del sistema y el PID ${state.pid} es de otro proceso`;
  }
  if (now - state.modifiedAt > (options.staleAfterMs ?? LOCK_STALE_MS)) {
    return `no se renovó en más de una hora y el PID ${state.pid} probablemente es de otro proceso`;
  }
  return null;
}

/** PID del servidor que tiene el bloqueo y sigue vivo, o `null` si no hay o está abandonado. */
export function lockHolder(dataDir: string, options: LockOptions = {}): number | null {
  const state = readLock(join(dataDir, LOCK_FILE));
  return state === null || staleReason(state, options) !== null ? null : state.pid;
}

/**
 * Crea el bloqueo ya completo: escribe el PID en un archivo temporal único y lo enlaza con
 * `linkSync`, que falla si `server.lock` existe. Así nadie ve nunca un bloqueo vacío o a medio
 * escribir (que parecería abandonado y otro servidor apartaría).
 */
function createExclusive(path: string, pid: number): boolean {
  const temporary = `${path}.${toHex(randomBytes(8))}.tmp`;
  writeFileSync(temporary, `${pid}\n`, { mode: 0o600, flag: 'wx' });
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    rmSync(temporary, { force: true });
  }
}

/**
 * Aparta un bloqueo abandonado sin pisar uno nuevo: lo renombra a un nombre único y comprueba que
 * lo renombrado sea exactamente lo que se juzgó abandonado; si otro servidor lo tomó entretanto,
 * lo devuelve a su lugar y lanza error.
 */
function setAsideStale(path: string, judged: LockState): void {
  const aside = `${path}.abandonado-${toHex(randomBytes(8))}`;
  try {
    renameSync(path, aside);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const moved = readLock(aside);
  const isJudged =
    moved !== null && moved.content === judged.content && moved.modifiedAt === judged.modifiedAt;
  if (!isJudged) {
    try {
      linkSync(aside, path);
    } catch {
      // Ya hay otro bloqueo en su lugar: el que se apartó era más reciente que el juzgado.
    }
    rmSync(aside, { force: true });
    throw new Error('Otro servidor tomó el bloqueo al mismo tiempo; vuelve a intentarlo.');
  }
  rmSync(aside, { force: true });
}

/**
 * Toma el bloqueo con el PID del proceso y devuelve la función que lo libera. El archivo aparece
 * de forma atómica y ya con su contenido (`linkSync` desde un temporal), así dos servidores que
 * arrancan a la vez no pueden tomarlo los dos. Un bloqueo abandonado (proceso terminado, contenido
 * inválido con más de `INVALID_LOCK_GRACE_MS`, anterior al arranque del sistema o sin renovar en
 * `LOCK_STALE_MS`) se sustituye con un aviso que explica el motivo. Lanza error si otro servidor
 * vivo lo tiene o si el contenido es inválido pero reciente.
 */
export function acquireServerLock(
  dataDir: string,
  pid: number = process.pid,
  options: LockOptions = {},
): () => void {
  const path = join(dataDir, LOCK_FILE);
  const release = () => {
    if (readLock(path)?.pid === pid) rmSync(path, { force: true });
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (createExclusive(path, pid)) return release;
    const state = readLock(path);
    if (state === null) continue;
    const reason = staleReason(state, options);
    if (reason === null) {
      if (state.pid === pid) {
        refreshServerLock(dataDir);
        return release;
      }
      if (state.pid === null) {
        throw new Error(
          'El bloqueo del directorio de datos se está escribiendo; vuelve a intentarlo.',
        );
      }
      throw new Error(
        `Ya hay un servidor en marcha con este directorio de datos (PID ${state.pid}).`,
      );
    }
    setAsideStale(path, state);
    (options.warn ?? writeWarning)(`Se sustituyó un bloqueo abandonado de server.lock: ${reason}.`);
  }
  throw new Error('No se pudo tomar el bloqueo del directorio de datos; vuelve a intentarlo.');
}

/** Renueva la fecha del bloqueo; el servidor la llama en sus tareas periódicas. */
export function refreshServerLock(dataDir: string): void {
  const time = new Date();
  utimesSync(join(dataDir, LOCK_FILE), time, time);
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
