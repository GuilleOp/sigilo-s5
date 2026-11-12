// Levanta la demostración completa con Docker en un solo comando y explica cada paso: revisa
// requisitos (Node, Docker y Compose, puertos libres), baja una red anterior, genera llaves y
// cuentas sintéticas en `.red-demo/` (red:demo), construye las imágenes, levanta la red, espera a que
// todos los servicios estén sanos y siembra el escenario hasta el día 35 (demo:seed).
// Es idempotente: cada ejecución parte de cero y deja el mismo estado. Todo es sintético y local.
// Uso: npm run demo:todo [-- --hasta <día>] [-- --sin-semilla]. Para bajarla: npm run demo:apagar.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

/**
 * Puertos que publica `compose.yaml` en 127.0.0.1. El evaluador y el índice ya no se publican
 * (H16): solo los usan el enrutador y los nodos por la red interna.
 */
const PORTS = [8781, 8782, 8783, 8790];

/** Lo que se comprueba por HTTP después de que Docker reporta los servicios sanos. */
const ENDPOINTS = [
  { name: 'Ventanilla única (SESNA)', url: 'http://127.0.0.1:8790/' },
  { name: 'Enrutador (directorio firmado)', url: 'http://127.0.0.1:8790/api/v1/red/directory' },
  // El enrutador hace el primer corte al arrancar y lo rehace en cada vuelta (cada minuto).
  {
    name: 'Enrutador (corte nacional de datos abiertos)',
    url: 'http://127.0.0.1:8790/api/v1/red/national/open-data',
  },
  { name: 'Nodo Querétaro (panel)', url: 'http://127.0.0.1:8781/autoridad' },
  { name: 'Nodo Querétaro (API)', url: 'http://127.0.0.1:8781/api/v1/keys' },
  { name: 'Nodo Federal (panel)', url: 'http://127.0.0.1:8782/autoridad' },
  { name: 'Nodo Federal (API)', url: 'http://127.0.0.1:8782/api/v1/keys' },
  { name: 'Nodo Oaxaca (panel)', url: 'http://127.0.0.1:8783/autoridad' },
  { name: 'Nodo Oaxaca (API)', url: 'http://127.0.0.1:8783/api/v1/keys' },
  // El evaluador, por el paso de la ventanilla (sin puerto propio en el equipo). El índice no tiene
  // puerto ni rutas públicas: lo cubre su verificación de salud en Docker.
  {
    name: 'Evaluador OPRF (por la ventanilla)',
    url: 'http://127.0.0.1:8790/api/v1/corroboracion/evaluador/reto',
  },
];

/** Servicios con verificación de salud en la imagen (los testigos no publican puerto). */
const HEALTHY_SERVICES = [
  'enrutador',
  'nodo-queretaro',
  'nodo-federal',
  'nodo-oaxaca',
  'evaluador',
  'indice',
];

const MIN_NODE = [22, 18];
const MIN_COMPOSE = [2, 17];
const WAIT_TIMEOUT_SECONDS = 240;
const DOCKER_START_TIMEOUT_MS = 180_000;

interface Options {
  until: string | null;
  seed: boolean;
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`\nNo se pudo levantar la demostración: ${message}\n`);
  process.exit(1);
}

function parseOptions(argv: readonly string[]): Options {
  const index = argv.indexOf('--hasta');
  const until = index === -1 ? null : (argv[index + 1] ?? '');
  if (until !== null && !/^\d{1,2}$/u.test(until)) {
    fail('--hasta debe ir seguido de un día del escenario (de 0 a 35).');
  }
  return { until, seed: !argv.includes('--sin-semilla') };
}

/** Usuario de los contenedores: el dueño de `.red-demo/` (ver `compose.yaml`). */
function containerUser(): { uid: string; gid: string } {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid === 0) {
    fail(
      'no ejecutes la demostración como root. Usa tu usuario normal (en Linux, agrégalo al grupo docker o usa Docker sin root).',
    );
  }
  return { uid: String(uid ?? 1000), gid: String(gid ?? 1000) };
}

function run(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  quiet = false,
): SpawnSyncReturns<string> {
  return spawnSync(command, args, {
    cwd: ROOT,
    env,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
  });
}

function atLeast(version: string, minimum: readonly number[]): boolean {
  const parts = version.replace(/^v/u, '').split('.').map(Number);
  for (let i = 0; i < minimum.length; i += 1) {
    const part = parts[i] ?? 0;
    const min = minimum[i] ?? 0;
    if (part !== min) return part > min;
  }
  return true;
}

