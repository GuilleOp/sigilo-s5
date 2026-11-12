// Enrutador ciego: entrega el sobre opaco al buzón de red del nodo de la autoridad destino y
// devuelve su respuesta cifrada. No guarda ni registra el sobre, la dirección IP ni las cabeceras.
import type { DatabaseSync } from 'node:sqlite';
import { NETWORK_ROUTES, RelayResponseSchema } from '@sigilo/contracts';
import type {
  DirectoryNode,
  NodeRegistration,
  NodeRegistrationReceipt,
  RelayRequest,
  RelayResponse,
} from '@sigilo/contracts';
import { randomBytes, toHex } from '@sigilo/core';
import {
  RELAY_AUTH_HEADER,
  hasRelayBucketSize,
  relayAuthTag,
  relayDecoyResponse,
} from '@sigilo/red';
import type { FetchLike } from '@sigilo/red';
import { readInteger } from './database.ts';

/** Resultado de un reenvío, solo para los contadores agregados (nunca el destino). */
export type RelayOutcome = 'delivered' | 'not-registered' | 'failed';

/**
 * Resultado de un intento de entrega al buzón del nodo: entregado (con la respuesta cifrada),
 * rechazado por el nodo (el sobre no le sirve: no se reintenta) o nodo no disponible por ahora
 * (sin registro, caído, sin responder a tiempo o saturado: se puede reintentar).
 */
export type DeliveryResult =
  | { kind: 'delivered'; response: RelayResponse }
  | { kind: 'rejected' }
  | { kind: 'unavailable'; reason: 'not-registered' | 'failed' };

/** Contadores del enrutador desde el último vaciado: cuántos sobres por resultado, sin más datos. */
export type RelayCounters = Record<RelayOutcome, number>;

/** Servicio de reenvío. */
export interface RelayService {
  /**
   * Reenvía el sobre; si no se pudo entregar, devuelve relleno con la misma forma. Con
   * `onUnavailable`, si el nodo no está disponible (sin registro, caído o saturado) devuelve lo que
   * esa función responda: la cola de entrega guarda ahí el sobre y da su acuse.
   */
  forward(
    node: DirectoryNode,
    relay: RelayRequest,
    onUnavailable?: () => RelayResponse,
  ): Promise<RelayResponse>;
  /**
   * Un intento de entrega, sin contar ni rellenar: lo usan `forward` y la cola de entrega.
   * Seguridad: no registra nada del sobre ni del resultado.
   */
  deliver(node: DirectoryNode, relay: RelayRequest): Promise<DeliveryResult>;
  /** Guarda un registro ya verificado si su secuencia crece; si no, devuelve `null`. */
  register(registration: NodeRegistration, today: string): NodeRegistrationReceipt | null;
  /** Devuelve y vacía los contadores agregados. */
  drainCounters(): RelayCounters;
}

/** Dependencias del reenvío. */
export interface RelayDeps {
  db: DatabaseSync;
  /** Dirección interna de cada nodo (o su `baseUrl` pública). */
  nodeUrl: (node: DirectoryNode) => string;
  fetch: FetchLike;
  /**
   * Secreto compartido con cada nodo para autenticar el reenvío ante su buzón (HMAC del cuerpo),
   * o `null` si el nodo no tiene uno configurado (su buzón rechazará el sobre).
   */
  relaySecret?: (node: DirectoryNode) => Uint8Array | null;
  /** Tiempo máximo de espera del nodo, en milisegundos. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/** Crea el servicio de reenvío. */
export function createRelayService(deps: RelayDeps): RelayService {
  const counters: RelayCounters = { delivered: 0, 'not-registered': 0, failed: 0 };
  const acceptsRelay = (nodeId: string): boolean => {
    const row = deps.db
      .prepare('SELECT accepts_relay FROM node_registrations WHERE node_id = ?')
      .get(nodeId);
    return row !== undefined && readInteger(row, 'accepts_relay') === 1;
  };
  const decoy = (outcome: RelayOutcome): RelayResponse => {
    counters[outcome] += 1;
    return relayDecoyResponse(toHex(randomBytes(8)));
  };
  const deliver = async (node: DirectoryNode, relay: RelayRequest): Promise<DeliveryResult> => {
    if (!acceptsRelay(node.id)) return { kind: 'unavailable', reason: 'not-registered' };
    try {
      // Seguridad: la petición al nodo se arma desde cero. Solo lleva el tipo de contenido y el
      // sobre ya validado: ni IP, ni agente de usuario, ni idioma, ni cookies, ni X-Forwarded-For.
      const body = JSON.stringify(relay);
      const secret = deps.relaySecret?.(node) ?? null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // Seguridad: la etiqueta prueba al nodo que el sobre pasó por el enrutador.
      if (secret !== null) headers[RELAY_AUTH_HEADER] = relayAuthTag(secret, body);
      const response = await deps.fetch(`${deps.nodeUrl(node)}${NETWORK_ROUTES.nodeInbox}`, {
        method: 'POST',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      // El buzón responde 400 solo a un sobre que no le sirve (no abre, otro nodo, otra autoridad).
      if (response.status === 400) return { kind: 'rejected' };
      if (response.status !== 200) return { kind: 'unavailable', reason: 'failed' };
      const parsed = RelayResponseSchema.safeParse(await response.json());
      if (!parsed.success || !hasRelayBucketSize(parsed.data.sealed)) {
        return { kind: 'unavailable', reason: 'failed' };
      }
      // El acuse de cola solo lo pone el enrutador, nunca el nodo.
      return { kind: 'delivered', response: { ...parsed.data, queued: null } };
    } catch {
      return { kind: 'unavailable', reason: 'failed' };
    }
  };
  return {
    deliver,
    async forward(node, relay, onUnavailable) {
      const result = await deliver(node, relay);
      if (result.kind === 'delivered') {
        counters.delivered += 1;
        return result.response;
      }
      if (result.kind === 'unavailable' && onUnavailable !== undefined) {
        counters[result.reason] += 1;
        return onUnavailable();
      }
      return decoy(result.kind === 'rejected' ? 'failed' : result.reason);
    },
    register(registration, today) {
      const row = deps.db
        .prepare('SELECT sequence FROM node_registrations WHERE node_id = ?')
        .get(registration.nodeId);
      // Seguridad: un registro viejo reenviado por otro no puede apagar ni redirigir al nodo.
      if (row !== undefined && readInteger(row, 'sequence') >= registration.sequence) return null;
      deps.db
        .prepare(
          'INSERT INTO node_registrations (node_id, sequence, standard_version, accepts_relay, registered_on) VALUES (?, ?, ?, ?, ?) ON CONFLICT (node_id) DO UPDATE SET sequence = excluded.sequence, standard_version = excluded.standard_version, accepts_relay = excluded.accepts_relay, registered_on = excluded.registered_on',
        )
        .run(
          registration.nodeId,
          registration.sequence,
          registration.standardVersion,
          registration.acceptsRelay ? 1 : 0,
          today,
        );
      return {
        nodeId: registration.nodeId,
        sequence: registration.sequence,
        acceptsRelay: registration.acceptsRelay,
        registeredOn: today,
      };
    },
    drainCounters() {
      const snapshot = { ...counters };
      counters.delivered = 0;
      counters['not-registered'] = 0;
      counters.failed = 0;
      return snapshot;
    },
  };
}
