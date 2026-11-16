// Competencia por dependencia: quién investiga a cada ente de una entidad según su tabla de
// funciones (su órgano interno de control, «sin OIC designado → quién atiende» o pendiente), el
// distintivo que lo resume, la cobertura por estado para los datos abiertos y la agrupación de los
// entes del catálogo de la PDN (estatal centralizada, paraestatal, autónomos y cada municipio).
// Todo es puro: lo usan el panel de la operación, la página pública y los cortes de datos abiertos.
import type {
  AuthorityDirectory,
  EntityAssignment,
  FunctionHolder,
  FunctionTable,
  GovernmentLevel,
  OicCoverageRow,
} from '@sigilo/contracts';
import { isAuthorityValidOn } from './directory.ts';
import { entityAssignmentFor, holderName, matchFunction } from './function-table.ts';

/** Distintivo de la competencia de un ente. */
export type CompetenceBadge = 'keys' | 'named' | 'pending';

/** Texto de cada distintivo (nunca solo un color). */
export const COMPETENCE_BADGE_LABELS: Readonly<Record<CompetenceBadge, string>> = {
  keys: 'OIC con llaves ✓',
  named: 'OIC nombrado, falta alta',
  pending: 'pendiente',
};

/**
 * De dónde sale la competencia: `entity` (la competencia por dependencia del ente), `rule` (una
 * regla de investigación que nombra al ente), `general` (una regla para todo su orden de gobierno)
 * o `none` (nadie: pendiente).
 */
export type CompetenceSource = 'entity' | 'rule' | 'general' | 'none';

/** Competencia efectiva de un ente. */
export interface EntityCompetence {
  entityId: string;
  source: CompetenceSource;
  /** `assigned` también cuando lo asigna una regla; `general` si es la regla de todo su orden. */
  status: EntityAssignment['status'] | 'general';
  holder: FunctionHolder | null;
  holderName: string | null;
  legalBasis: string | null;
  badge: CompetenceBadge;
}

/** Ente con lo mínimo para calcular su competencia. */
export interface CompetenceEntity {
  id: string;
  level: GovernmentLevel;
}

/**
 * Indica si una regla general de investigación puede cubrir al ente: nunca la de una autoridad
 * estatal para un ente municipal (CPEUM art. 109 fr. III: todo municipio tiene su órgano interno de
 * control, y la contraloría del Ejecutivo no tiene competencia sobre él).
 */
export function isLawfulGeneralHolder(
  directory: AuthorityDirectory,
  holder: FunctionHolder,
  level: GovernmentLevel | null,
): boolean {
  if (level !== 'municipal' || holder.kind !== 'authority') return true;
  const authority = directory.authorities.find((item) => item.id === holder.authorityId);
  return authority === undefined || authority.governmentLevel === 'municipal';
}

/** Distintivo de quien atiende: con llaves vigentes, nombrado sin alta, o nadie. */
export function badgeOf(
  directory: AuthorityDirectory,
  holder: FunctionHolder | null,
  on: string,
): CompetenceBadge {
  if (holder === null) return 'pending';
  if (holder.kind !== 'authority') return 'named';
  const authority = directory.authorities.find((item) => item.id === holder.authorityId);
  return authority !== undefined && isAuthorityValidOn(authority, on) ? 'keys' : 'named';
}

/**
 * Competencia efectiva del ente en la tabla, vigente el día `on`: manda su competencia por
 * dependencia; si no tiene, la regla de investigación que lo nombra y, después, la de su orden.
 */
