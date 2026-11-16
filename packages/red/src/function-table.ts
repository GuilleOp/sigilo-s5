// Tabla de funciones de cada nodo: qué institución cumple cada función en su entidad (autoridad
// receptora, operación, investigación, substanciación, resolución, tribunal, supervisión, vía penal
// y observador) y, desde el formato 2, el órgano interno de control de cada dependencia. La firma el
// nodo con su llave del directorio y viaja dentro del directorio cofirmado: así la operación no
// puede cambiar la tabla de un estado sin su firma, y los testigos ven cada versión.
import {
  entityAssignmentsOf,
  findState,
  functionRulesOf,
  FunctionTableSchema,
  NODE_FUNCTIONS,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryAuthority,
  DirectoryNode,
  EntityAssignment,
  FunctionHolder,
  FunctionRule,
  FunctionTable,
  GovernmentLevel,
  NodeFunction,
  SignedFunctionTable,
} from '@sigilo/contracts';
import { canonicalize, sha256Hex } from '@sigilo/core';
import { signWithDomain, verifyWithDomain } from './signatures.ts';

/** Dominio de la firma del nodo sobre el digesto de su tabla de funciones. */
export const FUNCTION_TABLE_DOMAIN = 'sigilo/red/function-table/v1:';

/** Nombre en español de cada función, para el panel y la página pública. */
export const NODE_FUNCTION_LABELS: Readonly<Record<NodeFunction, string>> = {
  intake: 'Autoridad receptora (recepción y turnado)',
  operation: 'Operación del nodo (altas de autoridades, sin ver denuncias)',
  investigation: 'Investigación y calificación',
  substantiation: 'Substanciación',
  resolution: 'Resolución',
  court: 'Tribunal (faltas graves, de particulares y alzada)',
  supervision: 'Supervisión (superior)',
  prosecution: 'Vía penal (fiscalía)',
  observer: 'Vigilancia del sistema (CPC), sin acceso a casos',
};

/** Nombre de cada instancia del tribunal. */
export const COURT_INSTANCE_LABELS = {
  first: 'primera instancia',
  appeal: 'alzada (apelación y revisión)',
} as const;

/** Papel que debe tener en el directorio la autoridad que cumple cada función, si es autoridad. */
const REQUIRED_ROLE: Partial<Record<NodeFunction, DirectoryAuthority['role']>> = {
  intake: 'inbox',
  investigation: 'investigating',
  supervision: 'supervisory',
  prosecution: 'prosecution',
};

/** Funciones que solo puede cumplir una autoridad del directorio (reciben sobres cifrados). */
const AUTHORITY_ONLY: ReadonlySet<NodeFunction> = new Set(['intake', 'investigation']);

/** Nombre de la entidad para los textos: el del catálogo INEGI o la clave si no se conoce. */
export function stateDisplayName(code: string): string {
  return findState(code)?.name ?? code;
}

/** SHA-256 de la forma canónica de la tabla. Lanza error si no cumple el esquema. */
export function functionTableDigest(table: FunctionTable): string {
  return sha256Hex(canonicalize(FunctionTableSchema.parse(table)));
}

/**
 * Firma la tabla con la llave de firma del nodo (la del directorio).
 * Lanza error si la tabla no cumple el esquema.
 */
export function signFunctionTable(
  table: FunctionTable,
  nodeSigningPrivateKey: Uint8Array,
): SignedFunctionTable {
  const parsed = FunctionTableSchema.parse(table);
  return {
    table: parsed,
    signature: signWithDomain(
      FUNCTION_TABLE_DOMAIN,
      functionTableDigest(parsed),
      nodeSigningPrivateKey,
    ),
  };
}

/** Indica si la firma de la tabla es la del nodo que la declara. */
export function verifyFunctionTableSignature(
  signed: SignedFunctionTable,
  node: Pick<DirectoryNode, 'signingPublicKey'>,
): boolean {
  let digest: string;
  try {
    digest = functionTableDigest(signed.table);
  } catch {
    return false;
  }
  return verifyWithDomain(FUNCTION_TABLE_DOMAIN, digest, signed.signature, node.signingPublicKey);
}

