// Propuesta de la autoridad competente: función pura que el navegador ejecuta con el directorio
// verificado y los datos de la denuncia (entidad, ente y conducta), con su razonamiento en claro.
import { findEntity, findOffense, findState, offenseReference } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryAuthority,
  DirectoryNode,
  GovernmentLevel,
  OffenseLaw,
} from '@sigilo/contracts';
import { isAuthorityValidOn } from './directory.ts';

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
  /** `primary`: conoce la ley de la conducta elegida; `equivalent`: la de una conducta equivalente. */
  lawMatch: 'primary' | 'equivalent';
  /** `specific`: atiende a ese ente por nombre; `general`: a todos los de su orden y entidad. */
  entityMatch: 'specific' | 'general';
  reason: string;
}

/** Propuesta: la autoridad sugerida, alternativas y el razonamiento en lenguaje claro. */
export interface CompetentAuthorityProposal {
  status: 'proposed' | 'none';
  proposed: AuthorityCandidate | null;
  alternatives: AuthorityCandidate[];
  /** Si se propone por una regla de respaldo (ente municipal sin órgano municipal en el directorio). */
  isFallback: boolean;
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

function stateName(code: string): string {
  return findState(code)?.name ?? `la entidad ${code}`;
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
    // Las supervisoras reciben escalamientos, no denuncias directas (ADR 0007).
    if (authority.role === 'supervisory' || !isAuthorityValidOn(authority, on)) continue;
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

/**
 * Propone la autoridad competente para una denuncia con el directorio ya verificado y vigente el
 * día `on` (AAAA-MM-DD). Reglas, en orden: la conducta define la ley (LGRA o CPF); el ente define
 * el orden de gobierno; gana la autoridad que atiende al ente por nombre sobre la que atiende a
 * todo su orden en la entidad, y la ley de la conducta elegida sobre la de una equivalente. Si un
 * ente municipal no tiene órgano municipal en el directorio, se propone la autoridad estatal de la
 * entidad. Las supervisoras nunca se proponen.
 * Seguridad: es una propuesta; la persona confirma antes de cifrar y nada sale del navegador.
 */
export function proposeCompetentAuthority(
  directory: AuthorityDirectory,
  input: ComplaintRoutingInput,
  on: string,
): CompetentAuthorityProposal {
  const reasons: string[] = [];
  const offense = findOffense(input.offenseCode);
  const laws = lawsOfOffense(input.offenseCode);
  if (offense === undefined || laws === null) {
    return {
      status: 'none',
      proposed: null,
      alternatives: [],
      isFallback: false,
      reasons: ['La conducta no está en el catálogo; elige otra para poder orientarte.'],
    };
  }
  reasons.push(`«${offense.label}» es ${LAW_TEXT[laws.primary]}.`);
  const entity = findEntity(input.entityId);
  const level = input.entityLevel ?? entity?.level ?? null;
  const entityName = input.entityName ?? entity?.name ?? input.entityId;
  reasons.push(
    level === null
      ? `No encontramos «${entityName}» en el catálogo: solo cuentan las autoridades que lo atienden por nombre.`
      : `«${entityName}» es un ente del orden ${LEVEL_TEXT[level]}; los hechos ocurrieron en ${stateName(input.stateCode)}.`,
  );
  let candidates = candidatesFor(directory, input, level, laws, on);
  let isFallback = false;
  if (!candidates.some((candidate) => candidate.lawMatch === 'primary') && level === 'municipal') {
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
  const [proposed, ...alternatives] = candidates;
  if (proposed === undefined) {
    reasons.push(
      'No encontramos en el directorio una autoridad competente. No se envía nada: revisa el ente o la conducta.',
    );
    return { status: 'none', proposed: null, alternatives: [], isFallback, reasons };
  }
  reasons.push(proposed.reason);
  reasons.push(
    `Su nodo es «${proposed.node.name}». La denuncia se cifra en tu navegador con la llave de esa autoridad; el enrutador solo ve a quién va dirigida.`,
  );
  const supervisor =
    proposed.authority.supervisorId === null
      ? undefined
      : directory.authorities.find((item) => item.id === proposed.authority.supervisorId);
  if (supervisor !== undefined) {
    reasons.push(
      `Si no actúa en los plazos legales, una segunda copia cifrada llega a ${supervisor.name}.`,
    );
  }
  for (const alternative of alternatives) {
    const why =
      alternative.lawMatch === 'equivalent'
        ? 'por la conducta equivalente de la otra ley'
        : 'porque también atiende a ese ente';
    reasons.push(`También podría conocerla ${alternative.authority.name}, ${why}.`);
  }
  return { status: 'proposed', proposed, alternatives, isFallback, reasons };
}
