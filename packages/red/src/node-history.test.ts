// Regresión de H4 (G04): una cabeza de nodo con secuencia mayor que no extiende la anterior
// (historia reescrita) se rechaza; la que sí la extiende se acepta. Se prueba la verificación pura,
// la descarga paginada y los pasos que debe revisar un testigo.
import { describe, expect, it } from 'vitest';
import { LEDGER_GENESIS_HASH, ROUTES } from '@sigilo/contracts';
import type { LedgerEvent, NationalLedgerEntry, SignedLedgerHead } from '@sigilo/contracts';
import { buildEvent, generateSigningKeyPair, keyIdFor, signLedgerHead } from '@sigilo/core';
import { buildNodeHeadEntry } from './national-ledger.ts';
import {
  checkNodeHistory,
  fetchNodeHistory,
  nodeHeadTransitions,
  verifyNodeHistorySegment,
} from './node-history.ts';
import type { FetchLike } from './node-client.ts';

const FOLIO = 'K7Q2-M9XP-4RTD';
const SIGNING = generateSigningKeyPair();

function chain(length: number, salt: string, from: LedgerEvent[] = []): LedgerEvent[] {
  const events = [...from];
  while (events.length < length) {
    events.push(
      buildEvent(events.at(-1) ?? null, {
        type: 'complaint.received',
        folio: FOLIO,
        at: '2026-11-09',
        actorRole: 'system',
        payload: { salt, index: events.length },
      }),
    );
  }
  return events;
}

function headOf(event: LedgerEvent | null): SignedLedgerHead {
  return signLedgerHead(
    {
      seq: event?.seq ?? 0,
      hash: event?.hash ?? LEDGER_GENESIS_HASH,
      at: '2026-11-09',
      serverKeyId: keyIdFor(SIGNING.publicKey),
    },
    SIGNING.privateKey,
  );
}

/** Nodo falso que sirve `ledgerEvents` de `events` en páginas de hasta `limit`. */
function nodeServing(events: LedgerEvent[], calls: string[] = []): FetchLike {
  return async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    if (url.pathname !== ROUTES.ledgerEvents) return new Response('', { status: 404 });
    const from = Number(url.searchParams.get('from'));
    const limit = Number(url.searchParams.get('limit'));
    return Response.json({
      events: events.filter((event) => event.seq >= from).slice(0, limit),
      head: headOf(events.at(-1) ?? null),
    });
  };
}

describe('historia de un nodo entre dos cabezas (H4)', () => {
  const honest = chain(10, 'a');
  const previous = headOf(honest[5] ?? null);
  const next = headOf(honest[9] ?? null);
  // Historia reescrita: comparte los eventos 0 a 3 y diverge desde el 4.
  const rewritten = chain(10, 'b', honest.slice(0, 4));
  const rewrittenHead = headOf(rewritten[9] ?? null);

  it('acepta un tramo que va de la cabeza anterior a la nueva', () => {
    expect(verifyNodeHistorySegment(previous, next, honest.slice(5))).toEqual({ valid: true });
    expect(verifyNodeHistorySegment(headOf(null), next, honest)).toEqual({ valid: true });
  });

  it('rechaza la historia reescrita con secuencia mayor', () => {
    expect(verifyNodeHistorySegment(previous, rewrittenHead, rewritten.slice(5))).toEqual({
      valid: false,
      reason: 'start',
    });
    // Aunque el nodo sirva el evento anterior verdadero, la cadena no llega a la cabeza nueva.
    const spliced = [honest[5] as LedgerEvent, ...rewritten.slice(6)];
    expect(verifyNodeHistorySegment(previous, rewrittenHead, spliced)).toEqual({
      valid: false,
      reason: 'chain',
    });
    // Ni un tramo honesto que no termina en la cabeza anunciada.
    expect(verifyNodeHistorySegment(previous, rewrittenHead, honest.slice(5))).toEqual({
      valid: false,
      reason: 'end',
    });
  });

  it('descarga el tramo en páginas y lo verifica', async () => {
    const long = chain(1200, 'c');
    const calls: string[] = [];
    const events = await fetchNodeHistory(
      nodeServing(long, calls),
      'http://nodo.invalid',
      100,
      1199,
    );
    expect(events?.length).toBe(1100);
    expect(calls).toHaveLength(3);
    expect(
      await checkNodeHistory({
        fetch: nodeServing(long),
        baseUrl: 'http://nodo.invalid/',
        previous: headOf(long[100] ?? null),
        next: headOf(long[1199] ?? null),
      }),
    ).toEqual({ valid: true });
  });

  it('rechaza si el nodo sirve la historia reescrita o no responde, y acepta la primera cabeza', async () => {
    expect(
      await checkNodeHistory({
        fetch: nodeServing(rewritten),
        baseUrl: 'http://nodo.invalid',
        previous,
        next: rewrittenHead,
      }),
    ).toEqual({ valid: false, reason: 'start' });
    const down: FetchLike = async () => {
      throw new Error('sin conexión');
    };
    expect(
      await checkNodeHistory({ fetch: down, baseUrl: 'http://nodo.invalid', previous, next }),
    ).toEqual({ valid: false, reason: 'unreachable' });
    const garbage: FetchLike = async () => Response.json({ events: 'no' });
    expect(
      await checkNodeHistory({ fetch: garbage, baseUrl: 'http://nodo.invalid', previous, next }),
    ).toEqual({ valid: false, reason: 'unreachable' });
    expect(
      await checkNodeHistory({ fetch: down, baseUrl: 'http://nodo.invalid', previous: null, next }),
    ).toEqual({ valid: true });
    expect(
      await checkNodeHistory({
        fetch: down,
        baseUrl: 'http://nodo.invalid',
        previous: headOf(honest[1] ?? null),
        next: { ...next, seq: 50_000 },
      }),
    ).toEqual({ valid: false, reason: 'too-long' });
  });

  it('lista los pasos de cabeza que debe verificar un testigo', () => {
    const first = buildNodeHeadEntry(null, 'node.federal', previous, '2026-11-09');
    const second = buildNodeHeadEntry(first, 'node.queretaro', headOf(null), '2026-11-09');
    const third = buildNodeHeadEntry(second, 'node.federal', next, '2026-11-10');
    const entries: NationalLedgerEntry[] = [first, second, third];
    expect(
      nodeHeadTransitions({ lastEntry: null, nodeHeads: {}, directorySerial: 0 }, entries),
    ).toEqual([{ nodeId: 'node.federal', previous, next }]);
    // Desde el estado de un testigo que ya conocía la cabeza anterior de Querétaro.
    expect(
      nodeHeadTransitions(
        {
          lastEntry: first,
          nodeHeads: { 'node.queretaro': headOf(null), 'node.federal': previous },
          directorySerial: 0,
        },
        entries,
      ),
    ).toEqual([{ nodeId: 'node.federal', previous, next }]);
  });
});
