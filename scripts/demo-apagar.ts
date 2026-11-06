// Baja la red de demostración de Docker y limpia lo que dejó: contenedores y red de compose y,
// salvo `--conservar-datos`, la carpeta `.red-demo/` (llaves, cuentas, bases y semilla, todas
// sintéticas; npm run demo:todo las vuelve a generar). Con `--imagenes` borra también las imágenes
// construidas. Es idempotente: si no hay nada en marcha, no falla.
// Uso: npm run demo:apagar [-- --conservar-datos] [-- --imagenes]
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RED_DEMO_DIR = join(ROOT, '.red-demo');

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function main(): void {
  const keepData = process.argv.includes('--conservar-datos');
  const removeImages = process.argv.includes('--imagenes');
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  // El mismo usuario con el que se levantó, para que compose interprete igual el archivo.
  const env = {
    ...process.env,
    SIGILO_UID: String(uid === undefined || uid === 0 ? 1000 : uid),
    SIGILO_GID: String(gid === undefined || gid === 0 ? 1000 : gid),
  };

  say('Paso 1. Bajar contenedores y red de la demostración (docker compose down).');
  const args = ['compose', 'down', '--remove-orphans', ...(removeImages ? ['--rmi', 'all'] : [])];
  const down = spawnSync('docker', args, { cwd: ROOT, env, stdio: 'inherit' });
  if (down.error !== undefined || down.status !== 0) {
    process.stderr.write(
      'docker compose down falló. Si Docker no está en marcha, no hay contenedores que bajar; sigue con la limpieza.\n',
    );
  }
  if (removeImages) say('  También se borraron las imágenes sigilo/*:local.');

  if (keepData) {
    say('Paso 2. Se conserva .red-demo/ (--conservar-datos): llaves, cuentas y bases sintéticas.');
  } else if (existsSync(RED_DEMO_DIR)) {
    say('Paso 2. Borrar .red-demo/ (llaves, cuentas, bases y semilla sintéticas).');
    rmSync(RED_DEMO_DIR, { recursive: true, force: true });
  } else {
    say('Paso 2. No hay .red-demo/ que borrar.');
  }
  say('Listo. Para volver a levantarla: npm run demo:todo');
}

main();
