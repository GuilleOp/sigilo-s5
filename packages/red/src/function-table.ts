// Tabla de funciones de cada nodo: qué institución cumple cada función en su entidad (buzón,
// operación, investigación, substanciación, resolución, supervisión, vía penal y observador). La
// firma el nodo con su llave del directorio y viaja dentro del directorio cofirmado: así la operación
// no puede cambiar la tabla de un estado sin su firma, y los testigos ven cada versión.
import { findState, FunctionTableSchema, NODE_FUNCTIONS } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryAuthority,
  DirectoryNode,
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
  intake: 'Buzón general (recepción y turnado)',
  operation: 'Operación del nodo (altas de autoridades)',
  investigation: 'Investigación y calificación',
  substantiation: 'Substanciación',
  resolution: 'Resolución',
  supervision: 'Supervisión (superior)',
  prosecution: 'Vía penal (fiscalía)',
  observer: 'Observador (CPC)',
};

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
  rule: FunctionRule,
): string[] {
  const where = `La tabla de ${table.nodeId} (${fn})`;
  const { holder } = rule;
  if (holder.kind === 'observer') {
    return directory.observers.some((item) => item.id === holder.observerId)
      ? []
      : [`${where} nombra a un observador inexistente.`];
  }
  if (holder.kind === 'institution') {
    return AUTHORITY_ONLY.has(fn)
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
    problems.push(`${where}: el buzón general solo recibe y turna.`);
  }
  return problems;
}

/**
 * Problemas de coherencia de las tablas de funciones del directorio (vacío si no hay): una tabla
 * por nodo y por entidad, del nodo que la firma, con órdenes de gobierno de su entidad, autoridades
 * de su propio nodo con el papel de la función y la firma válida del nodo.
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
      for (const rule of table.functions[fn]) {
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
        problems.push(...holderProblems(directory, table, fn, rule));
      }
    }
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
}

/** Regla que aplica y si aplica por el ente o por todo su orden. */
export interface FunctionMatch {
  rule: FunctionRule;
  entityMatch: 'specific' | 'general';
}

/**
 * Busca la regla de la función que aplica al ente: gana la que nombra al ente sobre la de todo su
 * orden y, entre ellas, la de la misma gravedad sobre la que no distingue. Una regla de otra
 * gravedad no aplica. `null` si ninguna aplica.
 */
export function matchFunction(
  table: FunctionTable,
  fn: NodeFunction,
  subject: FunctionSubject,
): FunctionMatch | null {
  let best: { match: FunctionMatch; score: number } | null = null;
  for (const rule of table.functions[fn]) {
    if (rule.severity !== undefined && rule.severity !== subject.severity) continue;
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
  /** Una fila por gravedad cuando la función distingue faltas graves y no graves. */
  holders: {
    name: string;
    severity: 'serious' | 'non_serious' | null;
    legalBasis: string | null;
  }[];
}

/**
 * Quién cumple cada función indicada para el ente según la tabla. Si la gravedad no se conoce y la
 * función distingue entre grave y no grave, devuelve las dos filas.
 */
export function assignmentsFor(
  directory: AuthorityDirectory,
  table: FunctionTable,
  functions: readonly NodeFunction[],
  subject: FunctionSubject,
): FunctionAssignment[] {
  return functions.map((fn) => {
    const severities: ('serious' | 'non_serious' | null)[] =
      subject.severity !== undefined
        ? [subject.severity]
        : table.functions[fn].some((rule) => rule.severity !== undefined)
          ? ['non_serious', 'serious']
          : [null];
    const holders = severities.flatMap((severity) => {
      const match = matchFunction(table, fn, {
        ...subject,
        ...(severity === null ? {} : { severity }),
      });
      return match === null
        ? []
        : [
            {
              name: holderName(directory, match.rule.holder),
              severity: match.rule.severity === undefined ? null : severity,
              legalBasis: match.rule.legalBasis ?? null,
            },
          ];
    });
    return { function: fn, label: NODE_FUNCTION_LABELS[fn], holders };
  });
}
