// Servicio de bitácora: agrega eventos encadenados y publica, en lotes diarios, los eventos de días
// ya cerrados con su cabeza firmada por el servidor.
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import type { LedgerEvent, LedgerPage, SignedLedgerHead } from '@sigilo/contracts';
import { buildEvent, canonicalize, signLedgerHead, toDayDate } from '@sigilo/core';
import type { LedgerEventInput } from '@sigilo/core';
import type { LedgerRepository } from './db/ledger-repository.ts';

/** Máximo de eventos por página de la bitácora pública. */
export const MAX_LEDGER_PAGE = 500;

/** Operaciones de la bitácora. */
export interface LedgerService {
  /** Agrega un evento; debe llamarse dentro de una transacción junto con los demás escritos. */
  append(input: LedgerEventInput): LedgerEvent;
  /** Cabeza pública: la del último evento publicado (de un día anterior al actual). */
  head(): SignedLedgerHead;
  /** Página de eventos publicados desde `fromSeq`. */
  page(fromSeq: number, limit: number): LedgerPage;
}

/** Dependencias del servicio de bitácora. */
export interface LedgerServiceDeps {
  repository: LedgerRepository;
  serverKeyId: string;
  serverSigningPrivateKey: Uint8Array;
  now: () => Date;
}

/**
 * Crea el servicio de bitácora.
 * Seguridad: las fechas de los eventos van redondeadas al día, pero consultar la cabeza cada pocos
 * segundos revelaría la hora exacta de cada denuncia y mensaje. Por eso solo se publican los
 * eventos de días ya cerrados (UTC) y la cabeza pública cambia a lo más una vez al día. El orden
 * dentro del día sigue siendo el de llegada (riesgo residual documentado en docs/criptografia.md).
 */
export function createLedgerService(deps: LedgerServiceDeps): LedgerService {
  const { repository, serverKeyId, serverSigningPrivateKey, now } = deps;

  function lastPublished(): LedgerEvent | null {
    return repository.lastBefore(toDayDate(now()));
  }

  function headFor(last: LedgerEvent | null): SignedLedgerHead {
    // Sin eventos publicados se firma el génesis: seq 0, hash de ceros y la fecha del día.
    const unsigned =
      last === null
        ? { seq: 0, hash: LEDGER_GENESIS_HASH, at: toDayDate(now()), serverKeyId }
        : { seq: last.seq, hash: last.hash, at: last.at, serverKeyId };
    return signLedgerHead(unsigned, serverSigningPrivateKey);
  }

  return {
    append: (input) => {
      const event = buildEvent(repository.last(), input);
      repository.insert(event, canonicalize(input.payload));
      return event;
    },
    head: () => headFor(lastPublished()),
    page: (fromSeq, limit) => {
      // Se lee una sola vez para que la página y su cabeza correspondan al mismo corte diario.
      const last = lastPublished();
      const size = Math.min(limit, MAX_LEDGER_PAGE);
      const events = last === null ? [] : repository.page(fromSeq, last.seq, size);
      return { events, head: headFor(last) };
    },
  };
}
