// Cola de entrega del enrutador («store and forward»): si el nodo destino no responde, el sobre
// CERRADO (cifrado hacia la llave del nodo, que el enrutador no tiene) se guarda y se reintenta con
// espera exponencial hasta entregarlo o hasta que vence. Al entregarlo o vencer se borra.
import type { DatabaseSync } from 'node:sqlite';
import { RELAY_QUEUE_TTL_DAYS, RelayRequestSchema } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryNode,
  RelayQueueReceipt,
  RelayRequest,
} from '@sigilo/contracts';
import { randomBytes, toDayDate, toHex } from '@sigilo/core';
import { findNode, relayEnvelopeDigest, signRelayQueueReceipt } from '@sigilo/red';
import { readInteger, readText } from './database.ts';
import type { DeliveryResult } from './relay-service.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Límites y tiempos de la cola. */
export interface RelayQueueLimits {
  /** Días que un sobre espera antes de vencer (7 por omisión). */
  ttlDays: number;
  /** Sobres en cola por nodo. */
  maxPerNode: number;
  /** Bytes en cola por nodo (cuerpo JSON del sobre). */
  maxBytesPerNode: number;
  /** Primera espera entre intentos; se duplica en cada intento fallido. */
  baseRetryMs: number;
  /** Espera máxima entre intentos. */
  maxRetryMs: number;
  /** Sobres que se intentan por vuelta. */
  batchSize: number;
}

export const DEFAULT_RELAY_QUEUE_LIMITS: RelayQueueLimits = {
  ttlDays: RELAY_QUEUE_TTL_DAYS,
  maxPerNode: 500,
  maxBytesPerNode: 64 * 1024 * 1024,
  baseRetryMs: 30_000,
  maxRetryMs: 60 * 60 * 1000,
  batchSize: 50,
};

/** Resultado de una vuelta de entregas, solo con contadores. */
export interface RelayQueueRound {
  delivered: number;
  rejected: number;
  expired: number;
  retried: number;
}

/** Contadores agregados de la cola desde el último vaciado (nunca destinos ni contenidos). */
export type RelayQueueCounters = RelayQueueRound & { queued: number };

/** Sobres en cola de un nodo. */
export interface RelayQueueStats {
  count: number;
  bytes: number;
}

/** Cola de entrega. */
export interface RelayQueue {
  /** Guarda el sobre cerrado y devuelve el acuse firmado, o `null` si la cola del nodo está llena. */
  enqueue(node: DirectoryNode, relay: RelayRequest): RelayQueueReceipt | null;
  /** Intenta entregar los sobres cuya espera ya pasó y borra los vencidos. */
  deliverDue(): Promise<RelayQueueRound>;
  /** Sobres en cola de un nodo. */
  stats(nodeId: string): RelayQueueStats;
  /** Devuelve y vacía los contadores agregados. */
  drainCounters(): RelayQueueCounters;
}

