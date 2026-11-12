// Propuesta de la autoridad competente: función pura que el navegador ejecuta con el directorio
// verificado y los datos de la denuncia (entidad, ente y conducta), con su razonamiento en claro.
// Manda la tabla de funciones que firmó el nodo de la entidad de los hechos (o el nodo federal,
// para los entes federales): ahí cada estado declara quién investiga a cada ente. Si la tabla no
// nombra a nadie, la denuncia va a su buzón general, que la turna: la ventanilla es un canal único
// (Bases de la PDN, art. 56) con turno a la autoridad competente (art. 58). Una entidad sin tabla no
// tiene nodo: sus denuncias estatales y municipales no pueden enviarse (no hay nodo común).
import {
  findEntity,
  findOffense,
  findState,
  offenseReference,
  UNCLASSIFIED_OFFENSE_CODE,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryAuthority,
  DirectoryNode,
  FunctionTable,
  GovernmentLevel,
  NodeFunction,
  OffenseLaw,
} from '@sigilo/contracts';
import { isAuthorityValidOn } from './directory.ts';
import { functionTableFor, matchFunction, stateDisplayName } from './function-table.ts';

/** Datos de la denuncia con los que se propone la autoridad. Nunca incluye la narración. */
export interface ComplaintRoutingInput {
  /** Clave INEGI de la entidad o clave `state.*` de una entidad sintética. */
  stateCode: string;
  entityId: string;
  offenseCode: string;
  /** Orden de gobierno del ente; si falta, se toma del catálogo. */
  entityLevel?: GovernmentLevel;
  /** Nombre del ente para el razonamiento; si falta, se toma del catálogo. */
  entityName?: string;
}

/** Autoridad candidata con el motivo por el que lo es. */
export interface AuthorityCandidate {
  authority: DirectoryAuthority;
  node: DirectoryNode;
  /**
   * `primary`: conoce la ley de la conducta elegida; `equivalent`: la de una conducta equivalente;
   * `null`: es el buzón general, que no investiga y solo turna.
   */
  lawMatch: 'primary' | 'equivalent' | null;
  /** `specific`: atiende a ese ente por nombre; `general`: a todos los de su orden y entidad. */
  entityMatch: 'specific' | 'general' | null;
  reason: string;
}

/**
 * Propuesta: la autoridad sugerida, alternativas y el razonamiento en lenguaje claro. `inbox`: no
 * hay autoridad competente y se propone el buzón general del nodo; `none`: tampoco hay buzón (o la
 * entidad no tiene nodo).
 */
export interface CompetentAuthorityProposal {
  status: 'proposed' | 'inbox' | 'none';
  proposed: AuthorityCandidate | null;
  alternatives: AuthorityCandidate[];
  /**
   * Si se propone por una regla de respaldo: un ente municipal sin órgano municipal propio, que la
   * tabla (o el directorio) asigna a la autoridad estatal.
   */
  isFallback: boolean;
  /**
   * `true` si la entidad de los hechos no tiene nodo en la red (no hay tabla de funciones que la
   * cubra) y el ente no es federal: nada se envía por la ventanilla.
   */
  isStateWithoutNode: boolean;
  reasons: string[];
}

const LAW_TEXT: Readonly<Record<OffenseLaw, string>> = {
  LGRA: 'una falta administrativa (Ley General de Responsabilidades Administrativas)',
  CPF: 'un posible delito por hechos de corrupción (Código Penal Federal)',
};

const LEVEL_TEXT: Readonly<Record<GovernmentLevel, string>> = {
  federal: 'federal',
  estatal: 'estatal',
  municipal: 'municipal',
};

/** Función de la tabla que atiende cada ley: la falta se investiga; el delito va a la fiscalía. */
const FUNCTION_OF_LAW: Readonly<Record<OffenseLaw, NodeFunction>> = {
  LGRA: 'investigation',
  CPF: 'prosecution',
};

function stateName(code: string): string {
  return findState(code) === undefined ? `la entidad ${code}` : stateDisplayName(code);
}