function holderProblems(
  directory: AuthorityDirectory,
  table: FunctionTable,
  fn: NodeFunction,
  holder: FunctionHolder,
  options: { where?: string; allowInstitution?: boolean } = {},
): string[] {
  const where = options.where ?? `La tabla de ${table.nodeId} (${fn})`;
  if (holder.kind === 'observer') {
    return directory.observers.some((item) => item.id === holder.observerId)
      ? []
      : [`${where} nombra a un observador inexistente.`];
  }
  if (holder.kind === 'institution') {
    return AUTHORITY_ONLY.has(fn) && options.allowInstitution !== true
      ? [`${where} debe nombrar a una autoridad del directorio, que recibe los sobres cifrados.`]
      : [];
  }
  const authority = directory.authorities.find((item) => item.id === holder.authorityId);
  if (authority === undefined) return [`${where} nombra a una autoridad inexistente.`];
  const problems: string[] = [];
  // Seguridad: ningún estado vive en el nodo de otro; la tabla solo nombra autoridades de su nodo.
  if (authority.nodeId !== table.nodeId) {
    problems.push(`${where} nombra a ${authority.id}, que está en otro nodo.`);
  }
  if (authority.stateCode !== table.stateCode) {
    problems.push(`${where} nombra a ${authority.id}, que es de otra entidad.`);
  }
  const role = REQUIRED_ROLE[fn];
  if (role !== undefined && authority.role !== role) {
    problems.push(`${where} nombra a ${authority.id}, que no tiene el papel ${role}.`);
  }
  if (role === undefined && authority.role === 'inbox') {
    problems.push(`${where}: el buzón de la autoridad receptora solo recibe y turna.`);
  }
  return problems;
}

/** Clave de un ente real de la PDN (`PDN-<entidad>-<id>`); los ficticios no la tienen. */
const PDN_ENTITY_PATTERN = /^PDN-(\d{2})-\d+$/u;

/** Indica si dos titulares son el mismo (misma autoridad o misma institución). */
export function sameHolder(left: FunctionHolder, right: FunctionHolder): boolean {
  return canonicalize(left) === canonicalize(right);
}

/**
 * Problemas propios del formato 2: entes de la entidad, órganos internos de control con el papel
 * de investigar, ninguna regla general que mande a los municipios a una autoridad estatal (CPEUM
 * art. 109 fr. III: todo municipio tiene su OIC) y áreas distintas para investigar y substanciar
 * (LGRA art. 115).
 */
