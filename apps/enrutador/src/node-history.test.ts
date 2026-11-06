// Regresión de H4 (G04, poc3-fork): el enrutador y los testigos ya no aceptan una historia
// reescrita del nodo publicada con una secuencia mayor; descargan `ledgerEvents` y comprueban que
// la cadena va de la cabeza anterior a la nueva. Los rechazos quedan registrados.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES } from '@sigilo/contracts';
import type { LedgerEvent } from '@sigilo/contracts';
import { buildEvent } from '@sigilo/core';
import { demoWitnessPrivateKey } from '@sigilo/red';
import type { DemoNodeId } from '@sigilo/red';
import { TEST_DAY, createTestRouter } from './test-support.ts';
import type { TestRouter } from './test-support.ts';
import { runWitnessOnce } from './witness/witness.ts';

function chain(length: number, salt: string, from: LedgerEvent[] = []): LedgerEvent[] {
  const events = [...from];
  while (events.length < length) {
    events.push(
      buildEvent(events.at(-1) ?? null, {
        type: 'complaint.received',
        folio: 'K7Q2-M9XP-4RTD',
        at: TEST_DAY,
        actorRole: 'system',
        payload: { salt, index: events.length },
      }),
    );
  }
  return events;
}

function headAt(router: TestRouter, nodeId: DemoNodeId, event: LedgerEvent | undefined) {
  if (event === undefined) throw new Error('Sin evento.');
  return router.nodeHead(nodeId, event.seq, event.hash);
}

function push(router: TestRouter, nodeId: DemoNodeId, body: unknown): Promise<Response> {
  return Promise.resolve(
    router.app.request(NETWORK_ROUTES.nodeHeads(nodeId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

const honest = chain(10, 'a');
const rewritten = chain(10, 'b', honest.slice(0, 4));

describe('historia del nodo en la bitácora nacional (H4)', () => {
  it('el enrutador acepta la cabeza que extiende la anterior y rechaza la historia reescrita', async () => {
    const router = createTestRouter();
    router.nodeLedgers['node.federal'] = honest.slice(0, 6);
    expect(
      (await push(router, 'node.federal', headAt(router, 'node.federal', honest[5]))).status,
    ).toBe(200);
    // El nodo reescribe su bitácora y publica una cabeza de secuencia mayor (poc3).
    router.nodeLedgers['node.federal'] = rewritten;
    const forged = await push(router, 'node.federal', headAt(router, 'node.federal', rewritten[9]));
    expect(forged.status).toBe(400);
    expect(router.national.rejections(5)).toEqual([
      { nodeId: 'node.federal', day: TEST_DAY, reason: 'history-start' },
    ]);
    // Si el nodo no deja descargar su bitácora, tampoco se acepta.
    router.nodeLedgers['node.federal'] = [];
    expect(
      (await push(router, 'node.federal', headAt(router, 'node.federal', honest[9]))).status,
    ).toBe(400);
    expect(router.national.rejections(1)[0]?.reason).toBe('history-start');
    // Con la historia verdadera sí avanza.
    router.nodeLedgers['node.federal'] = honest;
    const accepted = await push(router, 'node.federal', headAt(router, 'node.federal', honest[9]));
    expect(accepted.status).toBe(200);
    expect((await accepted.json()).status).toBe('recorded');
  });

  it('sin verificador, una cabeza que no es la primera se rechaza como no verificable', async () => {
    const router = createTestRouter();
    const { createNationalLedgerService } = await import('./national-ledger-service.ts');
    const strict = createNationalLedgerService({
      db: router.db,
      operatorPrivateKey: router.keys.operator.privateKey,
    });
    const node = router.directory.directory().nodes.find((item) => item.id === 'node.federal');
    if (node === undefined) throw new Error('Sin nodo.');
    await strict.recordNodeHead(node, headAt(router, 'node.federal', honest[5]), TEST_DAY);
    await expect(
      strict.recordNodeHead(node, headAt(router, 'node.federal', honest[9]), TEST_DAY),
    ).rejects.toThrow('history-unreachable');
  });

  it('un testigo no cofirma la historia reescrita aunque el enrutador la haya aceptado', async () => {
    // Un enrutador que no verifica (comprometido o desactualizado) registra la reescritura.
    const router = createTestRouter({ skipNodeHistory: true });
    router.nodeLedgers['node.federal'] = honest.slice(0, 6);
    await push(router, 'node.federal', headAt(router, 'node.federal', honest[5]));
    router.national.emitHead(1, TEST_DAY);
    const statePath = join(mkdtempSync(join(tmpdir(), 'sigilo-testigo-')), 'state.json');
    const witness = () =>
      runWitnessOnce({
        routerUrl: 'http://enrutador.invalid',
        witnessId: 'observer.university-ejemplo',
        signingPrivateKey: demoWitnessPrivateKey(router.keys, 'observer.university-ejemplo'),
        trust: router.trust,
        statePath,
        fetch: router.networkFetch,
      });
    expect(await witness()).toBe('cosigned');
    router.nodeLedgers['node.federal'] = rewritten;
    expect(
      (await push(router, 'node.federal', headAt(router, 'node.federal', rewritten[9]))).status,
    ).toBe(200);
    router.national.emitHead(1, TEST_DAY);
    expect(await witness()).toBe('refused:node-history-start');
    // Si el nodo sirviera la historia verdadera que llega a esa cabeza, el testigo cofirmaría;
    // con la reescrita, nunca.
    expect(await witness()).toBe('refused:node-history-start');
  });
});
