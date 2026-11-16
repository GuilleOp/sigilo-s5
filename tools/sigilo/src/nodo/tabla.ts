// `sigilo tabla revisar`, `sigilo tabla firmar` y `sigilo tabla exportar`: la tabla de funciones
// como hoja de cálculo (`config/tabla-de-funciones.csv`) y la competencia por dependencia, el
// órgano interno de control de cada ente (`config/competencia-por-dependencia.csv`). `revisar` la
// valida contra el directorio vigente, la muestra en lenguaje llano con los cambios respecto de la
// versión vigente; `firmar` sube la versión, la firma con la llave del nodo y deja el archivo para
// la SESNA (entra por `sigilo-sesna aceptar` y los testigos cofirman el directorio); `exportar`
// escribe los dos CSV desde la tabla vigente. Es la misma revisión que hace el panel de la operación.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import '@sigilo/contracts/entes';
import {
  entityAssignmentsOf,
  findEntity,
  functionRulesOf,
  KeysFileSchema,
  NODE_FUNCTIONS,
  SignedAuthorityDirectorySchema,
} from '@sigilo/contracts';
import type { AuthorityDirectory, FunctionTable } from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import {
  COMPETENCE_BADGE_LABELS,
  NODE_FUNCTION_LABELS,
  csvToEntities,
  entitiesToCsv,
  entityCompetence,
  functionTableDiff,
  functionTableProblems,
  holderName,
  signFunctionTable,
} from '@sigilo/red';
import type { FunctionTableUpdate } from '@sigilo/red';
import { CliError, readJson, todayOf, writeJson, writeText } from '../base.ts';
import type { Context } from '../base.ts';
import { nodePaths, readInstallRecord } from './comun.ts';
import { csvToTable, tableToCsv } from './tabla-csv.ts';

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

function entityName(entityId: string): string {
  return findEntity(entityId)?.name ?? entityId;
}

/** Tabla candidata, la vigente (si hay) y sus problemas. */
interface Candidate {
  table: FunctionTable | null;
  current: FunctionTable | null;
  problems: string[];
}

/**
 * Lee los CSV, arma la tabla con la versión siguiente y la valida contra el directorio. Sin
 * `competencia-por-dependencia.csv` conserva la competencia por dependencia vigente.
 */
function candidate(ctx: Context): Candidate {
  const record = readInstallRecord(ctx);
  const paths = nodePaths(ctx);
  if (!existsSync(paths.tableCsv)) throw new CliError('No existe config/tabla-de-funciones.csv.');
  const directory = currentDirectory(ctx);
  const current =
    directory?.functionTables?.find((item) => item.table.nodeId === record.nodeId)?.table ?? null;
  let entities = current?.entities;
  if (existsSync(paths.competenceCsv)) {
    const read = csvToEntities(readFileSync(paths.competenceCsv, 'utf8'));
    if (read.entities === null) {
      return {
        table: null,
        current,
        problems: read.problems.map((item) => `competencia-por-dependencia.csv, ${item}`),
      };
    }
    entities = read.entities;
  }
  const { table, problems } = csvToTable(readFileSync(paths.tableCsv, 'utf8'), {
    nodeId: record.nodeId,
    stateCode: record.estado.code,
    version: (current?.version ?? 0) + 1,
    issuedOn: todayOf(ctx),
    ...(entities === undefined ? {} : { entities }),
    ...(current?.settings === undefined ? {} : { settings: current.settings }),
  });
  if (table === null) return { table: null, current, problems };
  if (directory === null) {
    return {
      table,
      current,
      problems: ['Aún no hay directorio: corre ./sigilo iniciar después del alta.'],
    };
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
    current,
    problems: functionTableProblems({ ...directory, functionTables: [...others, signed] }),
  };
}

function describe(ctx: Context, table: FunctionTable, directory: AuthorityDirectory | null): void {
  for (const fn of NODE_FUNCTIONS) {
    const rules = functionRulesOf(table, fn);
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
      const identified = rule.requiresIdentifiedReporter === true ? ' (solo identificadas)' : '';
      ctx.screen.line(`    ${scope}${severity}${identified} → ${who}`);
    }
  }
  const entities = entityAssignmentsOf(table);
  if (entities.length > 0 && directory !== null) {
    const counts = { keys: 0, named: 0, pending: 0 };
    for (const item of entities) {
      const level = findEntity(item.entityId)?.level ?? 'estatal';
      counts[
        entityCompetence(directory, table, { id: item.entityId, level }, todayOf(ctx)).badge
      ] += 1;
    }
    ctx.screen.line(
      `  Competencia por dependencia: ${entities.length} entes · ${counts.keys} ${COMPETENCE_BADGE_LABELS.keys} · ${counts.named} ${COMPETENCE_BADGE_LABELS.named} · ${counts.pending} ${COMPETENCE_BADGE_LABELS.pending}`,
    );
  }
}

/** `sigilo tabla revisar`. Devuelve 0 si la tabla sirve y 2 si tiene problemas. */
export function reviewTable(ctx: Context): number {
  const { table, current, problems } = candidate(ctx);
  if (table === null || problems.length > 0) {
    for (const problem of problems) ctx.screen.fail(problem);
    return 2;
  }
  ctx.screen.ok(
    `Tabla de funciones válida (sería la versión ${table.version}, formato ${table.format}). Quién atiende en tu entidad:`,
  );
  const directory = currentDirectory(ctx);
  describe(ctx, table, directory);
  const changes = functionTableDiff(current, table, directory, entityName);
  ctx.screen.line(
    changes.length === 0
      ? 'Sin cambios respecto de la versión vigente.'
      : `Cambios respecto de la versión vigente (${changes.length}):`,
  );
  for (const change of changes) ctx.screen.line(`    ${change.text}`);
  ctx.screen.line('Si está bien: ./sigilo tabla firmar');
  return 0;
}

/** `sigilo tabla firmar`: firma la versión siguiente y la deja en salida/. */
export function signTable(ctx: Context): number {
  const record = readInstallRecord(ctx);
  const { table, problems } = candidate(ctx);
  if (table === null || problems.length > 0) {
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
    'Envíala a la SESNA. Entra al directorio con la siguiente versión cuando los testigos la cofirmen; después: ./sigilo directorio actualizar',
  );
  return 0;
}

/** `sigilo tabla exportar`: los dos CSV desde la tabla vigente del directorio. */
export function exportTable(ctx: Context): number {
  const record = readInstallRecord(ctx);
  const current = currentDirectory(ctx)?.functionTables?.find(
    (item) => item.table.nodeId === record.nodeId,
  )?.table;
  if (current === undefined) throw new CliError('El directorio no trae la tabla de tu nodo.');
  const paths = nodePaths(ctx);
  writeText(paths.tableCsv, tableToCsv(current), 0o644);
  writeText(paths.competenceCsv, entitiesToCsv(entityAssignmentsOf(current), entityName), 0o644);
  ctx.screen.ok(
    `Tabla versión ${current.version} → config/tabla-de-funciones.csv y config/competencia-por-dependencia.csv`,
  );
  return 0;
}
