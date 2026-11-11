// Equivalencias con el catálogo de faltas del S5 (datos/s5/equivalencias-faltas.json): para la
// conducta y la entidad de una denuncia, los artículos de la ley de responsabilidades y del código
// penal que aplican ahí. La persona elige en lenguaje llano; la autoridad ve su propia ley.
// Seguridad: el archivo se publica en el mismo origen; consultarlo no revela nada de la denuncia.
import { findEntity, primaryOffenseCode } from '@sigilo/contracts';

/** Ruta del mismo origen donde la web publica las equivalencias (ver `static-data.ts`). */
export const S5_EQUIVALENCES_PATH = '/datos/s5/equivalencias-faltas.json';

/** Archivo de equivalencias tal como lo genera `scripts/s5-equivalencias.ts`. */
export interface S5Equivalences {
  fuente: string;
  generado: string;
  leyes: string[];
  entidades: Record<string, Record<string, [number, number, string][]>>;
}

/** Artículo equivalente en el catálogo del S5. */
export interface LocalReference {
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
): LocalReference[] {
  const code = primaryOffenseCode(offenseCode) ?? offenseCode;
  return (data.entidades[stateKey]?.[code] ?? []).map(([s5Id, law, article]) => ({
    s5Id,
    law: data.leyes[law] ?? '',
    article,
  }));
}

let cached: Promise<S5Equivalences> | null = null;

/** Descarga (una vez) las equivalencias del mismo origen. */
export function loadS5Equivalences(): Promise<S5Equivalences> {
  cached ??= fetch(S5_EQUIVALENCES_PATH, {
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    mode: 'same-origin',
  }).then(async (response) => {
    if (!response.ok) throw new Error('No se pudieron cargar las equivalencias.');
    return (await response.json()) as S5Equivalences;
  });
  cached.catch(() => {
    cached = null;
  });
  return cached;
}
