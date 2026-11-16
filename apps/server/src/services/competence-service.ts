// Competencia por dependencia (pantalla de la cuenta de operación del nodo): lista cada dependencia
// de la entidad del nodo (o los entes federales, en el nodo federal) del catálogo de la PDN con
// quién la investiga, y firma con la llave del nodo una versión nueva de su tabla de funciones con
// el órgano interno de control de cada ente. La versión firmada se entrega a la SESNA y entra al
// directorio cuando los testigos lo cofirman, igual que con `sigilo tabla firmar`.
// Seguridad: la cuenta de operación no ve denuncias; aquí solo hay catálogos y la tabla pública.
import {
  entityAssignmentsOf,
  functionRulesOf,
  MUNICIPALITIES,
  NODE_FUNCTIONS,
  PUBLIC_ENTITIES,
} from '@sigilo/contracts';
import type {
  CompetenceSaveRequest,
  CompetenceSaveResponse,
  CompetenceView,
  EntityCompetenceView,
  FunctionTable,
  PublicEntityOption,
} from '@sigilo/contracts';
import { REAL_ENTITIES } from '@sigilo/contracts/entes';
import { randomBytes, toDayDate, toHex } from '@sigilo/core';
import {
  competenceCoverage,
  entityCompetence,
  entityGroupOf,
  functionTableDiff,
  functionTableProblems,
  isAuthorityValidOn,
  nextTableWithEntities,
  oicCandidates,
  signFunctionTable,
  verifyFunctionTableSignature,
} from '@sigilo/red';
import type { AppContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { ownNode } from '../network/network-context.ts';
import type { NodeNetwork } from '../network/network-context.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';

/** Versiones firmadas que se muestran en el panel. */
const PROPOSALS_SHOWN = 10;

/** Red y tabla vigente del nodo; sin red o sin tabla, la pantalla no existe (`not_found`). */
function currentTable(ctx: AppContext): { network: NodeNetwork; table: FunctionTable } {
  const network = ctx.deps.network;
  if (network === undefined) throw new ApiFailure('not_found');
  const table = network.directory.functionTables?.find(
    (item) => item.table.nodeId === network.nodeId,
  )?.table;
  if (table === undefined) throw new ApiFailure('not_found');
  return { network, table };
}

/** Entes que nombra la tabla (también los ficticios de la demostración). */
function mentionedEntityIds(table: FunctionTable): Set<string> {
  return new Set([
    ...entityAssignmentsOf(table).map((item) => item.entityId),
    ...NODE_FUNCTIONS.flatMap((fn) => functionRulesOf(table, fn).flatMap((rule) => rule.entityIds)),
  ]);
}

/**
 * Dependencias de la tabla: los entes del catálogo de la PDN de su entidad (los federales, `00`, en
 * la tabla federal) y los ficticios de la demostración que la tabla nombra.
 */
export function entitiesOfTable(table: FunctionTable): PublicEntityOption[] {
  const code = table.stateCode ?? '00';
  const mentioned = mentionedEntityIds(table);
  const fictitious = PUBLIC_ENTITIES.filter(
    (entity) => entity.isFictitious === true && mentioned.has(entity.id),
  );
  return [...REAL_ENTITIES.filter((entity) => entity.stateCode === code), ...fictitious];
}

function municipalityName(stateCode: string | null): (code: string) => string | undefined {
  return (code) =>
    MUNICIPALITIES.find((item) => item.stateCode === stateCode && item.code === code)?.name;
}

/** Vista de la pantalla «Competencia por dependencia». */
export function competenceView(ctx: AppContext): CompetenceView {
  const { network, table } = currentTable(ctx);
  const { directory } = network;
  const today = toDayDate(ctx.deps.now());
  const entities = entitiesOfTable(table);
  const nameOfTown = municipalityName(table.stateCode);
  const views: EntityCompetenceView[] = entities.map((entity) => {
    const competence = entityCompetence(directory, table, entity, today);
    const assignment = entityAssignmentsOf(table).find((item) => item.entityId === entity.id);
    return {
      entityId: entity.id,
      name: entity.name,
      level: entity.level,
      ...(entity.municipalityCode === undefined
        ? {}
        : { municipalityCode: entity.municipalityCode }),
      isFictitious: entity.isFictitious === true,
      group: entityGroupOf(entity, nameOfTown),
      status: competence.status,
      source: competence.source,
      holder: competence.holder,
      holderName: competence.holderName,
      legalBasis: competence.legalBasis,
      requiresIdentifiedReporter: assignment?.requiresIdentifiedReporter === true,
      badge: competence.badge,
    };
  });
  return {
    nodeId: network.nodeId,
    stateCode: table.stateCode,
    today,
    table,
    authorities: oicCandidates(directory, table).map((authority) => ({
      authorityId: authority.id,
      name: authority.name,
      governmentLevel: authority.governmentLevel,
      hasKeys: isAuthorityValidOn(authority, today),
    })),
    entities: views,
    coverage: competenceCoverage(directory, table, entities, today),
    proposals: ctx.tableProposals.list(PROPOSALS_SHOWN),
  };
}

/**
 * Revisa (`dryRun`) o firma la versión siguiente de la tabla con la competencia por dependencia
 * dada. Responde `conflict` si la tabla vigente ya no es `baseVersion` y `bad_request` si nombra un
 * ente que no es de la entidad del nodo. Con problemas de coherencia (los mismos que revisa la
 * SESNA al aceptarla) no firma y los devuelve.
 * Seguridad: firma con la llave del nodo solo una tabla cuya firma verifica con la llave del nodo
 * en el directorio; la operación de la ventanilla no puede cambiarla sin esa firma.
 */
export function saveCompetence(
  ctx: AppContext,
  account: AuthorityAccount,
  request: CompetenceSaveRequest,
): CompetenceSaveResponse {
  const { network, table } = currentTable(ctx);
  if (request.baseVersion !== table.version) throw new ApiFailure('conflict');
  const known = new Map(entitiesOfTable(table).map((entity) => [entity.id, entity]));
  if (request.entities.some((item) => !known.has(item.entityId))) {
    throw new ApiFailure('bad_request');
  }
  const { directory } = network;
  const today = toDayDate(ctx.deps.now());
  const next = nextTableWithEntities(table, request.entities, today);
  const signed = signFunctionTable(next, ctx.deps.keys.serverSigningPrivateKey);
  if (!verifyFunctionTableSignature(signed, ownNode(network))) throw new ApiFailure('internal');
  const others = (directory.functionTables ?? []).filter(
    (item) => item.table.nodeId !== network.nodeId,
  );
  const problems = functionTableProblems({ ...directory, functionTables: [...others, signed] });
  const changes = functionTableDiff(
    table,
    next,
    directory,
    (entityId) => known.get(entityId)?.name ?? entityId,
  );
  if (changes.length === 0) problems.push('No hay cambios respecto de la versión vigente.');
  const base = { version: next.version, changes, problems };
  if (request.dryRun || problems.length > 0) return { ...base, proposal: null };
  const proposal = {
    version: next.version,
    signedOn: today,
    signedBy: account.accountId,
    changes,
    signedTable: signed,
  };
  ctx.tableProposals.insert(
    proposal,
    `tabla-${toHex(randomBytes(8))}`,
    ctx.deps.now().toISOString(),
  );
  return { ...base, proposal };
}