/** Nombre de la jurisdicción de una tabla: la entidad o el orden federal. */
function tableName(table: FunctionTable): string {
  return table.stateCode === null ? 'el nodo federal' : stateName(table.stateCode);
}

function lawsOfOffense(code: string): { primary: OffenseLaw; equivalent: OffenseLaw[] } | null {
  const reference = offenseReference(code);
  const offense = findOffense(code);
  if (reference === undefined || offense === undefined) return null;
  const laws = new Set<OffenseLaw>();
  for (const candidate of [offense.code, ...offense.equivalentCodes]) {
    const law = offenseReference(candidate)?.law;
    if (law !== undefined && law !== reference.law) laws.add(law);
  }
  return { primary: reference.law, equivalent: [...laws] };
}

function matchCandidate(
  authority: DirectoryAuthority,
  node: DirectoryNode,
  input: ComplaintRoutingInput,
  level: GovernmentLevel | null,
  laws: { primary: OffenseLaw; equivalent: OffenseLaw[] },
): AuthorityCandidate | null {
  const { competence } = authority;
  const lawMatch = competence.laws.includes(laws.primary)
    ? 'primary'
    : laws.equivalent.some((law) => competence.laws.includes(law))
      ? 'equivalent'
      : null;
  if (lawMatch === null) return null;
  const isInState =
    competence.stateCodes.length === 0 || competence.stateCodes.includes(input.stateCode);
  if (!isInState) return null;
  if (competence.entityIds.includes(input.entityId)) {
    return {
      authority,
      node,
      lawMatch,
      entityMatch: 'specific',
      reason: `${authority.name} atiende de forma específica a ese ente.`,
    };
  }
  const isGeneral =
    competence.entityIds.length === 0 &&
    level !== null &&
    competence.governmentLevels.includes(level);
  if (!isGeneral || level === null) return null;
  const where =
    competence.stateCodes.length === 0
      ? 'en todo el país'
      : `en ${competence.stateCodes.map(stateName).join(', ')}`;
  return {
    authority,
    node,
    lawMatch,
    entityMatch: 'general',
    reason: `${authority.name} atiende a los entes del orden ${LEVEL_TEXT[level]} ${where}.`,
  };
}

function rank(candidate: AuthorityCandidate): number {
  return (
    (candidate.lawMatch === 'primary' ? 0 : 2) + (candidate.entityMatch === 'specific' ? 0 : 1)
  );
}

function candidatesFor(
  directory: AuthorityDirectory,
  input: ComplaintRoutingInput,
  level: GovernmentLevel | null,
  laws: { primary: OffenseLaw; equivalent: OffenseLaw[] },
  on: string,
): AuthorityCandidate[] {
  const nodes = new Map(directory.nodes.map((node) => [node.id, node]));
  const found: AuthorityCandidate[] = [];
  for (const authority of directory.authorities) {
    // Las supervisoras reciben escalamientos, no denuncias directas (ADR 0007); el buzón general
    // no investiga: solo recibe lo que no tiene autoridad competente.
    const isExcluded = authority.role === 'supervisory' || authority.role === 'inbox';
    if (isExcluded || !isAuthorityValidOn(authority, on)) continue;
    const node = nodes.get(authority.nodeId);
    if (node === undefined) continue;
    const candidate = matchCandidate(authority, node, input, level, laws);
    if (candidate !== null) found.push(candidate);
  }
  return found.sort(
    (left, right) =>
      rank(left) - rank(right) || left.authority.id.localeCompare(right.authority.id),
  );
}

/** Agrega por qué una segunda copia llega a la supervisora, si la autoridad tiene. */
function pushSupervisorReason(
  directory: AuthorityDirectory,
  authority: DirectoryAuthority,
  reasons: string[],
): void {
  const supervisor =
    authority.supervisorId === null
      ? undefined
      : directory.authorities.find((item) => item.id === authority.supervisorId);
  if (supervisor !== undefined) {
    reasons.push(
      `Si no actúa en los plazos legales, una segunda copia cifrada llega a ${supervisor.name}.`,
    );
  }
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('es-MX') + text.slice(1);
}