function format2Problems(directory: AuthorityDirectory, table: FunctionTable): string[] {
  const problems: string[] = [];
  const state = table.stateCode ?? '00';
  for (const assignment of entityAssignmentsOf(table)) {
    const where = `La tabla de ${table.nodeId} (ente ${assignment.entityId})`;
    const prefix = PDN_ENTITY_PATTERN.exec(assignment.entityId)?.[1];
    if (prefix !== undefined && prefix !== state) {
      problems.push(`${where} nombra un ente de otra entidad.`);
    }
    if (assignment.holder !== undefined) {
      problems.push(
        ...holderProblems(directory, table, 'investigation', assignment.holder, {
          where,
          allowInstitution: true,
        }),
      );
    }
  }
  // Las reglas solo de faltas graves son de la fiscalización superior, que sí revisa municipios.
  for (const rule of functionRulesOf(table, 'investigation')) {
    if (rule.entityIds.length > 0 || !rule.governmentLevels.includes('municipal')) continue;
    if (rule.severity === 'serious') continue;
    const { holder } = rule;
    const authority =
      holder.kind === 'authority'
        ? directory.authorities.find((item) => item.id === holder.authorityId)
        : undefined;
    if (authority !== undefined && authority.governmentLevel !== 'municipal') {
      problems.push(
        `La tabla de ${table.nodeId} manda a todos los entes municipales a ${authority.id}, que no es municipal: cada municipio tiene su órgano interno de control (CPEUM, art. 109, fr. III).`,
      );
    }
  }
  // Por omisión nacional, quien opera el nodo no recibe ni turna (en Querétaro, la SESEA solo
  // opera); un estado cuya ley lo faculte lo declara en `settings.operatorReceives`.
  const operators = functionRulesOf(table, 'operation').map((rule) => rule.holder);
  const operatorReceives = functionRulesOf(table, 'intake').some((rule) =>
    operators.some((holder) => sameHolder(holder, rule.holder)),
  );
  if (operatorReceives && table.settings?.operatorReceives === undefined) {
    problems.push(
      `La tabla de ${table.nodeId} nombra a quien opera el nodo como autoridad receptora: declara en settings.operatorReceives la ley del estado que lo faculta.`,
    );
  }
  const investigators = [
    ...functionRulesOf(table, 'investigation').map((rule) => rule.holder),
    ...entityAssignmentsOf(table).flatMap((item) =>
      item.holder === undefined ? [] : [item.holder],
    ),
  ];
  for (const rule of functionRulesOf(table, 'substantiation')) {
    if (investigators.some((holder) => sameHolder(holder, rule.holder))) {
      problems.push(
        `La tabla de ${table.nodeId} nombra a la misma área para investigar y substanciar: deben ser distintas (LGRA, art. 115).`,
      );
      break;
    }
  }
  return problems;
}

/**
 * Problemas de coherencia de las tablas de funciones del directorio (vacío si no hay): una tabla
 * por nodo y por entidad, del nodo que la firma, con órdenes de gobierno de su entidad, autoridades
 * de su propio nodo con el papel de la función y la firma válida del nodo. En el formato 2, además,
 * la competencia por dependencia (`format2Problems`).
 */
export function functionTableProblems(directory: AuthorityDirectory): string[] {
  const problems: string[] = [];
  const nodeIds = new Set<string>();
  const states = new Set<string>();
  for (const signed of directory.functionTables ?? []) {
    const { table } = signed;
    const node = directory.nodes.find((item) => item.id === table.nodeId);
    if (node === undefined) {
      problems.push(`La tabla de funciones de ${table.nodeId} es de un nodo inexistente.`);
      continue;
    }
    if (nodeIds.has(table.nodeId)) problems.push(`${table.nodeId} tiene dos tablas de funciones.`);
    nodeIds.add(table.nodeId);
    const state = table.stateCode ?? 'federal';
    if (states.has(state)) problems.push(`Dos tablas de funciones cubren ${state}.`);
    states.add(state);
    if (!verifyFunctionTableSignature(signed, node)) {
      problems.push(`La tabla de funciones de ${table.nodeId} no tiene la firma de su nodo.`);
    }
    for (const fn of NODE_FUNCTIONS) {
      for (const rule of functionRulesOf(table, fn)) {
        const isFederalTable = table.stateCode === null;
        const hasWrongLevel = rule.governmentLevels.some(
          (level) => (level === 'federal') !== isFederalTable,
        );
        if (hasWrongLevel) {
          problems.push(
            isFederalTable
              ? `La tabla federal de ${table.nodeId} (${fn}) solo cubre entes federales.`
              : `La tabla de ${table.nodeId} (${fn}) no puede cubrir entes federales: los atiende el nodo federal.`,
          );
        }
        problems.push(...holderProblems(directory, table, fn, rule.holder));
      }
    }
    if (table.format === 2) problems.push(...format2Problems(directory, table));
  }
  return problems;
}

/**
 * Tabla de funciones que cubre la entidad (`stateCode`) o, con `null`, el orden federal; o
 * `undefined` si nadie la declara (la entidad no tiene nodo).
 */
