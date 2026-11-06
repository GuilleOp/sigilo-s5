// Historia de un nodo entre dos de sus cabezas (H4): antes de aceptar una cabeza nueva, el
// enrutador y cada testigo descargan el tramo de la bitácora del nodo (`GET ledgerEvents`) y
// comprueban que la cadena de `prevHash` va de la cabeza anterior a la nueva. Así una historia
// reescrita con una secuencia mayor ya no pasa por una cabeza que «avanza».
import { LEDGER_GENESIS_HASH, LedgerPageSchema, ROUTES } from '@sigilo/contracts';
import type {
  DirectoryNode,
  LedgerEvent,
  NationalLedgerEntry,
  SignedLedgerHead,
} from '@sigilo/contracts';
import { computeEventHash, verifyChain } from '@sigilo/core';
import { compareNodeHeads } from './national-ledger.ts';
import type { WitnessState } from './national-ledger.ts';
import type { FetchLike } from './node-client.ts';

/** Eventos máximos de un tramo; uno más largo no se verifica y se rechaza. */
export const NODE_HISTORY_MAX_EVENTS = 20_000;
/** Página que se pide al nodo (el máximo del Estándar S5). */
export const NODE_HISTORY_PAGE = 500;

/** Motivo por el que no se pudo probar que la cabeza nueva extiende la anterior. */
export type NodeHistoryFailure =
  'unreachable' | 'malformed' | 'too-long' | 'start' | 'chain' | 'end';

/** Resultado de la comprobación de historia. */
export type NodeHistoryCheck = { valid: true } | { valid: false; reason: NodeHistoryFailure };

/**
 * Indica si `events` prueba que `next` extiende `previous`: si la anterior es el génesis, la
 * cadena empieza en la secuencia 0 desde el hash de ceros; si no, el primer evento es exactamente
 * el de la cabeza anterior (secuencia y hash, recalculado). En ambos casos los enlaces y los hashes
 * se recalculan y el último evento es el de la cabeza nueva. No verifica firmas de las cabezas.
 */
export function verifyNodeHistorySegment(
  previous: SignedLedgerHead,
  next: SignedLedgerHead,
  events: readonly LedgerEvent[],
): NodeHistoryCheck {
  if (events.length > NODE_HISTORY_MAX_EVENTS + 1) return { valid: false, reason: 'too-long' };
  let tail: readonly LedgerEvent[] = events;
  let anchor: LedgerEvent | null = null;
  if (previous.hash !== LEDGER_GENESIS_HASH) {
    const [first, ...rest] = events;
    if (
      first === undefined ||
      first.seq !== previous.seq ||
      first.hash !== previous.hash ||
      computeEventHash(first) !== first.hash
    ) {
      return { valid: false, reason: 'start' };
    }
    anchor = first;
    tail = rest;
  }
  if (!verifyChain(tail, anchor).valid) return { valid: false, reason: 'chain' };
  const last = tail.at(-1) ?? anchor;
  if (last === null || last.seq !== next.seq || last.hash !== next.hash) {
    return { valid: false, reason: 'end' };
  }
  return { valid: true };
}

/**
 * Descarga del nodo los eventos de `from` a `to` (inclusive) en páginas de `ledgerEvents`.
 * Devuelve `null` si el nodo no responde o responde algo que no es una página válida.
 */
export async function fetchNodeHistory(
  fetch: FetchLike,
  baseUrl: string,
  from: number,
  to: number,
): Promise<LedgerEvent[] | null> {
  const base = baseUrl.replace(/\/+$/u, '');
  const events: LedgerEvent[] = [];
  let cursor = from;
  try {
    while (cursor <= to) {
      const response = await fetch(
        `${base}${ROUTES.ledgerEvents}?from=${cursor}&limit=${NODE_HISTORY_PAGE}`,
        { redirect: 'error', signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return null;
      const page = LedgerPageSchema.safeParse(await response.json());
      if (!page.success) return null;
      const wanted = page.data.events.filter((event) => event.seq >= cursor && event.seq <= to);
      if (wanted.length === 0) break;
      events.push(...wanted);
      cursor = (wanted.at(-1)?.seq ?? to) + 1;
    }
  } catch {
    return null;
  }
  return events;
}

/**
 * Descarga y verifica el tramo entre la cabeza anterior y la nueva. Con `previous` en `null` no
 * hay nada que comparar (primera cabeza vista) y es válido; un nodo que no responde no se puede
 * verificar y el resultado es inválido.
 * Seguridad: quien llama debe rechazar la cabeza si el resultado no es válido.
 */
export async function checkNodeHistory(input: {
  fetch: FetchLike;
  baseUrl: string;
  previous: SignedLedgerHead | null;
  next: SignedLedgerHead;
}): Promise<NodeHistoryCheck> {
  const { previous, next } = input;
  if (previous === null) return { valid: true };
  const from = previous.hash === LEDGER_GENESIS_HASH ? 0 : previous.seq;
  if (next.seq - from > NODE_HISTORY_MAX_EVENTS) return { valid: false, reason: 'too-long' };
  const events = await fetchNodeHistory(input.fetch, input.baseUrl, from, next.seq);
  if (events === null) return { valid: false, reason: 'unreachable' };
  return verifyNodeHistorySegment(previous, next, events);
}

/** Paso de una cabeza de nodo a la siguiente dentro de un tramo de la bitácora nacional. */
export interface NodeHeadTransition {
  nodeId: string;
  previous: SignedLedgerHead;
  next: SignedLedgerHead;
}

/**
 * Pasos de cabeza que un testigo debe verificar contra la bitácora de cada nodo: para cada
 * entrada `node.head` nueva, la cabeza anterior conocida del mismo nodo (de su estado o de una
 * entrada previa del tramo) y la nueva. Omite la primera cabeza vista de un nodo y las que no
 * avanzan (esas las rechaza `verifyNationalExtension`).
 */
export function nodeHeadTransitions(
  state: WitnessState,
  entries: readonly NationalLedgerEntry[],
): NodeHeadTransition[] {
  const known: Record<string, SignedLedgerHead> = { ...state.nodeHeads };
  const anchorSeq = state.lastEntry?.seq ?? -1;
  const transitions: NodeHeadTransition[] = [];
  for (const entry of entries) {
    if (entry.seq <= anchorSeq || entry.type !== 'node.head') continue;
    const previous = known[entry.nodeId] ?? null;
    if (previous !== null && compareNodeHeads(previous, entry.nodeHead) === 'new') {
      transitions.push({ nodeId: entry.nodeId, previous, next: entry.nodeHead });
    }
    known[entry.nodeId] = entry.nodeHead;
  }
  return transitions;
}

/** Origen del nodo para descargar su bitácora. */
export type NodeUrlResolver = (node: DirectoryNode) => string;
