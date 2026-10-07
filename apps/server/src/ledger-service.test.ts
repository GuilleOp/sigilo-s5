// Pruebas del servicio de bitácora: eventos pendientes sin secuencia, cierre de días con barajado
// criptográfico, publicación perezosa y atómica.
import { describe, expect, it } from 'vitest';
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import { generateSigningKeyPair, keyIdFor, verifyChain, verifyLedgerHead } from '@sigilo/core';
import { openDatabase, withTransaction } from './db/database.ts';
import { createLedgerRepository } from './db/ledger-repository.ts';
import type { LedgerRepository } from './db/ledger-repository.ts';
import { createLedgerService } from './ledger-service.ts';
import type { LedgerServiceDeps } from './ledger-service.ts';

const FOLIO = '0123-4567-89AB';

function setup(
  shuffleDay?: (ids: readonly string[]) => string[],
  extra: Partial<LedgerServiceDeps> = {},
  wrapRepository: (repository: LedgerRepository) => LedgerRepository = (repository) => repository,
) {
  const db = openDatabase(':memory:');
  const repository = wrapRepository(createLedgerRepository(db));
  const keys = generateSigningKeyPair();
  let now = new Date('2026-10-20T10:00:00Z');
  const ledger = createLedgerService({
    db,
    repository,
    serverKeyId: keyIdFor(keys.publicKey),
    serverSigningPrivateKey: keys.privateKey,
    now: () => now,
    ...(shuffleDay === undefined ? {} : { shuffleDay }),
    ...extra,
  });
  const record = (index: number) =>
    withTransaction(db, () =>
      ledger.record({
        type: 'message.sent',
        folio: FOLIO,
        at: now.toISOString().slice(0, 10),
        actorRole: 'reporter',
        payload: { folio: FOLIO, index },
      }),
    );
  return { db, repository, ledger, keys, record, setNow: (date: Date) => (now = date) };
}