export function functionTableFor(
  directory: AuthorityDirectory,
  stateCode: string | null,
): FunctionTable | undefined {
  return directory.functionTables?.find((signed) => signed.table.stateCode === stateCode)?.table;
}

/** Ente para el que se busca quién cumple una función. */
export interface FunctionSubject {
  entityId: string;
  /** Orden de gobierno del ente; `null` si no está en el catálogo (solo cuentan reglas por ente). */
  level: GovernmentLevel | null;
  /** Gravedad de la falta, si ya se calificó. */
  severity?: 'serious' | 'non_serious';
  /**
   * `true` solo si quien denuncia se identificó con nombre y firma. Sin el campo, las reglas que
   * exigen denuncia identificada (por ejemplo, la entidad de fiscalización) no aplican.
   */
  reporterIdentified?: boolean;
  /** Instancia del tribunal que se busca (solo `court`). */
  instance?: 'first' | 'appeal';
}

/** Regla que aplica y si aplica por el ente o por todo su orden. */
export interface FunctionMatch {
  rule: FunctionRule;
  entityMatch: 'specific' | 'general';
}

/**
 * Busca la regla de la función que aplica al ente: gana la que nombra al ente sobre la de todo su
 * orden y, entre ellas, la de la misma gravedad sobre la que no distingue. Una regla de otra
 * gravedad (o de otra instancia del tribunal) no aplica, y la que exige denuncia identificada solo
 * aplica si quien denuncia se identificó. `null` si ninguna aplica.
 */
export function matchFunction(
  table: FunctionTable,
  fn: NodeFunction,
  subject: FunctionSubject,
): FunctionMatch | null {
  let best: { match: FunctionMatch; score: number } | null = null;
  for (const rule of functionRulesOf(table, fn)) {
    if (rule.severity !== undefined && rule.severity !== subject.severity) continue;
    if (rule.instance !== undefined && subject.instance !== rule.instance) continue;
    if (rule.requiresIdentifiedReporter === true && subject.reporterIdentified !== true) continue;
    const isSpecific = rule.entityIds.includes(subject.entityId);
    const isGeneral =
      rule.entityIds.length === 0 &&
      subject.level !== null &&
      rule.governmentLevels.includes(subject.level);
    if (!isSpecific && !isGeneral) continue;
    const score = (isSpecific ? 2 : 0) + (rule.severity === undefined ? 0 : 1);
    if (best === null || score > best.score) {
      best = { match: { rule, entityMatch: isSpecific ? 'specific' : 'general' }, score };
    }
  }
  return best?.match ?? null;
}

/** Competencia por dependencia del ente en la tabla (formato 2), o `undefined`. */
export function entityAssignmentFor(
  table: FunctionTable,
  entityId: string,
): EntityAssignment | undefined {
  return entityAssignmentsOf(table).find((item) => item.entityId === entityId);
}

/**
 * Autoridades que la tabla marca como «solo denuncias identificadas»: nunca se proponen ni se
 * ofrecen a una denuncia anónima o con identidad sellada (LFSRCQ arts. 50 y 51).
 */
export function identifiedOnlyAuthorityIds(table: FunctionTable): Set<string> {
  const ids = new Set<string>();
  const holders = [
    ...NODE_FUNCTIONS.flatMap((fn) =>
      functionRulesOf(table, fn).filter((rule) => rule.requiresIdentifiedReporter === true),
    ),
    ...entityAssignmentsOf(table).filter((item) => item.requiresIdentifiedReporter === true),
  ];
  for (const item of holders) {
    if (item.holder?.kind === 'authority') ids.add(item.holder.authorityId);
  }
  return ids;
}

/** Nombre de quien cumple la función, según el directorio. */
export function holderName(directory: AuthorityDirectory, holder: FunctionHolder): string {
  if (holder.kind === 'institution') return holder.name;
  if (holder.kind === 'observer') {
    return (
      directory.observers.find((item) => item.id === holder.observerId)?.name ?? holder.observerId
    );
  }
  return (
    directory.authorities.find((item) => item.id === holder.authorityId)?.name ?? holder.authorityId
  );
}

