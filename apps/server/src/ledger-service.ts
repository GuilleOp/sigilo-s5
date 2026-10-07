// Servicio de bitácora: agrega eventos encadenados y firma la cabeza con la llave del servidor.
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
  head(): SignedLedgerHead;
  page(fromSeq: number, limit: number): LedgerPage;
}

/** Dependencias del servicio de bitácora. */
export interface LedgerServiceDeps {
  repository: LedgerRepository;
  serverKeyId: string;
  serverSigningPrivateKey: Uint8Array;
  now: () => Date;
}

/** Crea el servicio de bitácora. */
export function createLedgerService(deps: LedgerServiceDeps): LedgerService {
  const { repository, serverKeyId, serverSigningPrivateKey, now } = deps;

  function head(): SignedLedgerHead {
    const last = repository.last();
    // Con la bitácora vacía se firma el génesis: seq 0, hash de ceros y la fecha del día.
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
    head,
    page: (fromSeq, limit) => ({
      events: repository.page(fromSeq, Math.min(limit, MAX_LEDGER_PAGE)),
      head: head(),
    }),
  };
}
