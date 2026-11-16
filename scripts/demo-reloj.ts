// Adelanta el reloj simulado de la red de demostración (`.red-demo/reloj/desfase`), el que leen los
// nodos, el índice y el enrutador en cada consulta: no hace falta reiniciar los contenedores. Sirve
// para mostrar pasos que esperan un plazo legal, como declarar firme una sentencia (vencidos los
// 15 días hábiles de la apelación, LGRA art. 206). Solo adelanta: regresar el reloj confundiría la
// bitácora, que ya publicó los días cerrados.
// Uso: npm run demo:reloj                 (muestra el día simulado)
//      npm run demo:reloj -- +16dh        (adelanta 16 días hábiles, con el calendario oficial)
//      npm run demo:reloj -- +22d         (adelanta 22 días naturales)
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { addBusinessDays, DEFAULT_BUSINESS_CALENDAR, toMexicoCentralDay } from '@sigilo/core';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = resolve(process.env.SIGILO_RED_DEMO_DIR || join(ROOT, '.red-demo'));
const CLOCK_FILE = join(OUT, 'reloj', 'desfase');
const DAY_MS = 86_400_000;
/** El mismo tope que acepta el nodo (`MAX_TEST_CLOCK_OFFSET_MS`, 400 días). */
const MAX_OFFSET_MS = 400 * DAY_MS;
const USAGE =
  'Uso: npm run demo:reloj [-- +<N>dh | +<N>d]\n' +
  '  +16dh  adelanta 16 días hábiles (calendario oficial de días inhábiles)\n' +
  '  +22d   adelanta 22 días naturales';

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readOffset(): number {
  if (!existsSync(CLOCK_FILE)) {
    fail(`No encuentro ${CLOCK_FILE}. Levanta primero la red con npm run demo:todo.`);
  }
  const text = readFileSync(CLOCK_FILE, 'utf8').trim();
  if (text === '') return 0;
  if (!/^\d{1,15}$/u.test(text)) fail('El archivo del reloj no tiene un entero de milisegundos.');
  return Number(text);
}

function simulatedDay(offsetMs: number): string {
  return toMexicoCentralDay(new Date(Date.now() + offsetMs));
}

function describe(offsetMs: number): string {
  const days = (offsetMs / DAY_MS).toFixed(1);
  return `Día simulado: ${simulatedDay(offsetMs)} (desfase de ${days} días sobre el reloj real).`;
}

const args = process.argv.slice(2);
const current = readOffset();
if (args.length === 0) {
  console.log(describe(current));
  process.exit(0);
}
const match = /^\+(\d{1,3})(dh|d)$/u.exec(args[0] ?? '');
if (match === null || args.length > 1) fail(USAGE);
const amount = Number(match[1]);
const isBusiness = match[2] === 'dh';
const today = simulatedDay(current);
const days = isBusiness
  ? Math.round(
      (Date.parse(`${addBusinessDays(today, amount, DEFAULT_BUSINESS_CALENDAR)}T00:00:00Z`) -
        Date.parse(`${today}T00:00:00Z`)) /
        DAY_MS,
    )
  : amount;
const next = current + days * DAY_MS;
if (next > MAX_OFFSET_MS) fail('El desfase pasaría de 400 días, el máximo que acepta el nodo.');
// Escritura atómica: el nodo nunca lee un archivo a medias (vacío equivaldría al reloj real).
const temporary = `${CLOCK_FILE}.tmp`;
writeFileSync(temporary, `${next}\n`, { mode: 0o600 });
renameSync(temporary, CLOCK_FILE);
console.log(
  `Reloj adelantado ${amount} días ${isBusiness ? 'hábiles' : 'naturales'} (${days} naturales).`,
);
console.log(describe(next));
console.log(
  'Los nodos lo leen en cada consulta: no hace falta reiniciarlos. Si el panel pide entrar de nuevo, la sesión venció con el salto; usa npm run demo:codigo para los códigos.',
);
