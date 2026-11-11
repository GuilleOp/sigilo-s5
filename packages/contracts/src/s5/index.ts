// Equivalencias con el catálogo de faltas del S5 ya cargadas, para el servidor del nodo. La web no
// importa este módulo (el archivo pesa ~90 KB): recibe las referencias en el detalle de la denuncia.
// El catálogo completo de entes reales: `equivalenceStateKey` necesita el orden de gobierno de
// cualquier ente (una oficina federal real aplica la ley federal).
import '../entes/index.ts';
import equivalences from './equivalencias-faltas.json' with { type: 'json' };
import { equivalenceStateKey, localReferences } from './equivalences.ts';
import type { S5Equivalences, S5Reference } from './equivalences.ts';

export { equivalenceStateKey, localReferences } from './equivalences.ts';
export type { S5Equivalences, S5Reference } from './equivalences.ts';

// El archivo lo genera y valida scripts/s5-equivalencias.ts; las tuplas llegan como arreglos.
const DATA = equivalences as unknown as S5Equivalences;

/** Fuente y fecha de las equivalencias. */
export const S5_EQUIVALENCES_SOURCE = { fuente: DATA.fuente, generado: DATA.generado };

/** Artículos del catálogo del S5 que equivalen a la conducta de una denuncia en su entidad. */
export function s5ReferencesFor(
  entityId: string,
  stateCode: string,
  offenseCode: string,
): S5Reference[] {
  return localReferences(DATA, equivalenceStateKey(entityId, stateCode), offenseCode);
}
