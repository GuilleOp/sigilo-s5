// Seguimiento por la red: el folio se busca a la vez en todos los nodos del directorio, así nadie
// en medio sabe en cuál está. Con el recibo correcto, solo un nodo responde con la denuncia.
import type {
  AuthorityDirectory,
  DirectoryAuthority,
  DirectoryNode,
  MailboxMessage,
  TrackingCredentials,
  TrackingView,
} from '@sigilo/contracts';
import type { PinnedKeys } from '../config/pinned-keys.ts';
import { decodeReporterThread } from '../crypto/tracking.ts';
import type { DecodedMessage, TrackingSession } from '../crypto/tracking.ts';
import { ApiRequestError } from '../services/api-client.ts';
import { destinationFor, keysForDestination, receivingAuthorityPerNode } from './network-keys.ts';
import { createRelayApi } from './relay-api.ts';
import type { RelaySender, ReporterApi } from './relay-api.ts';

/** Denuncia encontrada en un nodo de la red. */
export interface NetworkTrackingResult {
  view: TrackingView;
  node: DirectoryNode;
  /** Operaciones hacia ese nodo (para responder y recargar). */
  api: ReporterApi;
  /** Llaves del nodo (comprobante) y de la autoridad con la que se verificaron los mensajes. */
  keys: PinnedKeys;
  /** Autoridades del nodo que reciben denuncias: una de ellas firmó los mensajes. */
  authorities: DirectoryAuthority[];
}

/**
 * Busca el folio en todos los nodos a la vez. Devuelve el nodo que lo tiene o `null` si ninguno lo
 * reconoce. Lanza `ApiRequestError` de conexión si ningún nodo respondió.
 * Seguridad: la búsqueda pide a todos los nodos con la misma forma, así que el enrutador no sabe
 * cuál tiene la denuncia; la respuesta de cada nodo llega cifrada.
 */
export async function trackAcrossNetwork(
  directory: AuthorityDirectory,
  credentials: TrackingCredentials,
  send: RelaySender,
): Promise<NetworkTrackingResult | null> {
  const targets = receivingAuthorityPerNode(directory);
  const attempts = await Promise.allSettled(
    targets.map(async (authority) => {
      const destination = destinationFor(directory, authority.id);
      const api = createRelayApi({ authorityId: authority.id, node: destination.node }, send);
      const view = await api.track(credentials);
      return { view, destination, api };
    }),
  );
  let isAnyAnswer = false;
  for (const attempt of attempts) {
    if (attempt.status === 'fulfilled') {
      const { view, destination, api } = attempt.value;
      const authorities = directory.authorities.filter(
        (item) => item.nodeId === destination.node.id && item.role !== 'supervisory',
      );
      return {
        view,
        node: destination.node,
        api,
        keys: keysForDestination(destination),
        authorities,
      };
    }
    const reason: unknown = attempt.reason;
    if (reason instanceof ApiRequestError && reason.code === 'not_found') isAnyAnswer = true;
  }
  if (!isAnyAnswer) throw new ApiRequestError('network', 0);
  return null;
}

/**
 * Descifra los mensajes probando la llave de firma de cada autoridad del nodo, y devuelve también
 * las llaves de la autoridad que firmó (para responderle a ella).
 * Seguridad: un mensaje solo se muestra si lo firmó una autoridad del directorio verificado.
 */
export async function decodeNetworkThread(
  directory: AuthorityDirectory,
  result: NetworkTrackingResult,
  messages: readonly MailboxMessage[],
  session: TrackingSession,
): Promise<{ messages: DecodedMessage[]; replyKeys: PinnedKeys | null }> {
  let best: { messages: DecodedMessage[]; keys: PinnedKeys; opened: number } | null = null;
  for (const authority of result.authorities) {
    const keys = keysForDestination(destinationFor(directory, authority.id));
    const decoded = await decodeReporterThread(messages, session, keys);
    const opened = decoded.filter((message) => message.state === 'opened').length;
    if (best === null || opened > best.opened) best = { messages: decoded, keys, opened };
  }
  if (best === null) return { messages: [], replyKeys: null };
  return { messages: best.messages, replyKeys: best.opened > 0 ? best.keys : null };
}
