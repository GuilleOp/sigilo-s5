// Verificación de la bitácora pública: cadena de hashes completa contra la cabeza firmada y, si se
// tiene, contra un anclaje publicado fuera del servidor (`anchors/AAAA-MM-DD.json`).
import { LEDGER_GENESIS_HASH, LedgerAnchorSchema } from '@sigilo/contracts';
import type { LedgerAnchor, LedgerEvent, LedgerPage, SignedLedgerHead } from '@sigilo/contracts';
import { verifyChain, verifyLedgerHead } from '@sigilo/core';
import type { ChainFailureReason } from '@sigilo/core';

/** Resultado de la verificación, listo para explicarse en lenguaje claro. */
export type LedgerVerification =
  | { status: 'valid'; eventCount: number; head: SignedLedgerHead; events: readonly LedgerEvent[] }
  | { status: 'bad-head-signature'; head: SignedLedgerHead }
  | {
      status: 'broken-chain';
      eventCount: number;
      failedAtSeq: number;
      reason: ChainFailureReason;
    }
  | { status: 'head-mismatch'; eventCount: number; head: SignedLedgerHead };

/** Tamaño de página al descargar la bitácora (máximo del servidor: 500). */
export const LEDGER_PAGE_SIZE = 200;

/**
 * Evalúa eventos y cabeza: firma de la cabeza con la llave fijada, cadena desde el génesis y
 * coincidencia del último eslabón con la cabeza firmada.
 */
export function evaluateLedger(
  events: readonly LedgerEvent[],
  head: SignedLedgerHead,
  serverPublicKey: Uint8Array,
): LedgerVerification {
  if (!verifyLedgerHead(head, serverPublicKey)) return { status: 'bad-head-signature', head };
  const chain = verifyChain(events);
  if (!chain.valid) {
    return {
      status: 'broken-chain',
      eventCount: events.length,
      failedAtSeq: chain.failedAtSeq,
      reason: chain.reason,
    };
  }
  const last = events.at(-1);
  const matches =
    last === undefined
      ? head.seq === 0 && head.hash === LEDGER_GENESIS_HASH
      : last.seq === head.seq && last.hash === head.hash;
  return matches
    ? { status: 'valid', eventCount: events.length, head, events }
    : { status: 'head-mismatch', eventCount: events.length, head };
}

/**
 * Descarga la bitácora por páginas hasta la secuencia de la cabeza y la evalúa.
 * `onProgress` recibe cuántos eventos van descargados.
 */
export async function downloadAndVerifyLedger(
  fetchHead: () => Promise<SignedLedgerHead>,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
  serverPublicKey: Uint8Array,
  onProgress: (downloaded: number) => void = () => undefined,
): Promise<LedgerVerification> {
  const head = await fetchHead();
  const events: LedgerEvent[] = [];
  const isGenesis = head.hash === LEDGER_GENESIS_HASH;
  if (!isGenesis) {
    // Se descarga hasta la secuencia de la cabeza; eventos posteriores se ignoran.
    while (events.length <= head.seq) {
      const page = await fetchPage(events.length, LEDGER_PAGE_SIZE);
      const before = events.length;
      for (const event of page.events) {
        if (event.seq <= head.seq) events.push(event);
      }
      onProgress(events.length);
      // Sin avance (página vacía o solo eventos posteriores a la cabeza): se detiene.
      if (events.length === before) break;
    }
  }
  return evaluateLedger(events, head, serverPublicKey);
}

/** Resultado de comparar la bitácora descargada con un anclaje publicado. */
export type AnchorComparison =
  | { status: 'bad-signature'; anchor: LedgerAnchor }
  | { status: 'matches'; anchor: LedgerAnchor }
  | { status: 'missing'; anchor: LedgerAnchor }
  | { status: 'mismatch'; anchor: LedgerAnchor };

/** Resultado de comparar contra todos los anclajes pegados. */
export type AnchorsComparison =
  { status: 'invalid' } | { status: 'compared'; results: readonly AnchorComparison[] };

/** Máximo de anclajes que se comparan de una vez. */
export const MAX_ANCHORS = 400;

/**
 * Separa el texto en valores JSON de primer nivel: un arreglo, un objeto, o varios objetos uno
 * tras otro (separados por espacios, saltos de línea o comas). Devuelve `null` si sobra texto.
 */
function splitJsonValues(text: string): string[] | null {
  const values: string[] = [];
  let depth = 0;
  let start = -1;
  let isInString = false;
  let isEscaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (isInString) {
      if (isEscaped) isEscaped = false;
      else if (char === '\\') isEscaped = true;
      else if (char === '"') isInString = false;
      continue;
    }
    if (char === '"') {
      if (depth === 0) return null;
      isInString = true;
    } else if (char === '{' || char === '[') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth < 0) return null;
      if (depth === 0) values.push(text.slice(start, index + 1));
    } else if (depth === 0 && char !== undefined && !/[\s,]/u.test(char)) {
      return null;
    }
  }
  return depth === 0 ? values : null;
}

/**
 * Lee uno o varios anclajes (`LedgerAnchorSchema`): el contenido de un archivo, varios archivos
 * pegados uno tras otro o un arreglo JSON. Devuelve `null` si alguno no es válido o no hay ninguno.
 */
export function parseLedgerAnchors(text: string): LedgerAnchor[] | null {
  const parts = splitJsonValues(text);
  if (parts === null || parts.length === 0) return null;
  const anchors: LedgerAnchor[] = [];
  try {
    for (const part of parts) {
      const value: unknown = JSON.parse(part);
      for (const item of Array.isArray(value) ? (value as unknown[]) : [value]) {
        const parsed = LedgerAnchorSchema.safeParse(item);
        if (!parsed.success) return null;
        anchors.push(parsed.data);
      }
    }
  } catch {
    return null;
  }
  return anchors.length === 0 || anchors.length > MAX_ANCHORS ? null : anchors;
}

/**
 * Compara una cadena ya verificada con un anclaje: la cabeza anclada debe estar firmada por la
 * llave fijada del servidor y la cadena debe contener un evento con su misma secuencia y hash.
 * Seguridad: si el servidor reescribió o borró eventos después del anclaje, el resultado es
 * `mismatch` o `missing` aunque la cadena nueva esté bien encadenada.
 */
export function compareWithAnchor(
  events: readonly LedgerEvent[],
  anchor: LedgerAnchor,
  serverPublicKey: Uint8Array,
): AnchorComparison {
  if (!verifyLedgerHead(anchor.head, serverPublicKey)) return { status: 'bad-signature', anchor };
  if (anchor.head.hash === LEDGER_GENESIS_HASH) return { status: 'matches', anchor };
  const event = events.find((candidate) => candidate.seq === anchor.head.seq);
  if (event === undefined) return { status: 'missing', anchor };
  return event.hash === anchor.head.hash
    ? { status: 'matches', anchor }
    : { status: 'mismatch', anchor };
}

/** Compara la cadena verificada con todos los anclajes del texto pegado. */
export function compareWithAnchors(
  events: readonly LedgerEvent[],
  anchorsText: string,
  serverPublicKey: Uint8Array,
): AnchorsComparison {
  const anchors = parseLedgerAnchors(anchorsText);
  if (anchors === null) return { status: 'invalid' };
  return {
    status: 'compared',
    results: anchors.map((anchor) => compareWithAnchor(events, anchor, serverPublicKey)),
  };
}
