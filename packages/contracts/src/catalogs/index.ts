// Catálogos públicos con los que se validan los hechos de una denuncia, y sus búsquedas por clave.
// Seguridad: las claves que llegan a los datos abiertos solo pueden salir de estas listas.
import { MUNICIPALITIES } from './municipalities.ts';
import type { MunicipalityOption } from './municipalities.ts';
import { OFFENSES } from './offenses.ts';
import type { OffenseLaw, OffenseOption } from './offenses.ts';
import { PUBLIC_ENTITIES } from './public-entities.ts';
import type { PublicEntityOption } from './public-entities.ts';
import { STATES } from './states.ts';
import type { OffenseSeverity } from '../procedure.ts';
import type { StateOption } from './states.ts';

export * from './states.ts';
export * from './municipalities.ts';
export * from './public-entities.ts';
export * from './offenses.ts';
export * from './procedure.ts';
export * from './rest-days.ts';
export * from './escalation.ts';

const STATE_BY_CODE: ReadonlyMap<string, StateOption> = new Map(
  STATES.map((state) => [state.code, state]),
);
const ENTITY_BY_ID: ReadonlyMap<string, PublicEntityOption> = new Map(
  PUBLIC_ENTITIES.map((entity) => [entity.id, entity]),
);
const OFFENSE_BY_CODE: ReadonlyMap<string, OffenseOption> = new Map(
  OFFENSES.flatMap((offense) =>
    [offense.code, ...offense.equivalentCodes].map((code) => [code, offense] as const),
  ),
);

/** Entidad federativa por clave INEGI, o `undefined` si no existe. */
export function findState(code: string): StateOption | undefined {
  return STATE_BY_CODE.get(code);
}

/** Indica si la clave es de una entidad federativa del catálogo. */
export function isStateCode(code: string): boolean {
  return STATE_BY_CODE.has(code);
}

/** Municipios del catálogo para la entidad (vacío si solo se admite la entidad). */
export function municipalitiesOf(stateCode: string): MunicipalityOption[] {
  return MUNICIPALITIES.filter((municipality) => municipality.stateCode === stateCode);
}

/** Municipio por claves de entidad y municipio, o `undefined` si no existe. */
export function findMunicipality(stateCode: string, code: string): MunicipalityOption | undefined {
  return MUNICIPALITIES.find((item) => item.stateCode === stateCode && item.code === code);
}

/** Indica si el municipio existe en el catálogo y pertenece a la entidad. */
export function isMunicipalityOf(stateCode: string, code: string): boolean {
  return findMunicipality(stateCode, code) !== undefined;
}

/** Ente público por identificador, o `undefined` si no existe. */
export function findEntity(id: string): PublicEntityOption | undefined {
  return ENTITY_BY_ID.get(id);
}

/** Indica si el identificador es de un ente del catálogo. */
export function isEntityId(id: string): boolean {
  return ENTITY_BY_ID.has(id);
}

/** Conducta por clave principal o equivalente, o `undefined` si no existe. */
export function findOffense(code: string): OffenseOption | undefined {
  return OFFENSE_BY_CODE.get(code);
}

/** Indica si la clave es de una conducta del catálogo (principal o equivalente). */
export function isOffenseCode(code: string): boolean {
  return OFFENSE_BY_CODE.has(code);
}

/**
 * Clave principal de una conducta: la misma si ya es principal y la de la LGRA si es una
 * equivalente del CPF; `undefined` si la clave no existe.
 * Seguridad: los datos abiertos agregan por esta clave para que una misma conducta no se reparta
 * en dos celdas más pequeñas.
 */
export function primaryOffenseCode(code: string): string | undefined {
  return OFFENSE_BY_CODE.get(code)?.code;
}

/** Sufijo de un artículo adicionado, como lo escribe la ley. */
const ARTICLE_SUFFIXES: Readonly<Record<string, string>> = {
  BIS: 'Bis',
  TER: 'Ter',
  QUATER: 'Quáter',
};

/**
 * Ley y artículo de una clave, por ejemplo `{ law: 'LGRA', article: '52' }` o, para un artículo
 * adicionado, `{ law: 'LGRA', article: '63 Bis' }` (clave `LGRA-63-BIS`).
 */
export function offenseReference(code: string): { law: OffenseLaw; article: string } | undefined {
  const match = /^(LGRA|CPF)-(\d+)(?:-(BIS|TER|QUATER))?$/u.exec(code);
  if (match === null || !isOffenseCode(code)) return undefined;
  const suffix = match[3] === undefined ? '' : ` ${ARTICLE_SUFFIXES[match[3]] ?? ''}`;
  return { law: match[1] as OffenseLaw, article: `${match[2] ?? ''}${suffix}` };
}

/**
 * Gravedad legal de una conducta según el artículo de su clave principal: LGRA arts. 49 y 50 (no
 * graves), 51 a 64 Quáter (graves) y 65 a 73 (de particulares); el Código Penal Federal, delitos por
 * hechos de corrupción. `undefined` si la clave no existe.
 */
export function offenseSeverity(code: string): OffenseSeverity | undefined {
  const primary = primaryOffenseCode(code);
  const reference = primary === undefined ? undefined : offenseReference(primary);
  if (reference === undefined) return undefined;
  if (reference.law === 'CPF') return 'crime';
  const article = Number.parseInt(reference.article, 10);
  if (article <= 50) return 'non_serious';
  return article <= 64 ? 'serious' : 'private_party';
}

/** Quién comete la conducta: una persona servidora pública o un particular. */
export type OffenseActor = 'public-servant' | 'private-party';

/** Conductas de particulares fuera de LGRA arts. 65 a 72 (que son todas de particulares). */
const PRIVATE_PARTY_CRIMES: ReadonlySet<string> = new Set(['CPF-222-BIS']);

/**
 * Quién comete la conducta según su clave principal: LGRA arts. 65 a 72 y el cohecho a servidores
 * públicos extranjeros son de particulares; lo demás, de personas servidoras públicas. Sirve para
 * mostrar menos opciones a quien denuncia; `undefined` si la clave no existe.
 */
export function offenseActor(code: string): OffenseActor | undefined {
  const primary = primaryOffenseCode(code);
  if (primary === undefined) return undefined;
  if (PRIVATE_PARTY_CRIMES.has(primary)) return 'private-party';
  return offenseSeverity(primary) === 'private_party' ? 'private-party' : 'public-servant';
}