/** Quién cumple una función para un ente, ya con su nombre. */
export interface FunctionAssignment {
  function: NodeFunction;
  label: string;
  /**
   * Una fila por gravedad cuando la función distingue faltas graves y no graves, y por instancia
   * cuando el tribunal distingue la primera instancia de la alzada.
   */
  holders: {
    name: string;
    severity: 'serious' | 'non_serious' | null;
    instance?: 'first' | 'appeal';
    legalBasis: string | null;
  }[];
}

/** Quién investiga al ente según su competencia por dependencia, como fila de la asignación. */
function entityHolderRow(
  directory: AuthorityDirectory,
  assignment: EntityAssignment,
): FunctionAssignment['holders'] {
  if (assignment.holder === undefined) return [];
  const name = holderName(directory, assignment.holder);
  return [
    {
      name: assignment.status === 'without_oic' ? `${name} (sin OIC designado)` : name,
      severity: null,
      legalBasis: assignment.legalBasis ?? null,
    },
  ];
}

/**
 * Quién cumple cada función indicada para el ente según la tabla. Si la gravedad no se conoce y la
 * función distingue entre grave y no grave, devuelve las dos filas; el tribunal, una por instancia
 * si las distingue. En la investigación manda la competencia por dependencia del ente.
 */
export function assignmentsFor(
  directory: AuthorityDirectory,
  table: FunctionTable,
  functions: readonly NodeFunction[],
  subject: FunctionSubject,
): FunctionAssignment[] {
  return functions.map((fn) => {
    const rules = functionRulesOf(table, fn);
    const assignment =
      fn === 'investigation' ? entityAssignmentFor(table, subject.entityId) : undefined;
    if (assignment !== undefined) {
      return {
        function: fn,
        label: NODE_FUNCTION_LABELS[fn],
        holders: entityHolderRow(directory, assignment),
      };
    }
    const severities: ('serious' | 'non_serious' | null)[] =
      subject.severity !== undefined
        ? [subject.severity]
        : rules.some((rule) => rule.severity !== undefined)
          ? ['non_serious', 'serious']
          : [null];
    const instances: ('first' | 'appeal' | null)[] =
      fn === 'court' && rules.some((rule) => rule.instance !== undefined)
        ? ['first', 'appeal']
        : [null];
    const holders = severities.flatMap((severity) =>
      instances.flatMap((instance) => {
        const match = matchFunction(table, fn, {
          ...subject,
          ...(severity === null ? {} : { severity }),
          ...(instance === null ? {} : { instance }),
        });
        return match === null
          ? []
          : [
              {
                name: holderName(directory, match.rule.holder),
                severity: match.rule.severity === undefined ? null : severity,
                ...(instance === null ? {} : { instance }),
                legalBasis: match.rule.legalBasis ?? null,
              },
            ];
      }),
    );
    return { function: fn, label: NODE_FUNCTION_LABELS[fn], holders };
  });
}

/** Una línea del resumen de cambios entre dos versiones de la tabla. */
export interface FunctionTableChange {
  kind: 'added' | 'removed' | 'changed';
  /** Función de la regla, `entity` si es la competencia de una dependencia o `format`. */
  scope: NodeFunction | 'entity' | 'format';
  /** Ente (solo en `entity`). */
  entityId?: string;
  text: string;
}

function holderText(directory: AuthorityDirectory | null, holder: FunctionHolder): string {
  return directory === null
    ? holder.kind === 'institution'
      ? holder.name
      : holder.kind === 'authority'
        ? holder.authorityId
        : holder.observerId
    : holderName(directory, holder);
}

const ENTITY_STATUS_TEXT = {
  assigned: 'OIC',
  without_oic: 'sin OIC designado, atiende',
  pending: 'pendiente',
} as const;