export function entityCompetence(
  directory: AuthorityDirectory,
  table: FunctionTable,
  entity: CompetenceEntity,
  on: string,
): EntityCompetence {
  const build = (
    source: CompetenceSource,
    status: EntityCompetence['status'],
    holder: FunctionHolder | null,
    legalBasis: string | undefined,
  ): EntityCompetence => ({
    entityId: entity.id,
    source,
    status,
    holder,
    holderName: holder === null ? null : holderName(directory, holder),
    legalBasis: legalBasis ?? null,
    badge: badgeOf(directory, holder, on),
  });
  const assignment = entityAssignmentFor(table, entity.id);
  if (assignment !== undefined) {
    return build('entity', assignment.status, assignment.holder ?? null, assignment.legalBasis);
  }
  const match = matchFunction(table, 'investigation', { entityId: entity.id, level: entity.level });
  if (match !== null && match.entityMatch === 'specific') {
    return build('rule', 'assigned', match.rule.holder, match.rule.legalBasis);
  }
  if (match !== null && isLawfulGeneralHolder(directory, match.rule.holder, entity.level)) {
    return build('general', 'general', match.rule.holder, match.rule.legalBasis);
  }
  return build('none', 'pending', null, undefined);
}

/** Cobertura de órganos internos de control de una entidad (dato abierto). */
export interface CompetenceCoverage {
  stateCode: string | null;
  tableVersion: number;
  /** Dependencias del catálogo de la entidad. */
  total: number;
  /** Con su propio órgano interno de control asignado (por dependencia o por una regla que la nombra). */
  withOic: number;
  /** «Sin OIC designado»: la atiende otra autoridad, con fundamento. */
  withoutOic: number;
  /** Cubiertas por una regla de todo su orden de gobierno (por ejemplo, la contraloría estatal). */
  general: number;
  /** Quien la atiende tiene llaves vigentes: sus denuncias llegan cifradas directo. */
  withKeys: number;
  /** Pendientes: sus denuncias van al buzón de la autoridad receptora, que la turna. */
  pending: number;
}

/** Cobertura de la tabla sobre las dependencias del catálogo, vigente el día `on`. */
export function competenceCoverage(
  directory: AuthorityDirectory,
  table: FunctionTable,
  entities: readonly CompetenceEntity[],
  on: string,
): CompetenceCoverage {
  const coverage: CompetenceCoverage = {
    stateCode: table.stateCode,
    tableVersion: table.version,
    total: entities.length,
    withOic: 0,
    withoutOic: 0,
    general: 0,
    withKeys: 0,
    pending: 0,
  };
  for (const entity of entities) {
    const competence = entityCompetence(directory, table, entity, on);
    if (competence.status === 'assigned') coverage.withOic += 1;
    if (competence.status === 'without_oic') coverage.withoutOic += 1;
    if (competence.status === 'general') coverage.general += 1;
    if (competence.status === 'pending') coverage.pending += 1;
    if (competence.badge === 'keys') coverage.withKeys += 1;
  }
  return coverage;
}

/** Porcentaje entero (redondeado) de `part` sobre `total`; 0 si no hay total. */
export function percentOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/**
 * Cobertura de órganos internos de control de cada tabla del directorio (cada entidad con nodo y
 * la federación), con los entes del catálogo de su entidad (`00` para la federal): el dato abierto
 * «cobertura de OIC por estado».
 */
export function oicCoverageRows(
  directory: AuthorityDirectory,
  entitiesOf: (stateCode: string) => readonly CompetenceEntity[],
  on: string,
): OicCoverageRow[] {
  return (directory.functionTables ?? []).map(({ table }) => {
    const coverage = competenceCoverage(directory, table, entitiesOf(table.stateCode ?? '00'), on);
    return {
      ...coverage,
      nodeId: table.nodeId,
      percentWithOic: percentOf(coverage.withOic, coverage.total),
      percentWithKeys: percentOf(coverage.withKeys, coverage.total),
      percentPending: percentOf(coverage.pending, coverage.total),
    };
  });
}

/** Grupo del ente en la pantalla de competencia. */
export interface EntityGroup {
  /** `centralizada`, `paraestatal`, `autonomo`, `municipio:<clave>` o `municipal`. */
  key: string;
  label: string;
}

