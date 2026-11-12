// Piezas comunes del CLI `sigilo`: argumentos, salida en pantalla con ✓ ! ✗, preguntas con
// respuesta por bandera, variable de entorno o teclado, archivos con permisos y contexto inyectable
// (para las pruebas: carpeta, reloj, `fetch` y salida).
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { FetchLike } from '@sigilo/red';
import rootPackage from '../../../package.json' with { type: 'json' };

/** Error que el CLI muestra tal cual, con su código de salida. */
export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}

/** Argumentos ya separados: posicionales y banderas (`--clave valor`, `--clave=valor`, `--si`). */
export interface Args {
  positional: string[];
  flags: Map<string, string>;
}

/** Banderas que nunca llevan valor. */
const BOOLEAN_FLAGS = new Set([
  'si',
  'no-interactivo',
  'desde-cero',
  'enlace',
  'aplicar',
  'verificar',
  'sobrescribir',
  'sin-red',
  'acepto-testigos',
  'ayuda',
  'reemplazar',
  'acepto-huella-red',
]);

/** Separa los argumentos de la línea de comandos. Lanza error si una bandera no trae su valor. */
export function parseArgs(argv: readonly string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index] ?? '';
    if (!item.startsWith('--')) {
      positional.push(item);
      continue;
    }
    const [name = '', inline] = item.slice(2).split(/=(.*)/su);
    if (inline !== undefined) {
      flags.set(name, inline);
    } else if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, '1');
    } else {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new CliError(`Falta el valor de --${name}.`);
      }
      flags.set(name, value);
      index += 1;
    }
  }
  return { positional, flags };
}

/** Salida en pantalla. Las pruebas la capturan. */
export interface Output {
  write(text: string): void;
}

/** Salida con formato: títulos, ✓ (bien), ! (aviso) y ✗ (problema). */
export interface Screen {
  line(text?: string): void;
  title(text: string): void;
  ok(text: string): void;
  warn(text: string, fix?: string): void;
  fail(text: string, fix?: string): void;
  /** Avisos y problemas contados desde que se creó. */
  counts(): { warnings: number; problems: number };
  /** Todo lo escrito, sin secretos (para el archivo de diagnóstico). */
  transcript(): string;
}

/** Crea la salida con formato sobre `output`. */
export function createScreen(output: Output): Screen {
  let warnings = 0;
  let problems = 0;
  const lines: string[] = [];
  const emit = (text: string): void => {
    lines.push(text);
    output.write(`${text}\n`);
  };
  return {
    line: (text = '') => emit(text),
    title: (text) => emit(`\n${text}`),
    ok: (text) => emit(`  ✓ ${text}`),
    warn: (text, fix) => {
      warnings += 1;
      emit(`  ! ${text}`);
      if (fix !== undefined) emit(`    Qué hacer: ${fix}`);
    },
    fail: (text, fix) => {
      problems += 1;
      emit(`  ✗ ${text}`);
      if (fix !== undefined) emit(`    Qué hacer: ${fix}`);
    },
    counts: () => ({ warnings, problems }),
    transcript: () => `${lines.join('\n')}\n`,
  };
}

/** Pregunta con valor por omisión y validación. */
export interface Question {
  /** Clave de la respuesta: `--<clave>` o `SIGILO_<CLAVE>` (mayúsculas, guiones bajos). */
  key: string;
  text: string;
  default?: string;
  /** Devuelve el motivo si la respuesta no sirve, o `null`. */
  validate?: (value: string) => string | null;
}

/** Fuente de respuestas: banderas, entorno y, si hay terminal, el teclado. */
export interface Answers {
  ask(question: Question): Promise<string>;
  /** Pregunta sí o no; sin terminal usa la bandera o el valor por omisión. */
  confirm(key: string, text: string, defaultValue: boolean): Promise<boolean>;
  close(): void;
}

/** Nombre de la variable de entorno de una respuesta: `SIGILO_<CLAVE>`. */
export function envNameFor(key: string): string {
  return `SIGILO_${key.toUpperCase().replace(/-/gu, '_')}`;
}

/**
 * Crea la fuente de respuestas. Orden: bandera, variable de entorno, teclado (solo con terminal y
 * sin `--no-interactivo`) y valor por omisión. Una respuesta inválida por bandera o entorno es un
 * error; por teclado, se vuelve a preguntar con el motivo. Lanza error si falta una respuesta sin
 * valor por omisión y no hay teclado.
 */
