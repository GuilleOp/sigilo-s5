// Tarea periódica: recoge la cabeza firmada de cada nodo en su ruta pública (`GET ledgerHead` del
// Estándar S5, que el servidor de referencia ya sirve) y emite la cabeza nacional si hubo cambios.
import { ROUTES, SignedLedgerHeadSchema } from '@sigilo/contracts';
import type { AuthorityDirectory, DirectoryNode } from '@sigilo/contracts';
import type { FetchLike } from '@sigilo/red';
import type { NationalLedgerService } from './national-ledger-service.ts';

/** Resultado de una vuelta de recolección, por nodo. */
export type CollectionResult = Record<
  string,
  'recorded' | 'unchanged' | 'rejected' | 'unreachable'
>;

/** Dependencias de la recolección. */
export interface CollectorDeps {
  national: NationalLedgerService;
  directory: () => AuthorityDirectory;
  nodeUrl: (node: DirectoryNode) => string;
  fetch: FetchLike;
  today: () => string;
  timeoutMs?: number;
}

/**
 * Recoge las cabezas de todos los nodos del directorio y emite la cabeza nacional si la bitácora
 * creció. Un nodo caído o con una cabeza inválida no detiene a los demás.
 */
export async function collectNodeHeads(deps: CollectorDeps): Promise<CollectionResult> {
  const result: CollectionResult = {};
  const directory = deps.directory();
  for (const node of directory.nodes) {
    let raw: unknown;
    try {
      const response = await deps.fetch(`${deps.nodeUrl(node)}${ROUTES.ledgerHead}`, {
        redirect: 'error',
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      });
      if (!response.ok) throw new Error('estatus');
      raw = await response.json();
    } catch {
      result[node.id] = 'unreachable';
      continue;
    }
    const head = SignedLedgerHeadSchema.safeParse(raw);
    if (!head.success) {
      result[node.id] = 'rejected';
      continue;
    }
    try {
      result[node.id] = (await deps.national.recordNodeHead(node, head.data, deps.today())).status;
    } catch {
      result[node.id] = 'rejected';
    }
  }
  deps.national.emitHead(directory.serial, deps.today());
  return result;
}
