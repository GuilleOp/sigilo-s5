// Pruebas de la bitácora pública: cadena válida, cabeza firmada, paginación y ausencia de folios.
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
  postJson,
  submitComplaint,
  TEST_TOKEN,
} from '../test-support/harness.ts';

describe('bitácora', () => {
  it('firma la cabeza del génesis cuando está vacía', async () => {
    const server = createTestServer();
    const head = SignedLedgerHeadSchema.parse(
      await (await server.app.request(ROUTES.ledgerHead)).json(),
    );
    expect(head).toMatchObject({ seq: 0, hash: LEDGER_GENESIS_HASH, at: '2026-10-20' });
    expect(verifyLedgerHead(head, server.serverPublicKey)).toBe(true);
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
    server.setNow(new Date('2026-10-21T08:00:00Z'));
    await postJson(server.app, ROUTES.authorityStatus(first), { status: 'routing' }, TEST_TOKEN);

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

    const head = SignedLedgerHeadSchema.parse(
      await (await server.app.request(ROUTES.ledgerHead)).json(),
    );
    expect(head).toMatchObject({ seq: 2, hash: page.events[2]?.hash, at: '2026-10-21' });
    expect(verifyLedgerHead(head, server.serverPublicKey)).toBe(true);
    expect(page.head).toEqual(head);
  });

  it('pagina desde un evento y verifica el tramo contra el anterior', async () => {
    const server = createTestServer();
    for (let index = 0; index < 3; index += 1) {
      const request = await buildComplaintRequest(server, {
        mode: 'anonymous',
        reporter: createReporter(),
      });
      await submitComplaint(server, request);
    }
    const all = LedgerPageSchema.parse(
      await (await server.app.request(ROUTES.ledgerEvents)).json(),
    );
    const tail = LedgerPageSchema.parse(
      await (await server.app.request(`${ROUTES.ledgerEvents}?from=1&limit=1`)).json(),
    );
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
  });
});
