// Una persona = una corroboración (ADR 0010): agrupa las denuncias de una etiqueta que parecen de
// la misma fuente y cuenta fuentes, no denuncias. Las señales son el tiempo, el nodo, la entrada a
// la red y el resumen difuso del relato; ninguna descarta una denuncia ni la llama «falsa».
import type { CorroborationEntry, CorroborationFlag, IndependenceSignal } from '@sigilo/contracts';
import { estimateSimilarity } from './similarity.ts';

/** Denuncia registrada en el índice, tal como la ve el índice. */
export interface IndexedComplaint {
  /** Digesto opaco del folio. */
  id: string;
  nodeId: string;
  /** Hora redondeada a 10 minutos (`AAAA-MM-DDTHH:M0Z`). */
  receivedAt: string;
  entry: CorroborationEntry;
  similarity: Uint8Array | null;
}

/** Umbrales públicos de las señales. Son del prototipo y se publican con la regla. */
export interface IndependencePolicy {
  /** Ventana de ráfaga, en minutos. */
  burstWindowMinutes: number;
  /** Similitud a partir de la cual dos relatos se consideran de la misma fuente a cualquier hora. */
  similarTextThreshold: number;
  /** Similitud que basta dentro de una ráfaga. */
  burstTextThreshold: number;
  /** Tamaño mínimo de un grupo de origen para marcarlo como posible campaña. */
  campaignMinSize: number;
  /** Lapso máximo entre la primera y la última denuncia de una posible campaña, en minutos. */
  campaignWindowMinutes: number;
}

export const DEFAULT_INDEPENDENCE_POLICY: IndependencePolicy = {
  burstWindowMinutes: 120,
  similarTextThreshold: 0.6,
  burstTextThreshold: 0.25,
  campaignMinSize: 3,
  campaignWindowMinutes: 24 * 60,
};

/** Resultado para una denuncia. */
export interface ComplaintIndependence {
  /** Índice de su grupo de origen en `origins`. */
  origin: number;
  sameOriginCount: number;
  flags: CorroborationFlag[];
  signals: IndependenceSignal[];
}

/** Resultado de una etiqueta. */
export interface IndependenceAssessment {
  complaints: number;
  independentSources: number;
  /** Grupos de origen: cada uno cuenta como una fuente. */
  origins: string[][];
  byComplaint: Map<string, ComplaintIndependence>;
}

const SIGNAL_ORDER: readonly IndependenceSignal[] = [
  'similar_text',
  'burst',
  'same_node',
  'same_entry',
];

function minutesOf(receivedAt: string): number {
  const time = Date.parse(receivedAt);
  if (Number.isNaN(time)) throw new Error('Hora de recepción inválida.');
  return time / 60_000;
}

/**
 * Señales que unen dos denuncias como posible misma fuente, o `null` si parecen independientes.
 * Reglas: relatos muy parecidos a cualquier hora; o dentro de la ráfaga, relatos parecidos; o
 * dentro de la ráfaga, mismo nodo y misma entrada cuando falta el resumen de alguno.
 */
export function linkSignals(
  left: IndexedComplaint,
  right: IndexedComplaint,
  policy: IndependencePolicy = DEFAULT_INDEPENDENCE_POLICY,
): IndependenceSignal[] | null {
  const isBurst =
    Math.abs(minutesOf(left.receivedAt) - minutesOf(right.receivedAt)) <= policy.burstWindowMinutes;
  const isSameNode = left.nodeId === right.nodeId;
  const isSameEntry = isSameNode && left.entry === right.entry;
  const similarity =
    left.similarity !== null && right.similarity !== null
      ? estimateSimilarity(left.similarity, right.similarity)
      : null;
  const isLinked =
    (similarity !== null && similarity >= policy.similarTextThreshold) ||
    (isBurst && similarity !== null && similarity >= policy.burstTextThreshold) ||
    (isBurst && similarity === null && isSameEntry);
  if (!isLinked) return null;
  const signals: IndependenceSignal[] = [];
  if (similarity !== null && similarity >= policy.burstTextThreshold) signals.push('similar_text');
  if (isBurst) signals.push('burst');
  if (isSameNode) signals.push('same_node');
  if (isSameEntry) signals.push('same_entry');
  return signals;
}

/**
 * Agrupa las denuncias de una misma etiqueta en grupos de origen (componentes conexos de las
 * uniones de `linkSignals`) y marca cada grupo: «posible mismo origen» con dos o más denuncias y
 * «posible campaña» con `campaignMinSize` o más dentro de `campaignWindowMinutes`.
 * Lanza error si dos denuncias repiten `id` o una hora no es válida.
 */
export function assessIndependence(
  complaints: readonly IndexedComplaint[],
  policy: IndependencePolicy = DEFAULT_INDEPENDENCE_POLICY,
): IndependenceAssessment {
  const ids = complaints.map((complaint) => complaint.id);
  if (new Set(ids).size !== ids.length) throw new Error('Hay denuncias repetidas.');
  const parent = complaints.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] ?? root;
    parent[index] = root;
    return root;
  };
  const signals = complaints.map(() => new Set<IndependenceSignal>());
  for (let i = 0; i < complaints.length; i += 1) {
    for (let j = i + 1; j < complaints.length; j += 1) {
      const left = complaints[i];
      const right = complaints[j];
      if (left === undefined || right === undefined) continue;
      const link = linkSignals(left, right, policy);
      if (link === null) continue;
      for (const signal of link) {
        signals[i]?.add(signal);
        signals[j]?.add(signal);
      }
      const rootLeft = find(i);
      const rootRight = find(j);
      if (rootLeft !== rootRight)
        parent[Math.max(rootLeft, rootRight)] = Math.min(rootLeft, rootRight);
    }
  }
  const groups = new Map<number, number[]>();
  complaints.forEach((_, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  const origins: string[][] = [];
  const byComplaint = new Map<string, ComplaintIndependence>();
  for (const members of groups.values()) {
    const minutes = members.map((index) => minutesOf(complaints[index]?.receivedAt ?? ''));
    const span = Math.max(...minutes) - Math.min(...minutes);
    const flags: CorroborationFlag[] = [];
    if (members.length >= 2) flags.push('possible_same_origin');
    if (members.length >= policy.campaignMinSize && span <= policy.campaignWindowMinutes) {
      flags.push('possible_campaign');
    }
    const origin = origins.length;
    origins.push(members.map((index) => complaints[index]?.id ?? ''));
    for (const index of members) {
      byComplaint.set(complaints[index]?.id ?? '', {
        origin,
        sameOriginCount: members.length,
        flags: [...flags],
        signals: SIGNAL_ORDER.filter((signal) => signals[index]?.has(signal)),
      });
    }
  }
  return {
    complaints: complaints.length,
    independentSources: origins.length,
    origins,
    byComplaint,
  };
}
