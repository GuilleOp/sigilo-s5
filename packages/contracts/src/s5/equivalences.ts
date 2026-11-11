// Lectura de las equivalencias con el catálogo de faltas del S5 (equivalencias-faltas.json, que
// genera scripts/s5-equivalencias.ts): para la conducta y la entidad de una denuncia, los
// artículos de la ley de responsabilidades y del código penal que aplican ahí, con su id del S5.
import { findEntity, primaryOffenseCode } from '../catalogs/index.ts';

/** Archivo de equivalencias tal como lo genera `scripts/s5-equivalencias.ts`. */
export interface S5Equivalences {
  fuente: string;
  generado: string;
  leyes: string[];
  entidades: Record<string, Record<string, [number, number, string][]>>;
}

/** Artículo equivalente en el catálogo de faltas del S5. */
export interface S5Reference {
  /** Identificador de la entrada en el catálogo de faltas del S5. */
  s5Id: number;
  law: string;
  article: string;
}

/**
 * Clave de entidad de las equivalencias: `federal` si la oficina es federal (aplican la LGRA y el
 * CPF); si no, la clave INEGI de la entidad de los hechos.
 */
export function equivalenceStateKey(entityId: string, stateCode: string): string {
  return findEntity(entityId)?.level === 'federal' ? 'federal' : stateCode;
}

/** Artículos equivalentes de la conducta en la entidad; vacío si no hay equivalencia. */
export function localReferences(
  data: S5Equivalences,
  stateKey: string,
  offenseCode: string,
): S5Reference[] {
  const code = primaryOffenseCode(offenseCode) ?? offenseCode;
  return (data.entidades[stateKey]?.[code] ?? []).map(([s5Id, law, article]) => ({
    s5Id,
    law: data.leyes[law] ?? '',
    article,
  }));
}