function entityText(directory: AuthorityDirectory | null, item: EntityAssignment): string {
  return item.holder === undefined
    ? ENTITY_STATUS_TEXT.pending
    : `${ENTITY_STATUS_TEXT[item.status]} ${holderText(directory, item.holder)}${
        item.status === 'without_oic' && item.legalBasis !== undefined
          ? ` (${item.legalBasis})`
          : ''
      }`;
}

/**
 * Resumen de cambios de `before` a `after` (la misma tabla, otra versión): reglas agregadas o
 * quitadas por función y dependencias cuya competencia cambió. Lo ven quien firma y los testigos.
 */
export function functionTableDiff(
  before: FunctionTable | null,
  after: FunctionTable,
  directory: AuthorityDirectory | null = null,
  entityName: (entityId: string) => string = (id) => id,
): FunctionTableChange[] {
  const changes: FunctionTableChange[] = [];
  if (before !== null && before.format !== after.format) {
    changes.push({
      kind: 'changed',
      scope: 'format',
      text: `La tabla pasa del formato ${before.format} al ${after.format}.`,
    });
  }
  for (const fn of NODE_FUNCTIONS) {
    const old = new Set((before === null ? [] : functionRulesOf(before, fn)).map(canonicalize));
    const next = new Set(functionRulesOf(after, fn).map(canonicalize));
    for (const rule of functionRulesOf(after, fn)) {
      if (!old.has(canonicalize(rule))) {
        changes.push({
          kind: 'added',
          scope: fn,
          text: `${NODE_FUNCTION_LABELS[fn]}: se agrega ${holderText(directory, rule.holder)}.`,
        });
      }
    }
    for (const rule of before === null ? [] : functionRulesOf(before, fn)) {
      if (!next.has(canonicalize(rule))) {
        changes.push({
          kind: 'removed',
          scope: fn,
          text: `${NODE_FUNCTION_LABELS[fn]}: se quita ${holderText(directory, rule.holder)}.`,
        });
      }
    }
  }
  const oldEntities = new Map(
    (before === null ? [] : entityAssignmentsOf(before)).map((item) => [item.entityId, item]),
  );
  const newEntities = new Map(entityAssignmentsOf(after).map((item) => [item.entityId, item]));
  for (const [entityId, item] of newEntities) {
    const previous = oldEntities.get(entityId);
    if (previous !== undefined && canonicalize(previous) === canonicalize(item)) continue;
    changes.push({
      kind: previous === undefined ? 'added' : 'changed',
      scope: 'entity',
      entityId,
      text:
        previous === undefined
          ? `${entityName(entityId)}: ${entityText(directory, item)}.`
          : `${entityName(entityId)}: de ${entityText(directory, previous)} a ${entityText(directory, item)}.`,
    });
  }
  for (const [entityId, item] of oldEntities) {
    if (newEntities.has(entityId)) continue;
    changes.push({
      kind: 'removed',
      scope: 'entity',
      entityId,
      text: `${entityName(entityId)}: deja de tener asignación (antes, ${entityText(directory, item)}).`,
    });
  }
  return changes;
}

/**
 * Versión siguiente de la tabla con la competencia por dependencia dada, ya en el formato 2 (una
 * tabla de formato 1 sube al 2 sin cambiar sus reglas). Ordena los entes por clave para que dos
 * versiones con la misma competencia tengan el mismo digesto.
 */
export function nextTableWithEntities(
  table: FunctionTable,
  entities: readonly EntityAssignment[],
  issuedOn: string,
): FunctionTable {
  return FunctionTableSchema.parse({
    ...table,
    format: 2,
    version: table.version + 1,
    issuedOn,
    functions: { ...table.functions, court: functionRulesOf(table, 'court') },
    entities: [...entities].sort((left, right) => left.entityId.localeCompare(right.entityId)),
  });
}
