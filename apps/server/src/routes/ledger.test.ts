// Pruebas de la bitácora pública: publicación diaria, cadena válida, cabeza firmada, paginación y
// ausencia de folios.
import { describe, expect, it } from 'vitest';
import {
  LEDGER_GENESIS_HASH,
  LedgerPageSchema,
  ROUTES,
  SignedLedgerHeadSchema,
} from '@sigilo/contracts';
import { folioDigest, verifyChain, verifyLedgerHead } from '@sigilo/core';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  NEXT_DAY,
  postJson,
  submitComplaint,
  TEST_TOKEN,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

async function readHead(server: TestServer) {
  return SignedLedgerHeadSchema.parse(await (await server.app.request(ROUTES.ledgerHead)).json());
}

async function readPage(server: TestServer, query = '') {
  const response = await server.app.request(`${ROUTES.ledgerEvents}${query}`);
  return LedgerPageSchema.parse(await response.json());
}

async function submitAnonymous(server: TestServer): Promise<string> {
  const request = await buildComplaintRequest(server, {
    mode: 'anonymous',
    reporter: createReporter(),
  });
  return (await submitComplaint(server, request)).folio;
}

describe('bitácora', () => {
  it('firma la cabeza del génesis cuando no hay eventos publicados', async () => {
    const server = createTestServer();
    const head = await readHead(server);
    expect(head).toMatchObject({ seq: 0, hash: LEDGER_GENESIS_HASH, at: '2026-10-20' });
    expect(verifyLedgerHead(head, server.serverPublicKey)).toBe(true);
  });

  it('publica solo los eventos de días cerrados, en lotes diarios', async () => {
    const server = createTestServer();
    await submitAnonymous(server);
    // El mismo día, la cabeza y las páginas no cambian aunque lleguen denuncias.
    const sameDay = await readHead(server);
    expect(sameDay).toMatchObject({ seq: 0, hash: LEDGER_GENESIS_HASH });
    expect((await readPage(server)).events).toEqual([]);
    await server.advanceTo(new Date('2026-10-20T23:59:59Z'));
    expect(await readHead(server)).toEqual(sameDay);

    await server.advanceTo(NEXT_DAY);
    await submitAnonymous(server);
    const published = await readPage(server);
    expect(published.events.map((event) => [event.seq, event.at])).toEqual([[0, '2026-10-20']]);
    expect(published.head).toMatchObject({ seq: 0, hash: published.events[0]?.hash });
    // La denuncia del día en curso no aparece hasta el día siguiente.
    expect((await readPage(server, '?from=1')).events).toEqual([]);
    await server.advanceTo(new Date('2026-10-22T00:00:00Z'));
    expect((await readPage(server)).events.map((event) => event.seq)).toEqual([0, 1]);
  });

  it('expone una cadena válida, con folioDigest y una cabeza verificable', async () => {
    const server = createTestServer();
    const folios: string[] = [];
    for (const mode of ['sealed', 'anonymous'] as const) {
      const request = await buildComplaintRequest(server, { mode, reporter: createReporter() });
      folios.push((await submitComplaint(server, request)).folio);
    }
    const [first] = folios;
    if (!first) throw new Error('Falta el folio.');
    await server.advanceTo(new Date('2026-10-21T08:00:00Z'));
    await postJson(server.app, ROUTES.authorityStatus(first), { status: 'routing' }, TEST_TOKEN);
    await server.advanceTo(new Date('2026-10-22T08:00:00Z'));

    const response = await server.app.request(`${ROUTES.ledgerEvents}?from=0&limit=500`);
    const raw = await response.text();
    const page = LedgerPageSchema.parse(JSON.parse(raw));
    expect(page.events.map((event) => event.type)).toEqual([
      'complaint.received',
      'complaint.received',
      'complaint.status_changed',
    ]);
    expect(verifyChain(page.events)).toEqual({ valid: true });
    expect(page.events[2]?.folioDigest).toBe(folioDigest(first));
    for (const folio of folios) expect(raw).not.toContain(folio);

    const head = await readHead(server);
    expect(head).toMatchObject({ seq: 2, hash: page.events[2]?.hash, at: '2026-10-21' });
    expect(verifyLedgerHead(head, server.serverPublicKey)).toBe(true);
    expect(page.head).toEqual(head);
  });

  it('pagina desde un evento y verifica el tramo contra el anterior', async () => {
    const server = createTestServer();
    for (let index = 0; index < 3; index += 1) await submitAnonymous(server);
    await server.advanceTo(NEXT_DAY);
    const all = await readPage(server);
    const tail = await readPage(server, '?from=1&limit=1');
    expect(tail.events.map((event) => event.seq)).toEqual([1]);
    expect(verifyChain(tail.events, all.events[0] ?? null)).toEqual({ valid: true });
  });

  it('rechaza parámetros de paginación inválidos y limita a 500', async () => {
    const server = createTestServer();
    for (const query of ['from=-1', 'limit=0', 'limit=abc', 'from=1.5']) {
      const response = await server.app.request(`${ROUTES.ledgerEvents}?${query}`);
      expect(response.status).toBe(400);
    }
    const large = await server.app.request(`${ROUTES.ledgerEvents}?limit=100000`);
    expect(large.status).toBe(200);
    for (const query of ['since=2026-1-01', 'since=ayer', 'since=2026-10-20&from=0']) {
      const response = await server.app.request(`${ROUTES.ledgerEvents}?${query}`);
      expect(response.status, query).toBe(400);
    }
  });

  it('con since entrega la página desde el vecino anterior a ese día', async () => {
    const server = createTestServer();
    await submitAnonymous(server);
    await server.advanceTo(NEXT_DAY);
    await submitAnonymous(server);
    await submitAnonymous(server);
    await server.advanceTo(new Date('2026-10-22T09:00:00Z'));
    const page = await readPage(server, '?since=2026-10-21');
    expect(page.events.map((event) => [event.seq, event.at])).toEqual([
      [0, '2026-10-20'],
      [1, '2026-10-21'],
      [2, '2026-10-21'],
    ]);
    expect(verifyChain(page.events)).toEqual({ valid: true });
    const first = await readPage(server, '?since=2026-10-20');
    expect(first.events[0]?.seq).toBe(0);
  });
});
