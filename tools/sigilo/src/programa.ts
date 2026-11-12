// Despachador de subcomandos del CLI `sigilo`. Los módulos se cargan al usarse: los del nodo usan
// el código del servidor (solo está en la imagen del nodo) y los de la SESNA y los testigos, solo
// los paquetes compartidos y el enrutador.
import { resolve } from 'node:path';
import { withOutboundDefaults } from '@sigilo/red';
import type { FetchLike } from '@sigilo/red';
import {
  CliError,
  DEFAULT_TEMPLATES_DIR,
  createAnswers,
  createScreen,
  parseArgs,
  softwareVersion,
} from './base.ts';
import type { Context, Output } from './base.ts';

/** Lo que las pruebas pueden sustituir. */
export interface ProgramOverrides {
  base?: string;
  env?: NodeJS.ProcessEnv;
  output?: Output;
  fetch?: FetchLike;
  now?: () => Date;
  interactive?: boolean;
  templates?: string;
}

const NODE_HELP = `Uso: ./sigilo <comando>

  instalar               prepara el nodo (unas 10 preguntas) y deja la solicitud de alta
  iniciar                cuando la SESNA confirme: verifica el directorio y arranca el nodo
  diagnostico            revisa todo; sale con 0 (bien), 1 (avisos) o 2 (problemas)
  respaldar              respaldo cifrado (--verificar <archivo> para revisarlo)
  restaurar <archivo>    extrae un respaldo (--sobrescribir, con el nodo detenido)
  actualizar [versión]   respaldo, imagen nueva, diagnóstico y regreso si algo falla
  cuenta nueva           cuenta individual del panel con contraseña temporal
  cuenta reiniciar-mfa <usuario>  borra su segundo factor (lo inscribe de nuevo al entrar)
  tabla revisar|firmar   la tabla de funciones desde config/tabla-de-funciones.csv
  calendario revisar     días inhábiles locales desde config/dias-inhabiles.csv
  directorio actualizar  descarga la versión vigente del directorio (tarea diaria)
  rotar-llaves --enlace  nueva época de los secretos con la SESNA (--aplicar al confirmar)
  testigo crear-llave    (testigos) llave del testigo
  testigo cofirmar <p>   (testigos) cofirma una versión propuesta del directorio

Sin preguntas: cada respuesta va por bandera (--estado oaxaca) o variable (SIGILO_ESTADO).
`;

const SESNA_HELP = `Uso: ./sigilo-sesna <comando>

  instalar                       una vez: llaves de la operación, testigos y red.json
  aceptar <archivo>…             solicitud de alta, tabla de funciones, autoridad o rotación
  publicar <propuesta> [cofirmas] publica la versión cofirmada y deriva los secretos de enlace
  empaquetar                     la descarga del nodo para los estados (con red.json)
`;

type Handler = (ctx: Context) => Promise<number> | number;

async function nodeCommand(command: string, sub: string | undefined): Promise<Handler | null> {
  switch (command) {
    case 'instalar':
      return (await import('./nodo/instalar.ts')).install;
    case 'iniciar':
      return (await import('./nodo/iniciar.ts')).start;
    case 'directorio':
      return sub === 'actualizar' ? (await import('./nodo/iniciar.ts')).updateDirectory : null;
    case 'diagnostico':
      return (await import('./nodo/diagnostico.ts')).diagnose;
    case 'respaldar': {
      const module = await import('./nodo/respaldar.ts');
      return (ctx) => {
        const file = ctx.args.flags.get('verificar') === '1' ? ctx.args.positional[0] : undefined;
        if (ctx.args.flags.get('verificar') === '1' && file === undefined) {
          throw new CliError('Uso: ./sigilo respaldar --verificar <archivo>');
        }
        return file === undefined ? module.backup(ctx) : module.verifyBackup(ctx, file);
      };
    }
    case 'restaurar': {
      const module = await import('./nodo/respaldar.ts');
      return (ctx) => {
        const file = ctx.args.positional[0];
        if (file === undefined) throw new CliError('Uso: ./sigilo restaurar <archivo>');
        return module.restore(ctx, file);
      };
    }
    case 'cuenta': {
      const module = await import('./nodo/cuenta.ts');
      return sub === 'nueva'
        ? module.newAccount
        : sub === 'reiniciar-mfa'
          ? module.resetAccountMfa
          : null;
    }
    case 'tabla': {
      const module = await import('./nodo/tabla.ts');
      return sub === 'revisar' ? module.reviewTable : sub === 'firmar' ? module.signTable : null;
    }
    case 'calendario':
      return sub === 'revisar' ? (await import('./nodo/calendario.ts')).reviewCalendar : null;
    case 'rotar-llaves':
      return (await import('./nodo/enlace.ts')).rotateLink;
    case 'testigo': {
      const module = await import('./testigo/testigo.ts');
      return sub === 'crear-llave'
        ? module.createWitnessKey
        : sub === 'cofirmar'
          ? module.cosign
          : null;
    }
    case 'version':
      return (ctx) => {
        ctx.screen.line(ctx.version);
        return 0;
      };
    default:
      return null;
  }
}