function dockerServerVersion(): string | null {
  const result = run('docker', ['version', '--format', '{{.Server.Version}}'], process.env, true);
  if (result.error !== undefined || result.status !== 0) return null;
  return result.stdout.trim() || null;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Comprueba Docker; en macOS intenta abrir Docker Desktop y espera a que responda. */
function ensureDocker(): string {
  const which = run('docker', ['--version'], process.env, true);
  if (which.error !== undefined || which.status !== 0) {
    fail(
      'no se encontró el comando docker. Instala Docker Desktop (macOS o Windows) o Docker Engine con el complemento compose (Linux).',
    );
  }
  let version = dockerServerVersion();
  if (version === null && process.platform === 'darwin') {
    say('  Docker no responde; abriendo Docker Desktop (open -a Docker) y esperando…');
    run('open', ['-a', 'Docker'], process.env, true);
    const deadline = Date.now() + DOCKER_START_TIMEOUT_MS;
    while (version === null && Date.now() < deadline) {
      sleep(3000);
      version = dockerServerVersion();
    }
  }
  if (version === null) {
    fail(
      process.platform === 'linux'
        ? 'el servicio de Docker no responde. Arráncalo (por ejemplo, sudo systemctl start docker) y revisa que tu usuario pueda usarlo (docker version).'
        : 'Docker no responde. Abre Docker Desktop, espera a que diga que está en marcha y vuelve a intentarlo.',
    );
  }
  return version;
}

function ensureCompose(): string {
  const result = run('docker', ['compose', 'version', '--short'], process.env, true);
  const version = result.status === 0 ? result.stdout.trim() : '';
  if (version === '') {
    fail('falta Docker Compose v2 (el subcomando docker compose). Actualiza Docker.');
  }
  if (!atLeast(version, MIN_COMPOSE)) {
    fail(`Docker Compose ${version} es muy antiguo; se necesita 2.17 o posterior.`);
  }
  return version;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const server = createServer();
    server.once('error', () => done(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => done(true));
    });
  });
}

async function waitForEndpoints(): Promise<void> {
  for (const endpoint of ENDPOINTS) {
    const isUp = (status: number): boolean => status === 200;
    let status = 0;
    for (let attempt = 0; attempt < 30 && !isUp(status); attempt += 1) {
      try {
        status = (await fetch(endpoint.url)).status;
      } catch {
        status = 0;
      }
      if (!isUp(status)) sleep(1000);
    }
    if (!isUp(status)) fail(`${endpoint.name} no responde en ${endpoint.url}.`);
    say(`  ✓ ${endpoint.name}: ${endpoint.url}`);
  }
}

interface ComposeService {
  Service: string;
  State: string;
  Health: string;
}

function serviceStates(env: NodeJS.ProcessEnv): ComposeService[] {
  const result = run('docker', ['compose', 'ps', '--all', '--format', 'json'], env, true);
  if (result.status !== 0) return [];
  // Compose escribe un objeto JSON por línea.
  return result.stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ComposeService);
}

function showFailure(env: NodeJS.ProcessEnv): void {
  const broken = serviceStates(env).filter(
    (item) => item.State !== 'running' || (item.Health !== '' && item.Health !== 'healthy'),
  );
  for (const item of broken) {
    say(`\n--- Últimas líneas de ${item.Service} (${item.State} ${item.Health}) ---`);
    run('docker', ['compose', 'logs', '--tail', '20', item.Service], env);
  }
  say('\nSoluciones frecuentes en docs/demo.md, sección «Problemas comunes».');
}

