// Servicio de bitácora: registra los eventos del día como pendientes y, al cerrar cada día, los
// encadena en orden barajado, por lotes acotados que ceden el event loop, y publica la cabeza
// firmada.
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
import { checkpointWal, withTransaction } from './db/database.ts';
import type { LedgerRepository } from './db/ledger-repository.ts';
import { ApiFailure } from './http/errors.ts';

/** Máximo de eventos por página de la bitácora pública. */
export const MAX_LEDGER_PAGE = 500;

/**
 * Eventos que se encadenan por transacción al cerrar un día. Entre lotes el cierre cede el event
 * loop, así que es también la mayor espera que impone a una petición concurrente (decenas de ms).
 */
export const PUBLISH_BATCH_SIZE = 1000;

/**
 * Tope de eventos pendientes por día; al alcanzarlo, las escrituras reciben `ledger_day_full`.
 * Los eventos de la autoridad (estatus, aperturas y sus mensajes) están exentos.
 */
export const MAX_PENDING_EVENTS_PER_DAY = 200_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Operaciones de la bitácora. */
export interface LedgerService {
  /**
   * Registra un evento como pendiente (sin secuencia) y devuelve su parte pública. Su fecha es la
   * mayor entre `input.at`, el día siguiente al último encadenado y el último día con pendientes:
   * si el reloj retrocede, el evento no cae en un día ya publicado ni antes de otro pendiente, y
   * la cadena sigue en orden de fechas. Quien guarde la fecha junto al evento debe usar la del
   * resultado. Debe llamarse dentro de una transacción junto con los demás escritos. Lanza
   * `ledger_day_full` si el día ya tiene el máximo de pendientes, salvo para la autoridad.
   */
  record(input: LedgerEventInput): PendingLedgerEvent;
  /**
   * Encadena los pendientes de los días ya cerrados (UTC), cada día en orden barajado y por lotes
   * de a lo más `PUBLISH_BATCH_SIZE` eventos, cada lote en su transacción, cediendo el event loop
   * entre lotes. Devuelve cuántos encadenó. Si ya hay un cierre en curso, devuelve ese mismo. Solo
   * lo llama la tarea programada; las lecturas muestran lo ya publicado.
   */
  publishClosedDays(): Promise<number>;
  /** Cabeza pública: la del último evento de un día publicado completo (o el génesis firmado). */
  head(): SignedLedgerHead;
  /** Página de eventos publicados desde `fromSeq`, nunca más allá de la cabeza. */
  page(fromSeq: number, limit: number): LedgerPage;
  /**
   * Página que empieza en el último evento publicado anterior a `day` (el vecino que acota el
   * tramo) o, si no hay ninguno, en el génesis.
   */
  pageSince(day: string, limit: number): LedgerPage;
}

/** Dependencias del servicio de bitácora. */
export interface LedgerServiceDeps {
  db: DatabaseSync;
  repository: LedgerRepository;
  serverKeyId: string;
  serverSigningPrivateKey: Uint8Array;
  now: () => Date;
  /** Barajado de los identificadores de un día; por omisión, Fisher-Yates criptográfico. */
  shuffleDay?: (pendingIds: readonly string[]) => string[];
  /** Eventos por transacción al cerrar un día (`PUBLISH_BATCH_SIZE`). */
  batchSize?: number;
  /** Tope de pendientes por día (`MAX_PENDING_EVENTS_PER_DAY`). */
  maxPendingPerDay?: number;
}

function nextDay(day: string): string {
  return toDayDate(new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS));
}

