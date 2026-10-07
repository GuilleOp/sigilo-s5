// Reinicia la demostración: borra la base y las pruebas del directorio de datos y conserva las
// llaves (`keys.json` y `authority-demo-key.json`). Detén el servidor antes de ejecutarlo.
// Uso: npm run demo:reset
import { existsSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));
const TARGETS = ['sigilo.db', 'sigilo.db-wal', 'sigilo.db-shm', 'evidence'];

function main(): void {
  const removed = TARGETS.map((name) => join(DATA_DIR, name)).filter((path) => existsSync(path));
  for (const path of removed) rmSync(path, { recursive: true, force: true });
  const relativeDir = relative(process.cwd(), DATA_DIR);
  const where = relativeDir === '' || relativeDir.startsWith('..') ? DATA_DIR : relativeDir;
  console.log(
    removed.length === 0
      ? `No había datos de demostración en ${where}.`
      : `Se borraron la base y las pruebas de ${where}; las llaves se conservan.`,
  );
}

main();