/** Autoridad vigente del directorio con su nodo, o `null`. */
function liveAuthority(
  directory: AuthorityDirectory,
  authorityId: string,
  on: string,
): { authority: DirectoryAuthority; node: DirectoryNode } | null {
  const authority = directory.authorities.find((item) => item.id === authorityId);
  if (authority === undefined || !isAuthorityValidOn(authority, on)) return null;
  const node = directory.nodes.find((item) => item.id === authority.nodeId);
  return node === undefined ? null : { authority, node };
}

function inboxCandidate(
  authority: DirectoryAuthority,
  node: DirectoryNode,
  why: string,
): AuthorityCandidate {
  return {
    authority,
    node,
    lawMatch: null,
    entityMatch: null,
    reason: `${why} La enviamos al ${lowerFirst(authority.name)}, donde una persona la turna a quien corresponda.`,
  };
}

/** Buzón general que declara la tabla para el ente (o el primero de la tabla), vigente. */
function tableInbox(
  directory: AuthorityDirectory,
  table: FunctionTable,
  input: ComplaintRoutingInput,
  level: GovernmentLevel | null,
  on: string,
  why: string,
): AuthorityCandidate | null {
  const match = matchFunction(table, 'intake', { entityId: input.entityId, level });
  const holder = (match?.rule ?? table.functions.intake[0])?.holder;
  if (holder?.kind !== 'authority') return null;
  const found = liveAuthority(directory, holder.authorityId, on);
  return found === null ? null : inboxCandidate(found.authority, found.node, why);
}

/**
 * Buzón general sin tabla de funciones (directorios anteriores a las tablas): el del nodo de la
 * entidad (un buzón vigente cuya competencia nombra la entidad) o, para un ente federal, uno de todo
 * el país que atienda el orden federal. Nunca el de otra entidad: no hay nodo común.
 */
