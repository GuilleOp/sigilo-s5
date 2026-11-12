// Código vigente del segundo factor (TOTP) de una cuenta sintética de la demostración, para entrar
// al panel sin teléfono durante la presentación. Lee el secreto de `credenciales.json` de la red
// de demostración (`.red-demo/nodos/<nodo>/`) o, con un solo nodo, de
// `apps/server/data/authority-demo-credentials.json`, y usa el reloj simulado de la red.
// Uso: npm run demo:codigo -- <usuario> [--nodo federal|queretaro|oaxaca] [--siguiente]
//      npm run demo:codigo -- --clave <Base32> (la clave que muestra una inscripción en vivo)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DemoCredential } from '../apps/server/src/security/demo-accounts.ts';
import {
  TOTP_PERIOD_SECONDS,
  fromBase32,
  hotp,
  totpStep,
} from '../apps/server/src/security/totp.ts';

const ROOT = resolve(import.meta.dirname, '..');
const RED_DEMO = resolve(process.env.SIGILO_RED_DEMO_DIR || join(ROOT, '.red-demo'));
const DATA_DIR = resolve(process.env.SIGILO_DATA_DIR || join(ROOT, 'apps/server/data'));

interface Source {
  label: string;
  credentials: DemoCredential[];
  /** Desfase del reloj simulado en milisegundos (0 con el reloj real). */
  offsetMs: number;
}

function readCredentials(path: string): DemoCredential[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { credenciales?: DemoCredential[] };
  return parsed.credenciales ?? [];
}

function readOffset(path: string): number {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf8').trim();
  return /^\d{1,15}$/u.test(text) ? Number(text) : 0;
}

/** Credenciales de cada nodo de la red de demostración y del nodo único de desarrollo. */
function sources(): Source[] {
  const found: Source[] = [];
  const nodes = join(RED_DEMO, 'nodos');
  if (existsSync(nodes)) {
    const offsetMs = readOffset(join(RED_DEMO, 'reloj', 'desfase'));
    for (const node of readdirSync(nodes).sort()) {
      const path = join(nodes, node, 'credenciales.json');
      if (existsSync(path))
        found.push({ label: node, credentials: readCredentials(path), offsetMs });
    }
  }
  const single = join(DATA_DIR, 'authority-demo-credentials.json');
  if (existsSync(single)) {
    // Con un solo nodo, el reloj de la demostración es el de SIGILO_TEST_CLOCK_FILE, si lo hay.
    const clock = process.env.SIGILO_TEST_CLOCK_FILE ?? '';
    found.push({
      label: 'nodo único',
      credentials: readCredentials(single),
      offsetMs: clock === '' ? 0 : readOffset(clock),
    });
  }
  return found;
}

const USAGE =
  'Uso: npm run demo:codigo -- <usuario> [--nodo federal|queretaro|oaxaca] [--siguiente]\n' +
  '     npm run demo:codigo -- --clave <clave Base32 que muestra la inscripción> [--nodo …]';

/** Valor de una bandera con argumento (`--nodo federal`), o `undefined`. */
function flagValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function print(label: string, secret: string, offsetMs: number, isNext: boolean): void {
  const now = Date.now() + offsetMs;
  const step = totpStep(now) + (isNext ? 1 : 0);
  const code = hotp(fromBase32(secret), step);
  const remaining = TOTP_PERIOD_SECONDS - (Math.floor(now / 1000) % TOTP_PERIOD_SECONDS);
  console.log(`Código de ${label}: ${code}`);
  console.log(
    isNext
      ? `Es el del siguiente paso: vale desde ya y hasta ${remaining + 2 * TOTP_PERIOD_SECONDS} s.`
      : `Cambia en ${remaining} s. Cada código sirve una sola vez: si ya lo usaste, espera el siguiente o usa --siguiente.`,
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const node = flagValue(args, '--nodo');
  const key = flagValue(args, '--clave');
  const isNext = args.includes('--siguiente');
  const valued = new Set([node, key].filter((value) => value !== undefined));
  const username = args.find((arg) => !arg.startsWith('--') && !valued.has(arg));
  const available = sources().filter((source) => node === undefined || source.label === node);
  // Con la clave de una inscripción en vivo (sin teléfono): el reloj del nodo elegido o el primero.
  if (key !== undefined) {
    print('la clave escrita', key.replace(/\s/gu, ''), available[0]?.offsetMs ?? 0, isNext);
    return;
  }
  if (username === undefined) throw new Error(USAGE);
  const matches = available.flatMap((source) =>
    source.credentials
      .filter((credential) => credential.username === username)
      .map((credential) => ({ source, credential })),
  );
  const match = matches[0];
  if (match === undefined) {
    throw new Error(
      `No hay credencial de demostración para «${username}». Genera la red con npm run red:demo o las cuentas con npm run accounts:generate.`,
    );
  }
  const { source, credential } = match;
  if (credential.mfaSecret === undefined) {
    throw new Error(
      credential.requireMfa === true
        ? `«${username}» inscribe su segundo factor al entrar: escanea el QR con tu app o usa npm run demo:codigo -- --clave <clave que muestra la pantalla>.`
        : `«${username}» entra sin segundo factor (SIGILO_MFA=opcional en la demostración).`,
    );
  }
  const where =
    matches.length > 1 ? ` (${source.label}; usa --nodo para elegir otro)` : ` (${source.label})`;
  print(`${username}${where}`, credential.mfaSecret, source.offsetMs, isNext);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo calcular el código.');
  process.exit(1);
}