describe('createLedgerService', () => {
  it('no publica ni numera los eventos del día hasta que el día cierra', () => {
    const { ledger, record, keys, setNow } = setup();
    const pending = record(0);
    expect(pending).not.toHaveProperty('seq');
    expect(ledger.page(0, 10).events).toEqual([]);
    const head = ledger.head();
    expect(head).toMatchObject({ seq: 0, hash: LEDGER_GENESIS_HASH, at: '2026-10-20' });
    expect(verifyLedgerHead(head, keys.publicKey)).toBe(true);

    setNow(new Date('2026-10-21T00:00:01Z'));
    const page = ledger.page(0, 10);
    expect(page.events.map((event) => event.payloadDigest)).toEqual([pending.payloadDigest]);
    expect(page.head).toMatchObject({ seq: 0, hash: page.events[0]?.hash, at: '2026-10-20' });
  });

  it('encadena cada día completo, en orden de días, con el orden del barajado', () => {
    // Barajado determinista para la prueba: invierte el orden de cada día.
    const { ledger, record, setNow } = setup((ids) => [...ids].reverse());
    const day1 = [record(0), record(1), record(2)];
    setNow(new Date('2026-10-21T12:00:00Z'));
    const day2 = [record(3), record(4)];
    setNow(new Date('2026-10-22T00:30:00Z'));
    expect(ledger.publishClosedDays()).toBe(5);
    const events = ledger.page(0, 10).events;
    expect(verifyChain(events)).toEqual({ valid: true });
    expect(events.map((event) => event.at)).toEqual([
      '2026-10-20',
      '2026-10-20',
      '2026-10-20',
      '2026-10-21',
      '2026-10-21',
    ]);
    // El orden de lectura de los pendientes es por identificador aleatorio; invertido sigue siendo
    // una permutación del día, nunca mezcla días.
    expect(new Set(events.slice(0, 3).map((event) => event.payloadDigest))).toEqual(
      new Set(day1.map((event) => event.payloadDigest)),
    );
    expect(new Set(events.slice(3).map((event) => event.payloadDigest))).toEqual(
      new Set(day2.map((event) => event.payloadDigest)),
    );
    expect(ledger.publishClosedDays()).toBe(0);
  });

  it('baraja con aleatoriedad: muchos eventos del mismo día no conservan su orden de llegada', () => {
    const { ledger, record, setNow } = setup();
    const arrivals = Array.from({ length: 40 }, (_, index) => record(index).payloadDigest);
    setNow(new Date('2026-10-21T00:00:01Z'));
    const published = ledger.page(0, 100).events.map((event) => event.payloadDigest);
    expect(new Set(published)).toEqual(new Set(arrivals));
    expect(published).not.toEqual(arrivals);
  });

  it('si el barajado falla no publica nada del día', () => {
    const { ledger, record, repository, setNow } = setup((ids) => {
      if (ids.length > 1) throw new Error('falla sintética');
      return [...ids];
    });
    record(0);
    record(1);
    setNow(new Date('2026-10-21T00:00:01Z'));
    expect(() => ledger.publishClosedDays()).toThrow('falla sintética');
    expect(repository.last()).toBeNull();
    expect(repository.listPendingBefore('2026-10-21')).toHaveLength(2);
  });

  it('encadena por lotes y no publica un día interrumpido hasta terminarlo', () => {
    let insertsBeforeFailure = Number.POSITIVE_INFINITY;
    const { ledger, record, repository, setNow, keys } = setup(
      undefined,
      { batchSize: 2, publishOnRead: false },
      (base) => ({
        ...base,
        insert: (event, payloadJson) => {
          insertsBeforeFailure -= 1;
          if (insertsBeforeFailure < 0) throw new Error('corte sintético');
          base.insert(event, payloadJson);
        },
      }),
    );
    const day1 = [record(0), record(1)];
    setNow(new Date('2026-10-21T10:00:00Z'));
    const day2 = [record(2), record(3), record(4), record(5), record(6)];
    setNow(new Date('2026-10-22T10:00:00Z'));
    // Se cae a la mitad del segundo día: primer día completo y un lote del segundo.
    insertsBeforeFailure = 4;
    expect(() => ledger.publishClosedDays()).toThrow('corte sintético');
    expect(repository.listPendingBefore('2026-10-22')).toHaveLength(3);
    const partial = ledger.page(0, 10);
    // La cabeza se queda en el primer día y la página no muestra el día a medias.
    expect(partial.head.at).toBe('2026-10-20');
    expect(partial.events).toHaveLength(2);
    expect(verifyLedgerHead(partial.head, keys.publicKey)).toBe(true);

    insertsBeforeFailure = Number.POSITIVE_INFINITY;
    expect(ledger.publishClosedDays()).toBe(3);
    const events = ledger.page(0, 10).events;
    expect(verifyChain(events)).toEqual({ valid: true });
    expect(new Set(events.map((event) => event.payloadDigest))).toEqual(
      new Set([...day1, ...day2].map((event) => event.payloadDigest)),
    );
    expect(ledger.head()).toMatchObject({ seq: 6, at: '2026-10-21' });
  });

  it('rechaza con ledger_day_full al llegar al tope de pendientes del día', () => {
    const { record, setNow } = setup(undefined, { maxPendingPerDay: 2 });
    record(0);
    record(1);
    expect(() => record(2)).toThrow(expect.objectContaining({ code: 'ledger_day_full' }));
    // Un evento revertido no gasta el tope: se recuenta antes de rechazar.
    setNow(new Date('2026-10-21T10:00:00Z'));
    record(3);
  });

  it('entrega la página desde el vecino anterior a un día y guarda la firma de la cabeza', () => {
    const { ledger, record, setNow } = setup();
    record(0);
    setNow(new Date('2026-10-21T10:00:00Z'));
    record(1);
    record(2);
    setNow(new Date('2026-10-22T10:00:00Z'));
    const since = ledger.pageSince('2026-10-21', 10);
    expect(since.events.map((event) => event.at)).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-21',
    ]);
    expect(ledger.pageSince('2026-10-20', 10).events[0]?.seq).toBe(0);
    expect(ledger.pageSince('2026-10-25', 10).events.map((event) => event.seq)).toEqual([2]);
    // La misma cabeza se sirve con el mismo objeto firmado hasta que cambia.
    expect(ledger.head()).toBe(ledger.head());
  });

  it('con la publicación perezosa desactivada solo muestra lo ya encadenado', () => {
    const { db, repository, keys, record, setNow } = setup();
    record(0);
    setNow(new Date('2026-10-21T00:00:01Z'));
    const readOnly = createLedgerService({
      db,
      repository,
      serverKeyId: keyIdFor(keys.publicKey),
      serverSigningPrivateKey: keys.privateKey,
      now: () => new Date('2026-10-21T00:00:01Z'),
      publishOnRead: false,
    });
    expect(readOnly.page(0, 10).events).toEqual([]);
    expect(readOnly.publishClosedDays()).toBe(1);
    expect(readOnly.page(0, 10).events).toHaveLength(1);
  });
});
