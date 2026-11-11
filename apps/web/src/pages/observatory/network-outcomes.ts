// Resultados agregados de la red para el observatorio: en modo red se lee el corte nacional de
// datos abiertos que arma el enrutador (por el paso del mismo origen del nodo); sin red, o si el
// corte no llega o está vacío, se usa la línea base sintética rotulada como «datos de ejemplo».
// Seguridad: solo conteos agregados ya publicados por cada nodo; ningún folio ni texto.
import { COMPLAINT_STATUSES, NETWORK_ROUTES, NationalOpenDataSchema } from '@sigilo/contracts';
import type { NationalOpenData } from '@sigilo/contracts';
import { STATUS_LABELS } from '../../lib/format.ts';
import type { NetworkState } from '../../network/directory.ts';
import { createApiClient } from '../../services/api-client.ts';
import type { ApiClient } from '../../services/api-client.ts';
import type { OutcomeCount } from './observatory-data.ts';

/** Por qué se muestran datos de ejemplo en lugar del corte nacional. */
export type ExampleReason = 'single-node' | 'unavailable' | 'no-cut' | 'empty';

/** Origen de los resultados agregados que muestra el observatorio. */
export type NetworkOutcomes =
  | { kind: 'loading' }
  | { kind: 'network'; cut: NationalOpenData }
  | { kind: 'example'; reason: ExampleReason; cut: NationalOpenData | null };

/** Denuncias del corte: celdas publicadas más suprimidas. */
export function cutTotal(cut: NationalOpenData): number {
  return cut.cells.reduce((sum, cell) => sum + cell.count, cut.suppressed);
}

/**
 * Lee el corte nacional si esta web está en una red verificada. Nunca lanza: cualquier fallo
 * (sin red, directorio que no verifica, corte ausente, respuesta inválida o corte sin ningún nodo
 * sumado ni denuncias) cae a los datos de ejemplo, con el motivo.
 */
export async function loadNetworkOutcomes(
  state: NetworkState,
  client: ApiClient = createApiClient(),
): Promise<Exclude<NetworkOutcomes, { kind: 'loading' }>> {
  if (state.kind === 'single-node') return { kind: 'example', reason: 'single-node', cut: null };
  if (state.kind !== 'verified') return { kind: 'example', reason: 'unavailable', cut: null };
  let cut: NationalOpenData;
  try {
    cut = await client.json(NETWORK_ROUTES.nationalOpenData, NationalOpenDataSchema);
  } catch {
    return { kind: 'example', reason: 'no-cut', cut: null };
  }
  const isUsable = cut.nodes.some((node) => node.status === 'included') && cutTotal(cut) > 0;
  return isUsable ? { kind: 'network', cut } : { kind: 'example', reason: 'empty', cut };
}

/**
 * Denuncias del corte por estatus, en el orden del catálogo, sin los estatus en cero. Las
 * suprimidas no son un estatus: van aparte (`suppressedRow`).
 */
export function statusTotals(cut: NationalOpenData): OutcomeCount[] {
  const totals = new Map<string, number>();
  for (const cell of cut.cells)
    totals.set(cell.status, (totals.get(cell.status) ?? 0) + cell.count);
  const rows: OutcomeCount[] = COMPLAINT_STATUSES.filter(
    (status) => (totals.get(status.key) ?? 0) > 0,
  ).map((status) => ({
    key: status.key,
    label: STATUS_LABELS[status.key],
    count: totals.get(status.key) ?? 0,
  }));
  return rows;
}

/** Fila de las denuncias suprimidas por celdas pequeñas (para el CSV), o `null` si no hay. */
export function suppressedRow(cut: NationalOpenData): OutcomeCount | null {
  return cut.suppressed > 0
    ? { key: 'suppressed', label: 'Suprimidas (celdas pequeñas)', count: cut.suppressed }
    : null;
}

/** Avisos por cada nodo que no se sumó: «sin datos de <nodo> en este corte». */
export function nodeNotes(cut: NationalOpenData): string[] {
  return cut.nodes
    .filter((node) => node.status !== 'included')
    .map((node) =>
      node.status === 'unreachable'
        ? `Sin datos de ${node.name} en este corte: no respondió.`
        : `Sin datos de ${node.name} en este corte: su archivo no cumplió las reglas de publicación.`,
    );
}

/** Explicación del motivo de los datos de ejemplo, en lectura fácil. */
export const EXAMPLE_REASONS: Readonly<Record<ExampleReason, string>> = {
  'single-node': 'Esta página no está conectada a la red de nodos.',
  unavailable: 'No pudimos comprobar el directorio de la red.',
  'no-cut': 'Todavía no hay un corte nacional de la red.',
  empty: 'El corte nacional todavía no tiene meses cerrados con denuncias.',
};
