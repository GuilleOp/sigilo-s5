// Reinicia la demostración: borra la base y las pruebas del directorio de datos y conserva las
// llaves (`keys.json` y `authority-demo-key.json`).
// Uso: npm run demo:reset -- --yes (o con el marcador `.sigilo-demo` en el directorio de datos).
// Se niega si el servidor está en marcha (bloqueo del directorio de datos o puerto ocupado).
import { existsSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { isPortInUse, lockHolder } from '../apps/server/src/server-lock.ts';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const PORT = Number(process.env.SIGILO_PORT || 8787);
const TARGETS = ['sigilo.db', 'sigilo.db-wal', 'sigilo.db-shm', 'evidence'];

/** Archivo que marca un directorio de datos como de demostración (permite omitir `--yes`). */
const DEMO_MARKER = '.sigilo-demo';

function displayPath(path: string): string {
  const relativePath = relative(process.cwd(), path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

async function main(): Promise<void> {
  const where = displayPath(DATA_DIR);
  // Seguridad: borrar la base es irreversible; se exige una confirmación explícita.
  const isConfirmed = process.argv.includes('--yes') || existsSync(join(DATA_DIR, DEMO_MARKER));
  if (!isConfirmed) {
    throw new Error(
      `Esto borra la base y las pruebas de ${where}. Confírmalo con npm run demo:reset -- --yes o crea el marcador ${DEMO_MARKER} en ese directorio.`,
    );
  }
  const holder = lockHolder(DATA_DIR);
  if (holder !== null) {
    throw new Error(`El servidor está en marcha (PID ${holder}); detenlo antes de reiniciar.`);
  }
  if (Number.isInteger(PORT) && (await isPortInUse(PORT))) {
    throw new Error(`Hay un servidor escuchando en el puerto ${PORT}; detenlo antes de reiniciar.`);
  }
  const removed = TARGETS.map((name) => join(DATA_DIR, name)).filter((path) => existsSync(path));
  for (const path of removed) rmSync(path, { recursive: true, force: true });
  console.log(
    removed.length === 0
      ? `No había datos de demostración en ${where}.`
      : `Se borraron la base y las pruebas de ${where}; las llaves se conservan.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'No se pudo reiniciar la demostración.');
  process.exit(1);
});
