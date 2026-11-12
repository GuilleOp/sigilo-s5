// `sigilo iniciar` y `sigilo directorio actualizar`: descargan el directorio firmado de la
// ventanilla (o lo leen de `--directorio <archivo>`), lo verifican con la raíz de `red.json`,
// comprueban que el nodo aparece con SUS llaves y escriben `datos/directory.json`,
// `datos/network-trust.json`, `datos/web-config.json` y `datos/dias-inhabiles.json`. El envoltorio
// `sigilo` arranca después los contenedores.
import { existsSync, readFileSync } from 'node:fs';
import { NETWORK_ROUTES, SignedAuthorityDirectorySchema } from '@sigilo/contracts';
import type { KeysFile, SignedAuthorityDirectory, WebRuntimeConfig } from '@sigilo/contracts';
import { KeysFileSchema } from '@sigilo/contracts';
import {
  findNode,
  functionTableFor,
  nodeFingerprint,
  verifyFunctionTableSignature,
  verifySignedDirectory,
} from '@sigilo/red';
import { CliError, flag, readJson, todayOf, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { readRestDaysCsv } from './calendario.ts';
import { nodePaths, readInstallRecord, readLinkKey, readNetworkPackage } from './comun.ts';

/** Código de salida cuando el nodo todavía no está en el directorio. */
export const EXIT_NOT_PUBLISHED = 2;
/** Código de salida de `directorio actualizar` cuando no hubo cambios. */
export const EXIT_UNCHANGED = 3;

async function fetchDirectory(ctx: Context, ventanillaUrl: string): Promise<unknown> {
  const file = flag(ctx, 'directorio');
  if (file !== undefined) return readJson(file, 'el directorio');
  let response: Response;
  try {
    response = await ctx.fetch(`${ventanillaUrl}${NETWORK_ROUTES.directory}`, { method: 'GET' });
  } catch {
    throw new CliError(
      `No pude descargar el directorio de ${ventanillaUrl}. Revisa la salida a internet por el puerto 443 (o usa --directorio <archivo> con el que te envió la SESNA).`,
    );
  }
  if (!response.ok) {
    throw new CliError(`La ventanilla respondió ${response.status} al pedir el directorio.`);
  }
  try {
    return await response.json();
  } catch {
    throw new CliError('La ventanilla no respondió un directorio válido.');
  }
}

/** Resultado de revisar el directorio contra las llaves del nodo. */
interface DirectoryCheck {
  signed: SignedAuthorityDirectory;
  keys: KeysFile;
}

/**
 * Descarga y verifica el directorio y comprueba que el nodo aparece con sus llaves. Escribe en
 * pantalla lo que encuentra. Lanza `CliError` con código 2 si el nodo aún no aparece.
 */
export async function checkPublishedDirectory(ctx: Context): Promise<DirectoryCheck> {
  const { screen } = ctx;
  const paths = nodePaths(ctx);
  const record = readInstallRecord(ctx);
  const pkg = readNetworkPackage(paths.network);
  const keys = KeysFileSchema.parse(readJson(paths.keys, 'datos/keys.json'));
  const nodeBox = readJson(paths.nodeBoxKey, 'datos/red-node-key.json') as { boxKeyId?: string };
  const link = readLinkKey(paths.linkKey);
  screen.line('Buscando tu nodo en el directorio de la red…');
  const raw = await fetchDirectory(ctx, pkg.ventanillaUrl);
  const verification = verifySignedDirectory(raw, pkg.trust, { today: todayOf(ctx) });
  if (!verification.valid) {
    throw new CliError(
      `El directorio de la red no verifica (${verification.reason}). No arranques; avisa a la SESNA.`,
    );
  }
  const signed = SignedAuthorityDirectorySchema.parse(raw);
  const { directory } = signed;
  screen.ok(
    `Directorio versión ${directory.serial}, firmado por la SESNA y cofirmado por ${verification.witnesses.length} de ${pkg.trust.witnesses.length} testigos`,
  );
  const node = findNode(directory, record.nodeId);
  if (node === undefined) {
    throw new CliError(
      `Tu nodo todavía no está en el directorio (versión ${directory.serial}). Si la SESNA ya te confirmó, espera unos minutos y vuelve a intentarlo.`,
      EXIT_NOT_PUBLISHED,
    );
  }
  const isOwnNode =
    node.signingPublicKey === keys.publicKeys.server.signingPublicKey &&
    node.boxKeyId === nodeBox.boxKeyId;
  if (!isOwnNode) {
    throw new CliError(
      `${record.nodeId} aparece en el directorio con OTRAS llaves. No arranques; llama a la SESNA.`,
    );
  }
  screen.ok(
    `${record.nodeId} aparece con tus llaves (huella ${nodeFingerprint({ signingPublicKey: node.signingPublicKey, boxPublicKey: node.boxPublicKey, linkPublicKey: link.boxPublicKey })})`,
  );
  const inbox = directory.authorities.find((item) => item.id === record.buzonId);
  if (inbox === undefined || inbox.keyId !== keys.publicKeys.authority.keyId) {
    throw new CliError('El buzón general del directorio no tiene la llave de este nodo.');
  }
  const table = signed.directory.functionTables?.find(
    (item) => item.table.nodeId === record.nodeId,
  );
  if (
    table === undefined ||
    functionTableFor(directory, record.estado.code) === undefined ||
    !verifyFunctionTableSignature(table, node)
  ) {
    throw new CliError(
      'La tabla de funciones de tu entidad no está en el directorio con tu firma.',
    );
  }
  screen.ok(
    `Tabla de funciones de ${record.estado.name}, versión ${table.table.version}, con tu firma`,
  );
  return { signed, keys };
}

/** Escribe los archivos que el nodo lee al arrancar. */
function writeStartFiles(ctx: Context, check: DirectoryCheck): void {
  const paths = nodePaths(ctx);
  const pkg = readNetworkPackage(paths.network);
  writeJson(paths.directory, check.signed, 0o644);
  writeJson(paths.trust, pkg.trust, 0o644);
  // La web fija el serial mínimo que conoce (H10): una copia anterior del directorio no verifica.
  const webConfig: WebRuntimeConfig = {
    v: 1,
    pinnedKeys: check.keys.publicKeys,
    networkTrust: { ...pkg.trust, minDirectorySerial: check.signed.directory.serial },
    ventanillaUrl: pkg.ventanillaUrl,
  };
  writeJson(paths.webConfig, webConfig, 0o644);
  if (existsSync(paths.restDaysCsv)) {
    writeJson(paths.restDays, { v: 1, dias: readRestDaysCsv(paths.restDaysCsv) }, 0o644);
  }
}

/** `sigilo iniciar`: prepara los archivos de arranque. El envoltorio levanta los contenedores. */
export async function start(ctx: Context): Promise<number> {
  const check = await checkPublishedDirectory(ctx);
  writeStartFiles(ctx, check);
  ctx.screen.ok('datos/directory.json, datos/web-config.json y la raíz de la red, listos');
  ctx.screen.line('Arrancando el nodo y el certificado HTTPS…');
  return 0;
}

/**
 * `sigilo directorio actualizar` (la tarea diaria): exige un serial igual o mayor que el vigente.
 * Devuelve 0 si hubo una versión nueva (el envoltorio reinicia el nodo) y 3 si no cambió.
 */
export async function updateDirectory(ctx: Context): Promise<number> {
  const paths = nodePaths(ctx);
  const current = existsSync(paths.directory)
    ? SignedAuthorityDirectorySchema.safeParse(JSON.parse(readFileSync(paths.directory, 'utf8')))
    : null;
  const check = await checkPublishedDirectory(ctx);
  const currentSerial = current?.success === true ? current.data.directory.serial : 0;
  if (check.signed.directory.serial < currentSerial) {
    throw new CliError(
      `La ventanilla sirve la versión ${check.signed.directory.serial}, anterior a la tuya (${currentSerial}). No se cambia nada; avisa a la SESNA.`,
    );
  }
  if (current?.success === true && current.data.digest === check.signed.digest) {
    ctx.screen.ok(`Sin cambios: sigues en la versión ${currentSerial}.`);
    return EXIT_UNCHANGED;
  }
  writeStartFiles(ctx, check);
  ctx.screen.ok(`Directorio actualizado a la versión ${check.signed.directory.serial}.`);
  return 0;
}