async function sesnaCommand(command: string): Promise<Handler | null> {
  switch (command) {
    case 'instalar':
      return (await import('./sesna/instalar.ts')).installSesna;
    case 'aceptar':
      return (await import('./sesna/aceptar.ts')).accept;
    case 'publicar':
      return (await import('./sesna/publicar.ts')).publish;
    case 'empaquetar':
      return (await import('./sesna/empaquetar.ts')).buildPackage;
    default:
      return null;
  }
}

/**
 * Corre el CLI con los argumentos dados y devuelve el código de salida. `sesna` como primer
 * argumento elige los comandos de la SESNA (`sigilo-sesna`).
 */
export async function runProgram(
  argv: readonly string[],
  overrides: ProgramOverrides = {},
): Promise<number> {
  const env = overrides.env ?? process.env;
  const output: Output = overrides.output ?? { write: (text) => void process.stdout.write(text) };
  const screen = createScreen(output);
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    screen.line(error instanceof Error ? error.message : 'Argumentos inválidos.');
    return 64;
  }
  const isSesna = args.positional[0] === 'sesna';
  const positional = isSesna ? args.positional.slice(1) : args.positional;
  const [command = 'ayuda', sub] = positional;
  const answers = createAnswers({
    args,
    env,
    screen,
    interactive: overrides.interactive ?? process.stdin.isTTY === true,
  });
  // Los subcomandos de dos palabras reciben sus archivos como posicionales desde el tercero.
  const twoWords = new Set(['directorio', 'cuenta', 'tabla', 'calendario', 'testigo']);
  const ctx: Context = {
    base: resolve(overrides.base ?? (env.SIGILO_INSTALL_DIR || process.cwd())),
    args: {
      positional: !isSesna && twoWords.has(command) ? positional.slice(2) : positional.slice(1),
      flags: args.flags,
    },
    env,
    screen,
    answers,
    fetch: overrides.fetch ?? withOutboundDefaults((input, init) => fetch(input, init)),
    now: overrides.now ?? (() => new Date()),
    templates: overrides.templates ?? (env.SIGILO_PLANTILLAS_DIR || DEFAULT_TEMPLATES_DIR),
    version: softwareVersion(env),
  };
  try {
    const handler = isSesna ? await sesnaCommand(command) : await nodeCommand(command, sub);
    if (handler === null || args.flags.has('ayuda')) {
      screen.line(isSesna ? SESNA_HELP : NODE_HELP);
      return command === 'ayuda' || args.flags.has('ayuda') ? 0 : 64;
    }
    return await handler(ctx);
  } catch (error) {
    if (error instanceof CliError) {
      screen.line(`✗ ${error.message}`);
      return error.exitCode;
    }
    // Los demás errores son inesperados: se muestra el mensaje, que nunca lleva secretos.
    screen.line(`✗ Error inesperado: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    answers.close();
  }
}