export function createAnswers(options: {
  args: Args;
  env: NodeJS.ProcessEnv;
  screen: Screen;
  interactive: boolean;
}): Answers {
  const { args, env, screen } = options;
  const interactive = options.interactive && !args.flags.has('no-interactivo');
  let readline: ReturnType<typeof createInterface> | null = null;
  const prompt = async (text: string): Promise<string> => {
    readline ??= createInterface({ input: process.stdin, output: process.stdout });
    return (await readline.question(text)).trim();
  };
  const given = (key: string): string | undefined =>
    args.flags.get(key) ?? (env[envNameFor(key)] || undefined);
  return {
    async ask(question) {
      const preset = given(question.key);
      if (preset !== undefined) {
        const problem = question.validate?.(preset) ?? null;
        if (problem !== null) throw new CliError(`--${question.key}: ${problem}`);
        return preset;
      }
      if (!interactive) {
        if (question.default !== undefined) return question.default;
        throw new CliError(
          `Falta la respuesta «${question.text}»: usa --${question.key} o ${envNameFor(question.key)}.`,
        );
      }
      for (;;) {
        const suffix = question.default === undefined ? '' : ` [${question.default}]`;
        const value = (await prompt(`  ${question.text}${suffix}: `)) || question.default || '';
        const problem =
          value === '' ? 'Escribe una respuesta.' : (question.validate?.(value) ?? null);
        if (problem === null) return value;
        screen.line(`    ${problem}`);
      }
    },
    async confirm(key, text, defaultValue) {
      const preset = given(key);
      if (preset !== undefined) return /^(s|si|sí|1|true)$/iu.test(preset);
      if (!interactive) return defaultValue;
      const value = (await prompt(`  ${text} [${defaultValue ? 'S/n' : 's/N'}]: `)).toLowerCase();
      if (value === '') return defaultValue;
      return value === 's' || value === 'si' || value === 'sí';
    },
    close() {
      readline?.close();
      readline = null;
    },
  };
}

/** Contexto de cada comando. */
export interface Context {
  /** Carpeta de la instalación (en el contenedor, `/sigilo`). */
  base: string;
  args: Args;
  env: NodeJS.ProcessEnv;
  screen: Screen;
  answers: Answers;
  fetch: FetchLike;
  now: () => Date;
  /** Carpeta con las plantillas (`instalacion/` del repositorio o de la imagen). */
  templates: string;
  version: string;
}

const VERSION_PATTERN = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/u;

/** Versión del software: `SIGILO_VERSION` (la imagen la fija al construir) o la del repositorio. */
export function softwareVersion(env: NodeJS.ProcessEnv): string {
  const value = (env.SIGILO_VERSION ?? '').replace(/^v/u, '');
  return VERSION_PATTERN.test(value) ? value : rootPackage.version;
}

/** Carpeta de plantillas por omisión: `instalacion/` junto a `tools/`. */
export const DEFAULT_TEMPLATES_DIR = resolve(import.meta.dirname, '..', '..', '..', 'instalacion');

/** Ruta dentro de la instalación. */
export function inBase(ctx: Pick<Context, 'base'>, ...parts: string[]): string {
  return join(ctx.base, ...parts);
}

/** Crea una carpeta con permisos `mode` (0700 por omisión) si no existe. */
export function ensureDir(path: string, mode = 0o700): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode });
  chmodSync(path, mode);
}

/**
 * Escribe un archivo de forma atómica (temporal y renombrado) con permisos `mode` (0600 por
 * omisión). Seguridad: nunca queda a medias ni con permisos de más, aunque el umask sea 022.
 */
export function writeText(path: string, content: string | Uint8Array, mode = 0o600): void {
  const directory = dirname(path);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, content, { mode });
  chmodSync(temporary, mode);
  renameSync(temporary, path);
}

/** Escribe JSON con dos espacios de sangría. */
export function writeJson(path: string, value: unknown, mode = 0o600): void {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`, mode);
}

/** Lee JSON. Lanza `CliError` con `what` si no existe o no se puede leer. */
export function readJson(path: string, what: string): unknown {
  if (!existsSync(path)) throw new CliError(`No encuentro ${what} (${path}).`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new CliError(`No se pudo leer ${what} (${path}).`);
  }
}

/** Día de hoy en UTC (`AAAA-MM-DD`). */
export function todayOf(ctx: Pick<Context, 'now'>): string {
  return ctx.now().toISOString().slice(0, 10);
}

/** Bandera de texto, o `undefined`. */
export function flag(ctx: Pick<Context, 'args'>, name: string): string | undefined {
  return ctx.args.flags.get(name);
}

/** Bandera booleana. */
export function hasFlag(ctx: Pick<Context, 'args'>, name: string): boolean {
  return ctx.args.flags.get(name) === '1';
}

/** Quita acentos y deja minúsculas, dígitos y guiones (para identificadores). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
}
