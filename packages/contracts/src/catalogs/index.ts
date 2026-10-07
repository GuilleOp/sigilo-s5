// Catálogos públicos con los que se validan los hechos de una denuncia, y sus búsquedas por clave.
// Seguridad: las claves que llegan a los datos abiertos solo pueden salir de estas listas.
import { MUNICIPALITIES } from './municipalities.ts';
import type { MunicipalityOption } from './municipalities.ts';
import { OFFENSES } from './offenses.ts';
import type { OffenseLaw, OffenseOption } from './offenses.ts';
import { PUBLIC_ENTITIES } from './public-entities.ts';
import type { PublicEntityOption } from './public-entities.ts';
import { STATES } from './states.ts';
import type { StateOption } from './states.ts';

export * from './states.ts';
export * from './municipalities.ts';
export * from './public-entities.ts';
export * from './offenses.ts';

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

/** Ley y artículo de una clave, por ejemplo `{ law: 'LGRA', article: '52' }`. */
export function offenseReference(code: string): { law: OffenseLaw; article: string } | undefined {
  const match = /^(LGRA|CPF)-(\d+)$/u.exec(code);
  if (match === null || !isOffenseCode(code)) return undefined;
  return { law: match[1] as OffenseLaw, article: match[2] ?? '' };
}
