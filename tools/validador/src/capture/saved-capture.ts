// Captura guardada en disco (`--guardar-captura`): se escribe fuera del repositorio por omisión y
// con los valores de cookies y almacenamiento enmascarados, porque pueden ser sesiones o datos.
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { SavedCapture } from '../run.ts';

/** Sufijo de los archivos de captura (ignorado por git). */
export const CAPTURE_SUFFIX = '.captura.json';

/** Ruta por omisión: el directorio temporal del sistema, fuera del repositorio. */
export function defaultCapturePath(host: string, date: Date): string {
  const safeHost = host.replace(/[^a-zA-Z0-9.-]/g, '-');
  return join(tmpdir(), `sigilo-validar-${safeHost}-${date.getTime()}${CAPTURE_SUFFIX}`);
}

/** Sustituye un valor por puntos de la misma longitud (conserva la longitud para PRV-10). */
function mask(value: string): string {
  return '•'.repeat(value.length);
}

/** Enmascara el valor de una línea `Set-Cookie` y conserva el nombre y los atributos. */
export function maskSetCookie(line: string): string {
  const [pair = '', ...attributes] = line.split(';');
  const separator = pair.indexOf('=');
  const name = separator === -1 ? pair : pair.slice(0, separator);
  return [`${name}=[valor enmascarado]`, ...attributes].join(';');
}

/** Copia de la captura con cookies y almacenamiento enmascarados. */
export function maskCapture(saved: SavedCapture): SavedCapture {
  return {
    ...saved,
    capture: {
      ...saved.capture,
      pages: saved.capture.pages.map((page) => ({
        ...page,
        setCookies: page.setCookies.map(maskSetCookie),
        storage: page.storage.map((entry) => ({ ...entry, value: mask(entry.value) })),
      })),
    },
  };
}

/** Escribe la captura enmascarada y devuelve la ruta usada. */
export function writeSavedCapture(saved: SavedCapture, path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(maskCapture(saved))}\n`, { mode: 0o600 });
  return path;
}
