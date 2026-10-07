// Pruebas del servicio de bitácora: eventos pendientes sin secuencia, cierre de días con barajado
// criptográfico, por lotes atómicos que ceden el event loop, fechas ante un reloj que retrocede o
// salta hacia adelante y tope diario del que la autoridad está exenta.
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
  const record = (index: number, actorRole: 'reporter' | 'authority' = 'reporter') =>
    withTransaction(db, () =>
      ledger.record({
        type: 'message.sent',
        folio: FOLIO,
        at: now.toISOString().slice(0, 10),
        actorRole,
        payload: { folio: FOLIO, index },
      }),
    );
  return { db, repository, ledger, keys, record, setNow: (date: Date) => (now = date) };
}

describe('createLedgerService', () => {
  it('no publica ni numera los eventos del día hasta que la tarea cierra el día', async () => {
    const { ledger, record, keys, setNow } = setup();
    const pending = record(0);
    expect(pending).not.toHaveProperty('seq');
    expect(ledger.page(0, 10).events).toEqual([]);
    const head = ledger.head();
    expect(head).toMatchObject({ seq: 0, hash: LEDGER_GENESIS_HASH, at: '2026-10-20' });
    expect(verifyLedgerHead(head, keys.publicKey)).toBe(true);

    setNow(new Date('2026-10-21T00:00:01Z'));
    // Las lecturas nunca cierran días: muestran lo ya publicado.
    expect(ledger.page(0, 10).events).toEqual([]);
    expect(ledger.head().seq).toBe(0);
    expect(await ledger.publishClosedDays()).toBe(1);
    const page = ledger.page(0, 10);
    expect(page.events.map((event) => event.payloadDigest)).toEqual([pending.payloadDigest]);
    expect(page.head).toMatchObject({ seq: 0, hash: page.events[0]?.hash, at: '2026-10-20' });
  });

  it('encadena cada día completo, en orden de días, con el orden del barajado', async () => {
    // Barajado determinista para la prueba: invierte el orden de cada día.
    const { ledger, record, setNow } = setup((ids) => [...ids].reverse());
    const day1 = [record(0), record(1), record(2)];
    setNow(new Date('2026-10-21T12:00:00Z'));
    const day2 = [record(3), record(4)];
    setNow(new Date('2026-10-22T00:30:00Z'));
    expect(await ledger.publishClosedDays()).toBe(5);
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
    expect(await ledger.publishClosedDays()).toBe(0);
  });

  it('baraja con aleatoriedad: muchos eventos del mismo día no conservan su orden de llegada', async () => {
    const { ledger, record, setNow } = setup();
    const arrivals = Array.from({ length: 40 }, (_, index) => record(index).payloadDigest);
    setNow(new Date('2026-10-21T00:00:01Z'));
    await ledger.publishClosedDays();
    const published = ledger.page(0, 100).events.map((event) => event.payloadDigest);
    expect(new Set(published)).toEqual(new Set(arrivals));
    expect(published).not.toEqual(arrivals);
  });

  it('si el barajado falla no publica nada del día', async () => {
    const { ledger, record, repository, setNow } = setup((ids) => {
      if (ids.length > 1) throw new Error('falla sintética');
      return [...ids];
    });
    record(0);
    record(1);
    setNow(new Date('2026-10-21T00:00:01Z'));
    await expect(ledger.publishClosedDays()).rejects.toThrow('falla sintética');
    expect(repository.last()).toBeNull();
    expect(repository.listPendingBefore('2026-10-21')).toHaveLength(2);
  });

  it('encadena por lotes y no publica un día interrumpido hasta terminarlo', async () => {
    let insertsBeforeFailure = Number.POSITIVE_INFINITY;
    const { ledger, record, repository, setNow, keys } = setup(
      undefined,
      { batchSize: 2 },
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
    await expect(ledger.publishClosedDays()).rejects.toThrow('corte sintético');
    expect(repository.listPendingBefore('2026-10-22')).toHaveLength(3);
    const partial = ledger.page(0, 10);
    // La cabeza se queda en el primer día y la página no muestra el día a medias.
    expect(partial.head.at).toBe('2026-10-20');
    expect(partial.events).toHaveLength(2);
    expect(verifyLedgerHead(partial.head, keys.publicKey)).toBe(true);

    insertsBeforeFailure = Number.POSITIVE_INFINITY;
    expect(await ledger.publishClosedDays()).toBe(3);
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

  it('los eventos de la autoridad no cuentan para el tope del día ni se rechazan', () => {
    const { record } = setup(undefined, { maxPendingPerDay: 2 });
    record(0);
    record(1);
    expect(() => record(2)).toThrow(expect.objectContaining({ code: 'ledger_day_full' }));
    for (let index = 3; index < 8; index += 1) record(index, 'authority');
    expect(() => record(9)).toThrow(expect.objectContaining({ code: 'ledger_day_full' }));
  });

  it('si el reloj retrocede, fecha el evento después del último día publicado y sigue publicando', async () => {
    const { ledger, record, setNow } = setup();
    record(0);
    setNow(new Date('2026-10-22T10:00:00Z'));
    expect(await ledger.publishClosedDays()).toBe(1);
    expect(ledger.head().at).toBe('2026-10-20');
    // El reloj vuelve al 19: el evento no puede caer en un día ya publicado.
    setNow(new Date('2026-10-19T23:59:00Z'));
    expect(record(1).at).toBe('2026-10-21');
    // Más atrás todavía: sigue sin caer en un día publicado.
    setNow(new Date('2026-10-18T08:00:00Z'));
    expect(record(2).at).toBe('2026-10-21');
    setNow(new Date('2026-10-22T10:05:00Z'));
    expect(await ledger.publishClosedDays()).toBe(2);
    const events = ledger.page(0, 10).events;
    expect(verifyChain(events)).toEqual({ valid: true });
    expect(events.map((event) => event.at)).toEqual(['2026-10-20', '2026-10-21', '2026-10-21']);
  });

  it('un salto del reloj hacia adelante no arrastra a los eventos nuevos y avisa al operador', async () => {
    const warnings: string[] = [];
    const { ledger, record, setNow } = setup(undefined, {
      maxPendingPerDay: 3,
      warn: (message) => warnings.push(message),
    });
    // El reloj salta 16 días unos minutos y vuelve.
    setNow(new Date('2026-11-05T10:00:00Z'));
    expect(record(0).at).toBe('2026-11-05');
    setNow(new Date('2026-10-20T12:00:00Z'));
    expect(record(1).at).toBe('2026-10-20');
    expect(await ledger.publishClosedDays()).toBe(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2026-11-05');
    // Cada día real cierra el anterior; la cabeza avanza y el tope diario no se comparte.
    for (const [index, day] of ['2026-10-21', '2026-10-22', '2026-10-23'].entries()) {
      setNow(new Date(`${day}T12:00:00Z`));
      expect(await ledger.publishClosedDays()).toBe(index === 0 ? 1 : 3);
      for (let count = 0; count < 3; count += 1) expect(record(10 * index + count).at).toBe(day);
    }
    expect(ledger.head().at).toBe('2026-10-22');
    // Un solo aviso por día futuro.
    expect(warnings).toHaveLength(1);
    setNow(new Date('2026-11-06T00:10:00Z'));
    await ledger.publishClosedDays();
    const events = ledger.page(0, 50).events;
    expect(verifyChain(events)).toEqual({ valid: true });
    expect(events.at(-1)?.at).toBe('2026-11-05');
  });

  it('cede el event loop entre lotes y comparte el cierre en curso', async () => {
    const { ledger, record, setNow } = setup(undefined, { batchSize: 2 });
    for (let index = 0; index < 6; index += 1) record(index);
    setNow(new Date('2026-10-21T00:00:01Z'));
    const timeline: number[] = [];
    const first = ledger.publishClosedDays();
    expect(ledger.publishClosedDays()).toBe(first);
    setImmediate(() => timeline.push(ledger.page(0, 10).events.length));
    expect(await first).toBe(6);
    // Una lectura intercalada entre lotes ve un día a medias, pero la página no lo muestra.
    expect(timeline).toEqual([0]);
    expect(ledger.page(0, 10).events).toHaveLength(6);
  });

  it('entrega la página desde el vecino anterior a un día y guarda la firma de la cabeza', async () => {
    const { ledger, record, setNow } = setup();
    record(0);
    setNow(new Date('2026-10-21T10:00:00Z'));
    record(1);
    record(2);
    setNow(new Date('2026-10-22T10:00:00Z'));
    await ledger.publishClosedDays();
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
});