/** Dependencias de la cola. */
export interface RelayQueueDeps {
  db: DatabaseSync;
  /** Un intento de entrega (el de `RelayService.deliver`). */
  deliver: (node: DirectoryNode, relay: RelayRequest) => Promise<DeliveryResult>;
  directory: () => AuthorityDirectory;
  now: () => Date;
  /** Llave de la operación: firma el acuse que recibe la persona. */
  operatorPrivateKey: Uint8Array;
  operatorKeyId: string;
  limits?: Partial<RelayQueueLimits>;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Espera antes del intento `attempts + 1`: `base · 2^attempts`, hasta el máximo. */
export function retryDelayMs(attempts: number, limits: RelayQueueLimits): number {
  return Math.min(limits.maxRetryMs, limits.baseRetryMs * 2 ** Math.min(attempts, 30));
}

/** Crea la cola sobre la base del enrutador. */
export function createRelayQueue(deps: RelayQueueDeps): RelayQueue {
  const limits: RelayQueueLimits = { ...DEFAULT_RELAY_QUEUE_LIMITS, ...deps.limits };
  const counters: RelayQueueCounters = {
    queued: 0,
    delivered: 0,
    rejected: 0,
    expired: 0,
    retried: 0,
  };
  let isRunning = false;

  const stats = (nodeId: string): RelayQueueStats => {
    const row = deps.db
      .prepare(
        'SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM relay_queue WHERE node_id = ?',
      )
      .get(nodeId);
    return row === undefined
      ? { count: 0, bytes: 0 }
      : { count: readInteger(row, 'count'), bytes: readInteger(row, 'bytes') };
  };

  const remove = (queueId: string): void => {
    deps.db.prepare('DELETE FROM relay_queue WHERE queue_id = ?').run(queueId);
  };

  return {
    stats,
    enqueue(node, relay) {
      const envelope = JSON.stringify(relay);
      const size = envelope.length;
      const current = stats(node.id);
      if (current.count >= limits.maxPerNode || current.bytes + size > limits.maxBytesPerNode) {
        return null;
      }
      const now = deps.now();
      const acceptedOn = toDayDate(now);
      const expiresAt = now.getTime() + limits.ttlDays * DAY_MS;
      const queueId = toHex(randomBytes(16));
      // Seguridad: se guarda solo el sobre cerrado tal como llegó (nodo, sobre HPKE y la marca de
      // entrega diferida), el día y los tiempos de reintento; ni IP ni cabeceras. Mientras el sobre
      // espera, de su siguiente intento se deduce la hora aproximada de llegada; al entregarlo o
      // vencer se borra todo.
      deps.db
        .prepare(
          'INSERT INTO relay_queue (queue_id, node_id, envelope, size_bytes, accepted_on, expires_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
        )
        .run(
          queueId,
          node.id,
          envelope,
          size,
          acceptedOn,
          expiresAt,
          now.getTime() + limits.baseRetryMs,
        );
      counters.queued += 1;
      return signRelayQueueReceipt(
        {
          queueId,
          node: node.id,
          acceptedOn,
          expiresOn: toDayDate(new Date(expiresAt)),
          envelopeDigest: relayEnvelopeDigest(relay.sealed),
          operatorKeyId: deps.operatorKeyId,
        },
        deps.operatorPrivateKey,
      );
    },
    async deliverDue() {
      const round: RelayQueueRound = { delivered: 0, rejected: 0, expired: 0, retried: 0 };
      if (isRunning) return round;
      isRunning = true;
      try {
        const time = deps.now().getTime();
        const expired = deps.db.prepare('DELETE FROM relay_queue WHERE expires_at <= ?').run(time);
        round.expired = Number(expired.changes);
        const rows = deps.db
          .prepare(
            'SELECT queue_id, node_id, envelope, attempts FROM relay_queue WHERE next_attempt_at <= ? ORDER BY next_attempt_at LIMIT ?',
          )
          .all(time, limits.batchSize);
        for (const row of rows) {
          const queueId = readText(row, 'queue_id');
          const node = findNode(deps.directory(), readText(row, 'node_id'));
          const parsed = RelayRequestSchema.safeParse(parseJson(readText(row, 'envelope')));
          // Un nodo que salió del directorio o un sobre ilegible ya no se puede entregar.
          if (node === undefined || !parsed.success) {
            remove(queueId);
            round.rejected += 1;
            continue;
          }
          const result = await deps.deliver(node, parsed.data);
          if (result.kind === 'delivered') {
            // La respuesta va cifrada hacia la llave efímera del navegador, que ya no espera: se
            // descarta. La persona consulta su folio en «Mi denuncia».
            remove(queueId);
            round.delivered += 1;
          } else if (result.kind === 'rejected') {
            remove(queueId);
            round.rejected += 1;
          } else {
            const attempts = readInteger(row, 'attempts') + 1;
            deps.db
              .prepare(
                'UPDATE relay_queue SET attempts = ?, next_attempt_at = ? WHERE queue_id = ?',
              )
              .run(attempts, deps.now().getTime() + retryDelayMs(attempts, limits), queueId);
            round.retried += 1;
          }
        }
        // Seguridad: con `secure_delete` las páginas borradas se sobrescriben; además se vacía el
        // WAL para que no queden copias de los sobres entregados o vencidos.
        if (round.delivered + round.rejected + round.expired > 0) {
          deps.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        }
      } finally {
        isRunning = false;
      }
      counters.delivered += round.delivered;
      counters.rejected += round.rejected;
      counters.expired += round.expired;
      counters.retried += round.retried;
      return round;
    },
    drainCounters() {
      const snapshot = { ...counters };
      for (const key of Object.keys(counters) as (keyof RelayQueueCounters)[]) counters[key] = 0;
      return snapshot;
    },
  };
}
