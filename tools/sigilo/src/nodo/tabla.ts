// `sigilo tabla revisar` y `sigilo tabla firmar`: la tabla de funciones como hoja de cálculo
// (`config/tabla-de-funciones.csv`). `revisar` la valida contra el directorio vigente y la muestra
// en lenguaje llano; `firmar` sube la versión, la firma con la llave del nodo y deja el archivo
// para la SESNA (entra por `sigilo-sesna aceptar`).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KeysFileSchema, NODE_FUNCTIONS, SignedAuthorityDirectorySchema } from '@sigilo/contracts';
import type { AuthorityDirectory, FunctionTable } from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import {
  NODE_FUNCTION_LABELS,
  functionTableProblems,
  holderName,
  signFunctionTable,
} from '@sigilo/red';
import type { FunctionTableUpdate } from '@sigilo/red';
import { CliError, readJson, todayOf, writeJson } from '../base.ts';
import type { Context } from '../base.ts';
import { nodePaths, readInstallRecord } from './comun.ts';
import { csvToTable } from './tabla-csv.ts';

function currentDirectory(ctx: Context): AuthorityDirectory | null {
  const path = nodePaths(ctx).directory;
  return existsSync(path)
    ? SignedAuthorityDirectorySchema.parse(readJson(path, 'datos/directory.json')).directory
    : null;
}

function nodeSigningKey(ctx: Context): Uint8Array {
  const keys = KeysFileSchema.parse(readJson(nodePaths(ctx).keys, 'datos/keys.json'));
  return fromBase64Url(keys.server.signingPrivateKey);
}

/** Lee el CSV, arma la tabla con la versión siguiente y la valida contra el directorio. */
function candidate(ctx: Context): { table: FunctionTable; problems: string[] } {
  const record = readInstallRecord(ctx);
  const paths = nodePaths(ctx);
  if (!existsSync(paths.tableCsv)) throw new CliError('No existe config/tabla-de-funciones.csv.');
  const directory = currentDirectory(ctx);
  const current = directory?.functionTables?.find((item) => item.table.nodeId === record.nodeId);
  const { table, problems } = csvToTable(readFileSync(paths.tableCsv, 'utf8'), {
    nodeId: record.nodeId,
    stateCode: record.estado.code,
    version: (current?.table.version ?? 0) + 1,
    issuedOn: todayOf(ctx),
  });
  if (table === null) return { table: null as unknown as FunctionTable, problems };
  if (directory === null) {
    return { table, problems: ['Aún no hay directorio: corre ./sigilo iniciar después del alta.'] };
  }
  // La misma revisión que hará la SESNA: el directorio con esta tabla en lugar de la vigente.
  const key = nodeSigningKey(ctx);
  const signed = signFunctionTable(table, key);
  key.fill(0);
  const others = (directory.functionTables ?? []).filter(
    (item) => item.table.nodeId !== record.nodeId,
  );
  return {
    table,
    problems: functionTableProblems({ ...directory, functionTables: [...others, signed] }),
  };
}

function describe(ctx: Context, table: FunctionTable, directory: AuthorityDirectory | null): void {
  for (const fn of NODE_FUNCTIONS) {
    const rules = table.functions[fn];
    if (rules.length === 0) continue;
    ctx.screen.line(`  ${NODE_FUNCTION_LABELS[fn]}`);
    for (const rule of rules) {
      const who =
        directory === null ? JSON.stringify(rule.holder) : holderName(directory, rule.holder);
      const scope =
        rule.entityIds.length === 0
          ? `entes ${rule.governmentLevels.join(' y ')}`
          : rule.entityIds.join(', ');
      const severity =
        rule.severity === undefined
          ? ''
          : rule.severity === 'serious'
            ? ' (faltas graves)'
            : ' (faltas no graves)';
      ctx.screen.line(`    ${scope}${severity} → ${who}`);
    }
  }
}

/** `sigilo tabla revisar`. Devuelve 0 si la tabla sirve y 2 si tiene problemas. */
export function reviewTable(ctx: Context): number {
  const { table, problems } = candidate(ctx);
  if (problems.length > 0) {
    for (const problem of problems) ctx.screen.fail(problem);
    return 2;
  }
  ctx.screen.ok(
    `Tabla de funciones válida (sería la versión ${table.version}). Quién atiende en tu entidad:`,
  );
  describe(ctx, table, currentDirectory(ctx));
  ctx.screen.line('Si está bien: ./sigilo tabla firmar');
  return 0;
}

/** `sigilo tabla firmar`: firma la versión siguiente y la deja en salida/. */
export function signTable(ctx: Context): number {
  const record = readInstallRecord(ctx);
  const { table, problems } = candidate(ctx);
  if (problems.length > 0) {
    for (const problem of problems) ctx.screen.fail(problem);
    throw new CliError('La tabla tiene problemas; corrígelos y vuelve a intentarlo.', 2);
  }
  const key = nodeSigningKey(ctx);
  const update: FunctionTableUpdate = {
    tipo: 'sigilo/tabla-de-funciones',
    v: 1,
    tabla: signFunctionTable(table, key),
  };
  key.fill(0);
  const name = `tabla-de-funciones-${record.slug}-v${table.version}.json`;
  writeJson(join(nodePaths(ctx).output, name), update, 0o644);
  ctx.screen.ok(`Tabla versión ${table.version} firmada → salida/${name}`);
  ctx.screen.line(
    'Envíala a la SESNA. Entra al directorio con la siguiente versión; después: ./sigilo directorio actualizar',
  );
  return 0;
}