function laterDay(a: string, b: string | null): string {
  return b !== null && b > a ? b : a;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Crea el servicio de bitácora.
 * Seguridad: los eventos llevan solo el día, pero si recibieran su secuencia y se encadenaran al
 * llegar, el orden dentro del día y la cabeza en tiempo real revelarían la hora de cada denuncia,
 * mensaje o apertura. Por eso quedan pendientes y sin `seq` hasta que el día cierra; entonces se
 * barajan con aleatoriedad criptográfica los identificadores del día completo y se encadenan en
 * ese orden por lotes. Si el cierre se interrumpe entre lotes, lo encadenado queda (cada lote es
 * atómico) y lo pendiente del día se vuelve a barajar en la siguiente corrida: una permutación
 * uniforme del resto sigue dando un orden uniforme del día. Mientras un día tiene pendientes, la
 * cabeza no avanza a él: cada día se publica completo y la cabeza cambia a lo más una vez al día.
 * Las lecturas nunca cierran días: un cierre de 200 000 eventos tarda segundos y bloquearía a
 * quien lo disparara; lo hace la tarea programada, cediendo el event loop entre lotes.
 */
export function createLedgerService(deps: LedgerServiceDeps): LedgerService {
  const { db, repository, serverKeyId, serverSigningPrivateKey, now } = deps;
  const shuffleDay = deps.shuffleDay ?? ((ids) => shuffle(ids));
  const batchSize = deps.batchSize ?? PUBLISH_BATCH_SIZE;
  const maxPendingPerDay = deps.maxPendingPerDay ?? MAX_PENDING_EVENTS_PER_DAY;
  let cachedHead: SignedLedgerHead | null = null;
  let pendingCount: { day: string; count: number } | null = null;
  let closing: Promise<number> | null = null;

  function headFor(last: LedgerEvent | null): SignedLedgerHead {
    // Sin eventos publicados se firma el génesis: seq 0, hash de ceros y la fecha del día.
    const unsigned =
      last === null
        ? { seq: 0, hash: LEDGER_GENESIS_HASH, at: toDayDate(now()), serverKeyId }
        : { seq: last.seq, hash: last.hash, at: last.at, serverKeyId };
    // La firma se guarda hasta que la cabeza cambia.
    const cached = cachedHead;
    const isCached =
      cached !== null &&
      cached.seq === unsigned.seq &&
      cached.hash === unsigned.hash &&
      cached.at === unsigned.at;
    if (cached !== null && isCached) return cached;
    const signed = signLedgerHead(unsigned, serverSigningPrivateKey);
    cachedHead = signed;
    return signed;
  }

  // Último evento de un día publicado completo: si el cierre de un día quedó a medias, la cabeza
  // se queda en el día anterior hasta terminarlo.
  function publishedLast(): LedgerEvent | null {
    const last = repository.last();
    const incompleteDay = repository.firstPendingDay();
    if (last === null || incompleteDay === null || last.at < incompleteDay) return last;
    return repository.lastBefore(incompleteDay);
  }

  function chainBatch(ids: readonly string[]): number {
    return withTransaction(db, () => {
      let previous = repository.last();
      let chained = 0;
      for (const pendingId of ids) {
        // Se vuelve a leer dentro de la transacción por si otro proceso ya lo encadenó.
        const stored = repository.findPending(pendingId);
        if (stored === null) continue;
        const event = chainEvent(previous, stored.event);
        repository.insert(event, stored.payloadJson);
        repository.deletePending(stored.pendingId);
        previous = event;
        chained += 1;
      }
      return chained;
    });
  }

  async function closeDays(): Promise<number> {
    const today = toDayDate(now());
    // Consulta ligera: casi siempre no hay nada que cerrar.
    if (!repository.hasPendingBefore(today)) return 0;
    let published = 0;
    let isFirstBatch = true;
    for (const day of repository.listPendingDaysBefore(today)) {
      // Solo los identificadores del día completo están en memoria a la vez.
      const order = shuffleDay(repository.listPendingIdsOn(day));
      for (let start = 0; start < order.length; start += batchSize) {
        if (!isFirstBatch) await yieldToEventLoop();
        isFirstBatch = false;
        published += chainBatch(order.slice(start, start + batchSize));
      }
    }
    // Seguridad: el WAL conserva páginas con los pendientes en su orden de llegada.
    if (published > 0) checkpointWal(db);
    return published;
  }

  function publishClosedDays(): Promise<number> {
    closing ??= closeDays().finally(() => {
      closing = null;
    });
    return closing;
  }

  // Fecha mínima de un evento nuevo: nunca un día ya encadenado ni anterior a otro pendiente.
  function eventDay(requested: string): string {
    const last = repository.last();
    const floor = laterDay(
      last === null ? requested : nextDay(last.at),
      repository.lastPendingDay(),
    );
    return laterDay(requested, floor);
  }

  function assertDayCapacity(day: string): void {
    if (pendingCount?.day !== day) pendingCount = { day, count: repository.countPendingOn(day) };
    if (pendingCount.count >= maxPendingPerDay) {
      // El contador en memoria puede sobrar si alguna transacción se revirtió: se confirma.
      pendingCount.count = repository.countPendingOn(day);
      if (pendingCount.count >= maxPendingPerDay) throw new ApiFailure('ledger_day_full');
    }
    pendingCount.count += 1;
  }

  function pageFrom(fromSeq: number, limit: number): LedgerPage {
    // Se lee una sola vez para que la página y su cabeza correspondan al mismo corte.
    const last = publishedLast();
    const size = Math.min(limit, MAX_LEDGER_PAGE);
    const events = last === null ? [] : repository.page(fromSeq, size, last.seq);
    return { events, head: headFor(last) };
  }

  return {
    record: (input) => {
      const event = pendingEventFor({ ...input, at: eventDay(input.at) });
      // La autoridad no compite con el volumen anónimo: sus eventos no cuentan para el tope.
      if (input.actorRole !== 'authority') assertDayCapacity(event.at);
      // El identificador es aleatorio: no conserva el orden de llegada.
      repository.insertPending(toHex(randomBytes(16)), event, canonicalize(input.payload));
      return event;
    },
    publishClosedDays,
    head: () => headFor(publishedLast()),
    page: (fromSeq, limit) => pageFrom(fromSeq, limit),
    pageSince: (day, limit) => {
      // Consultas por índice (`ledger_events_by_day` y la secuencia): costo acotado.
      const neighbor = repository.lastBefore(day);
      return pageFrom(neighbor === null ? 0 : neighbor.seq, limit);
    },
  };
}