function directoryInbox(
  directory: AuthorityDirectory,
  input: ComplaintRoutingInput,
  level: GovernmentLevel | null,
  on: string,
): AuthorityCandidate | null {
  const nodes = new Map(directory.nodes.map((node) => [node.id, node]));
  const inboxes = directory.authorities
    .filter(
      (authority) =>
        authority.role === 'inbox' &&
        isAuthorityValidOn(authority, on) &&
        nodes.has(authority.nodeId) &&
        (level === null || authority.competence.governmentLevels.includes(level)),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const ofState = inboxes.find((item) => item.competence.stateCodes.includes(input.stateCode));
  const federal =
    level === 'federal'
      ? inboxes.find((item) => item.competence.stateCodes.length === 0)
      : undefined;
  const authority = ofState ?? federal;
  const node = authority === undefined ? undefined : nodes.get(authority.nodeId);
  if (authority === undefined || node === undefined) return null;
  return inboxCandidate(authority, node, 'No encontramos en el directorio quién la investiga.');
}

/** Texto de la regla de la tabla que asigna la autoridad. */
function tableReason(
  table: FunctionTable,
  authority: DirectoryAuthority,
  entityMatch: 'specific' | 'general',
  level: GovernmentLevel | null,
  fn: NodeFunction,
): string {
  const role = fn === 'prosecution' ? 'conoce de los delitos' : 'investiga y califica las faltas';
  const whom =
    entityMatch === 'specific'
      ? 'de ese ente de forma específica'
      : `de los entes del orden ${level === null ? '' : LEVEL_TEXT[level]}`.trimEnd();
  return `Según la tabla de funciones que firmó ${tableName(table)}, ${authority.name} ${role} ${whom}.`;
}

/** Resultado de buscar en la tabla. */
interface TableOutcome {
  candidate: AuthorityCandidate | null;
  isFallback: boolean;
}

/**
 * Busca en la tabla quién atiende la ley de la conducta y, si nadie, la de una conducta
 * equivalente. Solo cuenta una autoridad del directorio, vigente: una institución sin llaves no
 * puede recibir la denuncia cifrada.
 */
function fromTable(
  directory: AuthorityDirectory,
  table: FunctionTable,
  input: ComplaintRoutingInput,
  level: GovernmentLevel | null,
  laws: { primary: OffenseLaw; equivalent: OffenseLaw[] },
  on: string,
): TableOutcome {
  for (const [law, lawMatch] of [
    [laws.primary, 'primary'] as const,
    ...laws.equivalent.map((item) => [item, 'equivalent'] as const),
  ]) {
    const fn = FUNCTION_OF_LAW[law];
    const match = matchFunction(table, fn, { entityId: input.entityId, level });
    if (match?.rule.holder.kind !== 'authority') continue;
    const found = liveAuthority(directory, match.rule.holder.authorityId, on);
    if (found === null) continue;
    const isFallback =
      level === 'municipal' &&
      match.entityMatch === 'general' &&
      found.authority.governmentLevel === 'estatal';
    return {
      candidate: {
        ...found,
        lawMatch,
        entityMatch: match.entityMatch,
        reason: tableReason(table, found.authority, match.entityMatch, level, fn),
      },
      isFallback,
    };
  }
  return { candidate: null, isFallback: false };
}

function routeReason(candidate: AuthorityCandidate, target: string): string {
  return `Su nodo es «${candidate.node.name}». La denuncia se cifra en tu navegador con la llave de ${target}; el enrutador solo ve a quién va dirigida.`;
}

/** Explica que la entidad no tiene nodo y por qué no se envía nada. */
function withoutNodeReason(stateCode: string): string {
  return `${stateName(stateCode).replace(/^el /u, 'El ')} todavía no tiene nodo en la red: no declaró quién atiende sus denuncias. No se envía nada por esta ventanilla. Puedes presentarla ante el órgano interno de control del ente o ante la contraloría de tu estado, o elegir tú una autoridad de la lista.`;
}

/**
 * Propone la autoridad competente para una denuncia con el directorio ya verificado y vigente el
 * día `on` (AAAA-MM-DD). Reglas, en orden: la conducta define la ley (LGRA o CPF); el ente define
 * el orden de gobierno; si es federal manda la tabla del nodo federal y, si no, la de la entidad de
 * los hechos. En la tabla, la regla que nombra al ente gana sobre la de todo su orden, y la función
 * de la ley de la conducta (investigación o vía penal) sobre la de una equivalente. Si la tabla no
 * nombra a una autoridad, se propone su buzón general, que la turna (Bases de la PDN, arts. 56 y
 * 58). Si la entidad no tiene tabla (no tiene nodo) y el ente no es federal, no se envía nada.
 * Con un directorio sin tablas se usa la competencia declarada de cada autoridad, como antes.
 * Las supervisoras nunca se proponen. Las demás autoridades competentes quedan como alternativas.
 * Seguridad: es una propuesta; la persona confirma antes de cifrar y nada sale del navegador.
 */
export function proposeCompetentAuthority(
  directory: AuthorityDirectory,
  input: ComplaintRoutingInput,
  on: string,
): CompetentAuthorityProposal {
  const reasons: string[] = [];
  const offense = findOffense(input.offenseCode);
  const entity = findEntity(input.entityId);
  const level = input.entityLevel ?? entity?.level ?? null;
  const hasTables = (directory.functionTables?.length ?? 0) > 0;
  const table = functionTableFor(directory, level === 'federal' ? null : input.stateCode);
  const isStateWithoutNode = hasTables && table === undefined && level !== 'federal';
  const none = (extra: string[], isFallback = false): CompetentAuthorityProposal => ({
    status: 'none',
    proposed: null,
    alternatives: [],
    isFallback,
    isStateWithoutNode,
    reasons: [...reasons, ...extra],
  });
  const inbox = (
    candidate: AuthorityCandidate,
    extra: string[] = [],
    isFallback = false,
  ): CompetentAuthorityProposal => {
    const all = [...reasons, ...extra, candidate.reason, routeReason(candidate, 'ese buzón')];
    pushSupervisorReason(directory, candidate.authority, all);
    return {
      status: 'inbox',
      proposed: candidate,
      alternatives: [],
      isFallback,
      isStateWithoutNode,
      reasons: all,
    };
  };
  // «Ninguna se parece»: no hay ley que oriente; va al buzón general, que la clasifica y la turna.
  if (offense?.code === UNCLASSIFIED_OFFENSE_CODE) {
    const why = 'No elegiste una conducta.';
    const found =
      table === undefined
        ? hasTables
          ? null
          : directoryInbox(directory, input, level, on)
        : tableInbox(directory, table, input, level, on, why);
    if (found !== null) {
      const reason = `${why} La enviamos al ${lowerFirst(found.authority.name)}, donde una persona la clasifica y la turna a quien corresponda.`;
      return {
        status: 'inbox',
        proposed: { ...found, reason },
        alternatives: [],
        isFallback: false,
        isStateWithoutNode,
        reasons: [reason],
      };
    }
    if (isStateWithoutNode) return none([withoutNodeReason(input.stateCode)]);
  }
  const laws = lawsOfOffense(input.offenseCode);
  if (offense === undefined || laws === null) {
    return none(['La conducta no está en el catálogo; elige otra para poder orientarte.']);
  }
  reasons.push(`«${offense.label}» es ${LAW_TEXT[laws.primary]}.`);
  const entityName = input.entityName ?? entity?.name ?? input.entityId;
  reasons.push(
    level === null
      ? `No encontramos «${entityName}» en el catálogo: solo cuentan las reglas que lo nombran.`
      : `«${entityName}» es un ente del orden ${LEVEL_TEXT[level]}; los hechos ocurrieron en ${stateName(input.stateCode)}.`,
  );
  if (isStateWithoutNode) return none([withoutNodeReason(input.stateCode)]);

  const competent = candidatesFor(directory, input, level, laws, on);
  let proposed: AuthorityCandidate | undefined;
  let isFallback = false;
  if (table !== undefined) {
    const outcome = fromTable(directory, table, input, level, laws, on);
    if (outcome.candidate === null) {
      const found = tableInbox(
        directory,
        table,
        input,
        level,
        on,
        `La tabla de funciones de ${tableName(table)} no nombra quién investiga a ese ente.`,
      );
      if (found !== null) return inbox(found);
      return none([
        `La tabla de funciones de ${tableName(table)} no tiene un buzón vigente. No se envía nada: revisa el ente o la conducta.`,
      ]);
    }
    proposed = outcome.candidate;
    isFallback = outcome.isFallback;
    if (isFallback) {
      reasons.push(
        'Ese ente municipal no tiene en la tabla un órgano de control propio: la tabla lo asigna a la autoridad estatal, que puede canalizarla.',
      );
    }
  } else {
    // Directorio sin tablas de funciones: competencia declarada de cada autoridad.
    let candidates = competent;
    if (!candidates.some((item) => item.lawMatch === 'primary') && level === 'municipal') {
      const fallback = candidatesFor(directory, input, 'estatal', laws, on).filter(
        (candidate) => candidate.entityMatch === 'general',
      );
      if (fallback.length > 0) {
        candidates = fallback;
        isFallback = true;
        reasons.push(
          'No hay en el directorio un órgano de control municipal para ese ente: proponemos la autoridad estatal de la entidad, que puede canalizarla.',
        );
      }
    }
    proposed = candidates[0];
    if (proposed === undefined) {
      const found = directoryInbox(directory, input, level, on);
      if (found === null) {
        return none(
          [
            'No encontramos en el directorio una autoridad competente ni un buzón general. No se envía nada: revisa el ente o la conducta.',
          ],
          isFallback,
        );
      }
      return inbox(found, [], isFallback);
    }
  }
  const chosen = proposed;
  const alternatives = competent.filter((item) => item.authority.id !== chosen.authority.id);
  reasons.push(chosen.reason);
  reasons.push(routeReason(chosen, 'esa autoridad'));
  pushSupervisorReason(directory, chosen.authority, reasons);
  for (const alternative of alternatives) {
    const why =
      alternative.lawMatch === 'equivalent'
        ? 'por la conducta equivalente de la otra ley'
        : 'porque también atiende a ese ente';
    reasons.push(`También podría conocerla ${alternative.authority.name}, ${why}.`);
  }
  return {
    status: 'proposed',
    proposed: chosen,
    alternatives,
    isFallback,
    isStateWithoutNode,
    reasons,
  };
}
