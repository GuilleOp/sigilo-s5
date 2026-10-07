// Servicio de bitácora: registra los eventos del día como pendientes y, al cerrar cada día, los
// encadena en orden barajado y publica la cabeza firmada.
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import type { LedgerEvent, LedgerPage, SignedLedgerHead } from '@sigilo/contracts';
import {
  canonicalize,
  chainEvent,
  pendingEventFor,
  randomBytes,
  shuffle,
  signLedgerHead,
  toDayDate,
  toHex,
} from '@sigilo/core';
import type { LedgerEventInput, PendingLedgerEvent } from '@sigilo/core';
import type { DatabaseSync } from 'node:sqlite';
import { withTransaction } from './db/database.ts';
import type { LedgerRepository, StoredPendingEvent } from './db/ledger-repository.ts';

/** Máximo de eventos por página de la bitácora pública. */
export const MAX_LEDGER_PAGE = 500;

/** Operaciones de la bitácora. */
export interface LedgerService {
  /**
   * Registra un evento como pendiente (sin secuencia) y devuelve su parte pública. Debe llamarse
   * dentro de una transacción junto con los demás escritos.
   */
  record(input: LedgerEventInput): PendingLedgerEvent;
  /**
   * Encadena, en su propia transacción, los pendientes de los días ya cerrados (UTC), cada día en
   * orden barajado. Devuelve cuántos encadenó. No debe llamarse dentro de otra transacción.
   */
  publishClosedDays(): number;
  /** Cabeza pública: la del último evento encadenado (o el génesis firmado). */
  head(): SignedLedgerHead;
  /** Página de eventos publicados desde `fromSeq`. */
  page(fromSeq: number, limit: number): LedgerPage;
}

/** Dependencias del servicio de bitácora. */
export interface LedgerServiceDeps {
  db: DatabaseSync;
  repository: LedgerRepository;
  serverKeyId: string;
  serverSigningPrivateKey: Uint8Array;
  now: () => Date;
  /** Barajado de los eventos de un día; por omisión, Fisher-Yates criptográfico. */
  shuffleDay?: (events: readonly StoredPendingEvent[]) => StoredPendingEvent[];
  /**
   * Si las consultas públicas cierran los días pendientes (por omisión, sí). El anclaje desde una
   * base abierta en solo lectura lo desactiva y ancla solo lo ya publicado.
   */
  publishOnRead?: boolean;
}

function groupByDay(events: readonly StoredPendingEvent[]): StoredPendingEvent[][] {
  const days = new Map<string, StoredPendingEvent[]>();
  for (const stored of events) {
    const day = days.get(stored.event.at) ?? [];
    day.push(stored);
    days.set(stored.event.at, day);
  }
  // Los días ya vienen en orden ascendente desde la consulta.
  return [...days.values()];
}

/**
 * Crea el servicio de bitácora.
 * Seguridad: los eventos llevan solo el día, pero si recibieran su secuencia y se encadenaran al
 * llegar, el orden dentro del día y la cabeza en tiempo real revelarían la hora de cada denuncia,
 * mensaje o apertura. Por eso quedan pendientes y sin `seq` hasta que el día cierra; entonces se
 * encadenan barajados con aleatoriedad criptográfica, y la cabeza cambia a lo más una vez al día.
 */
export function createLedgerService(deps: LedgerServiceDeps): LedgerService {
  const { db, repository, serverKeyId, serverSigningPrivateKey, now } = deps;
  const shuffleDay = deps.shuffleDay ?? ((events) => shuffle(events));
  const publishOnRead = deps.publishOnRead ?? true;

  function headFor(last: LedgerEvent | null): SignedLedgerHead {
    // Sin eventos publicados se firma el génesis: seq 0, hash de ceros y la fecha del día.
    const unsigned =
      last === null
        ? { seq: 0, hash: LEDGER_GENESIS_HASH, at: toDayDate(now()), serverKeyId }
        : { seq: last.seq, hash: last.hash, at: last.at, serverKeyId };
    return signLedgerHead(unsigned, serverSigningPrivateKey);
  }

  function publishClosedDays(): number {
    const today = toDayDate(now());
    // Consulta ligera fuera de la transacción: casi siempre no hay nada que cerrar.
    if (!repository.hasPendingBefore(today)) return 0;
    return withTransaction(db, () => {
      // Se vuelve a leer dentro de la transacción por si otro proceso ya cerró el día.
      const pending = repository.listPendingBefore(today);
      let previous = repository.last();
      for (const day of groupByDay(pending)) {
        for (const stored of shuffleDay(day)) {
          const event = chainEvent(previous, stored.event);
          repository.insert(event, stored.payloadJson);
          repository.deletePending(stored.pendingId);
          previous = event;
        }
      }
      return pending.length;
    });
  }

  return {
    record: (input) => {
      const event = pendingEventFor(input);
      // El identificador es aleatorio: no conserva el orden de llegada.
      repository.insertPending(toHex(randomBytes(16)), event, canonicalize(input.payload));
      return event;
    },
    publishClosedDays,
    head: () => {
      if (publishOnRead) publishClosedDays();
      return headFor(repository.last());
    },
    page: (fromSeq, limit) => {
      if (publishOnRead) publishClosedDays();
      // Se lee una sola vez para que la página y su cabeza correspondan al mismo corte.
      const last = repository.last();
      const size = Math.min(limit, MAX_LEDGER_PAGE);
      const events = last === null ? [] : repository.page(fromSeq, size);
      return { events, head: headFor(last) };
    },
  };
}
