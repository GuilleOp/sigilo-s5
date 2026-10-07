// Búsqueda local en los catálogos. Seguridad: los catálogos se cargan completos y se filtran en el
// navegador, así que ninguna petición revela lo que la persona elige o escribe.
import { MUNICIPALITIES } from './municipalities.ts';
import type { MunicipalityOption } from './municipalities.ts';
import { OFFENSES } from './offenses.ts';
import type { OffenseOption } from './offenses.ts';
import { PUBLIC_ENTITIES } from './public-entities.ts';
import type { PublicEntityOption } from './public-entities.ts';
import { STATES } from './states.ts';

/** Minúsculas, sin acentos y sin espacios sobrantes, para comparar sin importar cómo se escriba. */
export function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
}

/**
 * Filtra elementos cuyo texto contiene todas las palabras de la consulta.
 * Con una consulta vacía devuelve todos.
 */
export function filterByQuery<T>(
  items: readonly T[],
  query: string,
  textOf: (item: T) => string,
): T[] {
  const terms = foldForSearch(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [...items];
  return items.filter((item) => {
    const haystack = foldForSearch(textOf(item));
    return terms.every((term) => haystack.includes(term));
  });
}

/** Municipios disponibles para la entidad (vacío si solo se admite la entidad). */
export function municipalitiesOf(stateCode: string): MunicipalityOption[] {
  return MUNICIPALITIES.filter((municipality) => municipality.stateCode === stateCode);
}

/** Nombre de la entidad por clave, o la clave si no existe. */
export function stateName(code: string): string {
  return STATES.find((state) => state.code === code)?.name ?? code;
}

/** Nombre del municipio por claves, o `undefined` si no existe. */
export function municipalityName(stateCode: string, code: string | undefined): string | undefined {
  if (code === undefined) return undefined;
  return MUNICIPALITIES.find((item) => item.stateCode === stateCode && item.code === code)?.name;
}

/** Conducta por clave. */
export function findOffense(code: string): OffenseOption | undefined {
  return OFFENSES.find((offense) => offense.code === code);
}

/** Ente público por identificador. */
export function findEntity(id: string): PublicEntityOption | undefined {
  return PUBLIC_ENTITIES.find((entity) => entity.id === id);
}