function elapsed(start: number): string {
  return `${Math.round((Date.now() - start) / 1000)} s`;
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const total = Date.now();
  if (process.env.SIGILO_RED_DEMO_DIR !== undefined && process.env.SIGILO_RED_DEMO_DIR !== '') {
    fail(
      'quita SIGILO_RED_DEMO_DIR: compose.yaml usa siempre la carpeta .red-demo/ del repositorio.',
    );
  }

  say('Paso 1 de 6. Requisitos: Node, Docker, Docker Compose y puertos libres.');
  if (!atLeast(process.versions.node, MIN_NODE)) {
    fail(`Node ${process.versions.node} es muy antiguo; se necesita 22.18 o posterior.`);
  }
  const user = containerUser();
  const env = { ...process.env, SIGILO_UID: user.uid, SIGILO_GID: user.gid };
  const docker = ensureDocker();
  const compose = ensureCompose();
  say(`  Node ${process.versions.node} · Docker ${docker} · Compose ${compose}.`);
  say(`  Los contenedores correrán con tu UID ${user.uid} y GID ${user.gid} (nunca como root).`);

  say('\nPaso 2 de 6. Bajar una red anterior de la demostración, si la hay (docker compose down).');
  let step = Date.now();
  if (run('docker', ['compose', 'down', '--remove-orphans'], env).status !== 0) {
    fail('docker compose down falló.');
  }
  const busy: number[] = [];
  for (const port of PORTS) if (!(await isPortFree(port))) busy.push(port);
  if (busy.length > 0) {
    fail(
      `los puertos ${busy.join(', ')} de 127.0.0.1 están ocupados por otro programa. Detenlo (lsof -i :${busy[0]} lo muestra) y vuelve a intentarlo.`,
    );
  }
  say(`  Listo en ${elapsed(step)}.`);

  say('\nPaso 3 de 6. Generar llaves, directorio firmado y cuentas sintéticas en .red-demo/.');
  say('  Se borra la red anterior: cada ejecución parte de cero con llaves nuevas.');
  step = Date.now();
  if (run(process.execPath, ['scripts/red-demo.ts', '--force']).status !== 0) {
    fail('npm run red:demo falló.');
  }
  say(`  Listo en ${elapsed(step)}.`);

  say('\nPaso 4 de 6. Construir las imágenes (la primera vez descarga Node 22 y dependencias).');
  say(
    '  La ventanilla (con el enrutador) fija la raíz de la red; el panel de cada nodo, sus llaves',
  );
  say('  públicas. Ninguna llave privada entra a las imágenes.');
  step = Date.now();
  if (run('docker', ['compose', 'build'], env).status !== 0) {
    fail('docker compose build falló. Revisa la conexión a internet (descarga node:22 y npm).');
  }
  say(`  Listo en ${elapsed(step)}.`);

  say('\nPaso 5 de 6. Levantar la red y esperar a que todos los servicios estén sanos.');
  step = Date.now();
  const up = run(
    'docker',
    ['compose', 'up', '-d', '--wait', '--wait-timeout', String(WAIT_TIMEOUT_SECONDS)],
    env,
  );
  if (up.status !== 0) {
    showFailure(env);
    fail('algún servicio no quedó sano.');
  }
  const states = serviceStates(env);
  for (const name of HEALTHY_SERVICES) {
    const item = states.find((candidate) => candidate.Service === name);
    if (item?.Health !== 'healthy') {
      showFailure(env);
      fail(`${name} no está sano (${item?.Health ?? 'no existe'}).`);
    }
  }
  await waitForEndpoints();
  say(`  Red sana en ${elapsed(step)}.`);

  if (options.seed) {
    const until = options.until ?? '35';
    say(`\nPaso 6 de 6. Sembrar el escenario hasta el día ${until} (adelanta el reloj simulado).`);
    step = Date.now();
    const args = ['scripts/demo-seed.ts', ...(options.until === null ? [] : ['--hasta', until])];
    if (run(process.execPath, args).status !== 0) {
      showFailure(env);
      fail('npm run demo:seed falló.');
    }
    say(`  Listo en ${elapsed(step)}.`);
  } else {
    say('\nPaso 6 de 6. Sin semilla (--sin-semilla): la red queda vacía, en el día 0.');
  }

  say(`\nDemostración lista en ${elapsed(total)}. Todo es sintético y corre solo en este equipo.`);
  say('  Ventanilla única:     http://127.0.0.1:8790/ (la sirve la SESNA con el enrutador)');
  say('  Paneles de los nodos: Querétaro http://127.0.0.1:8781/autoridad');
  say('                        Federal http://127.0.0.1:8782/autoridad');
  say('                        Oaxaca http://127.0.0.1:8783/autoridad');
  say('  Cuentas del panel:    .red-demo/nodos/<nodo>/credenciales.json');
  say('  Llave del panel:      .red-demo/autoridades/<id>.json (la de la autoridad de la cuenta)');
  say('  Llave del buzón:      .red-demo/nodos/<nodo>/data/authority-demo-key.json');
  say('  Folios y recibos:     .red-demo/semilla.json');
  say('  Corte nacional:       http://127.0.0.1:8790/api/v1/red/national/open-data (cada minuto)');
  say('  Guion: docs/demo.md. Para bajarla y limpiar: npm run demo:apagar');
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : 'error inesperado.');
});
