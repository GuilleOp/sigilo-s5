// Testigo de la bitácora nacional: descarga la cabeza pendiente y el tramo nuevo, comprueba que la
// bitácora solo creció y que cada cabeza de nodo es válida, y solo entonces entrega su cofirma.
// Solo para Node.js (usa el disco): lo usan el proceso testigo del enrutador y los nodos que el
// directorio nombra testigos. Se importa desde `@sigilo/red/witness`, no desde el índice.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import {
  CosignedNationalHeadSchema,
  NATIONAL_LEDGER_MAX_PAGE,
  NETWORK_ROUTES,
  NationalLedgerEntrySchema,
  NationalLedgerPageSchema,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import type { NationalLedgerEntry, NetworkTrustAnchor } from '@sigilo/contracts';
import { findNode, verifySignedDirectory } from './directory.ts';
import { cosignNationalHead, verifyNationalExtension } from './national-ledger.ts';
import type { WitnessState } from './national-ledger.ts';
import type { FetchLike } from './node-client.ts';
import { checkNodeHistory, nodeHeadTransitions } from './node-history.ts';
import type { NodeUrlResolver } from './node-history.ts';

/** Estado del testigo guardado en disco entre vueltas. */
const WitnessStateSchema = z.object({
  lastEntry: NationalLedgerEntrySchema.nullable(),
  nodeHeads: z.record(z.string(), SignedLedgerHeadSchema),
  directorySerial: z.number().int().nonnegative(),
});

/** Dependencias de una vuelta del testigo. */
export interface WitnessDeps {
  routerUrl: string;
  witnessId: string;
  signingPrivateKey: Uint8Array;
  /** Raíz de confianza fijada (la misma que trae el navegador). */
  trust: NetworkTrustAnchor;
  statePath: string;
  fetch: FetchLike;
  /**
   * Origen de cada nodo para descargar su bitácora (por omisión, su `baseUrl` del directorio). La
   * descarga usa el mismo `fetch`.
   */
  nodeUrl?: NodeUrlResolver;
}

/** Resultado de una vuelta. */
export type WitnessOutcome =
  'cosigned' | 'up-to-date' | 'no-pending' | `refused:${string}` | 'unreachable';

const INITIAL_STATE: WitnessState = { lastEntry: null, nodeHeads: {}, directorySerial: 0 };

function loadState(path: string): WitnessState {
  if (!existsSync(path)) return INITIAL_STATE;
  return WitnessStateSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function saveState(path: string, state: WitnessState): void {
  // Se escribe aparte y se renombra para no dejar un estado a medias si el proceso se detiene.
  writeFileSync(`${path}.tmp`, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

/**
 * Hace una vuelta del testigo. Nunca cofirma lo que no verificó; ante cualquier duda se niega y lo
 * reporta (`refused:<motivo>`), sin avanzar su estado.
 */
export async function runWitnessOnce(deps: WitnessDeps): Promise<WitnessOutcome> {
  const base = deps.routerUrl.replace(/\/+$/u, '');
  const getJson = async (path: string): Promise<unknown> => {
    const response = await deps.fetch(`${base}${path}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('estatus');
    return response.json();
  };
  let directoryRaw: unknown;
  let pendingRaw: unknown;
  try {
    directoryRaw = await getJson(NETWORK_ROUTES.directory);
    pendingRaw = await getJson(NETWORK_ROUTES.nationalPending);
  } catch {
    return 'unreachable';
  }
  const directory = verifySignedDirectory(directoryRaw, deps.trust);
  if (!directory.valid) return `refused:directory-${directory.reason}`;
  if (pendingRaw === null) return 'no-pending';
  const pending = CosignedNationalHeadSchema.safeParse(pendingRaw);
  if (!pending.success) return 'refused:malformed';
  const state = loadState(deps.statePath);
  const head = pending.data.head;
  const isSame = state.lastEntry?.seq === head.seq && state.lastEntry.hash === head.hash;
  const hasMine = pending.data.cosignatures.some((item) => item.witnessId === deps.witnessId);
  if (isSame && hasMine) return 'up-to-date';
  const entries: NationalLedgerEntry[] = [];
  let from = state.lastEntry?.seq ?? 0;
  try {
    while (from <= head.seq) {
      const page = NationalLedgerPageSchema.parse(
        await getJson(
          `${NETWORK_ROUTES.nationalEntries}?from=${from}&limit=${NATIONAL_LEDGER_MAX_PAGE}`,
        ),
      );
      const wanted = page.entries.filter((entry) => entry.seq <= head.seq);
      if (wanted.length === 0) break;
      entries.push(...wanted);
      from = (wanted.at(-1)?.seq ?? head.seq) + 1;
    }
  } catch {
    return 'unreachable';
  }
  const result = isSame
    ? { valid: true as const, state }
    : verifyNationalExtension(state, entries, pending.data, directory.directory, deps.trust);
  if (!result.valid) return `refused:${result.reason}`;
  // Seguridad (H4): cada cabeza nueva de un nodo debe extender la anterior en la bitácora del
  // propio nodo; si no se puede comprobar, no se cofirma.
  if (!isSame) {
    for (const transition of nodeHeadTransitions(state, entries)) {
      const node = findNode(directory.directory, transition.nodeId);
      if (node === undefined) return 'refused:node-head';
      const check = await checkNodeHistory({
        fetch: deps.fetch,
        baseUrl: deps.nodeUrl?.(node) ?? node.baseUrl,
        previous: transition.previous,
        next: transition.next,
      });
      if (!check.valid) return `refused:node-history-${check.reason}`;
    }
  }
  const cosignature = cosignNationalHead(head, deps.witnessId, deps.signingPrivateKey);
  const response = await deps.fetch(`${base}${NETWORK_ROUTES.nationalCosignatures}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seq: head.seq, hash: head.hash, cosignature }),
  });
  if (!response.ok) return 'refused:router';
  saveState(deps.statePath, result.state);
  return 'cosigned';
}