const AUTONOMOUS_PATTERN =
  /^(Legislatura|Poder Legislativo|Poder Judicial|C[aá]mara de|Senado|Suprema Corte|Tribunal|Consejo de la Judicatura|Juzgados|Fiscal[ií]a General|Instituto (Nacional )?Electoral|Defensor[ií]a de los Derechos Humanos|Comisi[oó]n (Estatal |Nacional )?de (los )?Derechos Humanos|Comisi[oó]n de Transparencia|Instituto de Transparencia|Entidad Superior de Fiscalizaci[oó]n|Auditor[ií]a Superior|Universidad Aut[oó]noma|Banco de M[eé]xico|Instituto Nacional de Estad[ií]stica|Comisi[oó]n Federal de Competencia|Instituto Federal de Telecomunicaciones)/iu;

const CENTRAL_PATTERN =
  /^(Secretar[ií]a(?! Ejecutiva)|Oficial[ií]a Mayor|Oficina de la Presidencia|Jefatura de Gabinete|Coordinaci[oó]n|Unidad(?! de Servicios)|Direcci[oó]n|Procuradur[ií]a|Despacho|Gubernatura|Consejer[ií]a Jur[ií]dica|Poder Ejecutivo)/iu;

/**
 * Grupo del ente para la pantalla, el mismo para cualquier estado y para la federación. El catálogo
 * de la PDN no trae el sector de cada ente, así que la división es aproximada, por el nombre:
 * «Secretaría…», «Coordinación…» o «Unidad…» son centralizadas; poderes, tribunales, fiscalía,
 * órganos electorales, de transparencia, de derechos humanos, de fiscalización, el banco central y
 * la universidad autónoma son autónomos; lo demás (institutos, organismos, empresas y
 * fideicomisos), paraestatal. Los municipales se agrupan por municipio.
 */
export function entityGroupOf(
  entity: { name: string; level: GovernmentLevel; municipalityCode?: string },
  municipalityName: (code: string) => string | undefined = () => undefined,
): EntityGroup {
  if (entity.level === 'municipal') {
    if (entity.municipalityCode === undefined) {
      return { key: 'municipal', label: 'Municipales sin municipio en el catálogo' };
    }
    const name = municipalityName(entity.municipalityCode) ?? entity.municipalityCode;
    return { key: `municipio:${entity.municipalityCode}`, label: `Municipio de ${name}` };
  }
  const order = entity.level === 'federal' ? 'federal' : 'estatal';
  if (AUTONOMOUS_PATTERN.test(entity.name)) {
    return { key: 'autonomo', label: 'Poderes y organismos autónomos' };
  }
  if (CENTRAL_PATTERN.test(entity.name)) {
    return { key: 'centralizada', label: `Administración ${order} centralizada` };
  }
  return { key: 'paraestatal', label: 'Paraestatal (organismos, empresas y fideicomisos)' };
}

const GROUP_ORDER = ['centralizada', 'paraestatal', 'autonomo'];

/** Orden de los grupos en la pantalla: centralizada, paraestatal, autónomos y cada municipio. */
export function compareEntityGroups(left: EntityGroup, right: EntityGroup): number {
  const rank = (group: EntityGroup): number => {
    const index = GROUP_ORDER.indexOf(group.key);
    return index === -1 ? GROUP_ORDER.length : index;
  };
  return rank(left) - rank(right) || left.label.localeCompare(right.label, 'es-MX');
}

/**
 * Autoridades del directorio que pueden ser el órgano interno de control de un ente de la tabla:
 * investigadoras del mismo nodo y de la misma entidad.
 */
export function oicCandidates(
  directory: AuthorityDirectory,
  table: FunctionTable,
): AuthorityDirectory['authorities'] {
  return directory.authorities
    .filter(
      (item) =>
        item.role === 'investigating' &&
        item.nodeId === table.nodeId &&
        item.stateCode === table.stateCode,
    )
    .sort((left, right) => left.name.localeCompare(right.name, 'es-MX'));
}
