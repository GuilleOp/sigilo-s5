// Pruebas de la cola de entrega: con el nodo caído el sobre cerrado queda en la cola con un acuse
// firmado, se reintenta con espera exponencial, se entrega y se borra (de la tabla, del archivo y
// del WAL), vence a los 7 días, respeta sus límites por nodo y exige el reto propio del enrutador.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES, PowChallengeSchema, RelayResponseSchema } from '@sigilo/contracts';
import type { RelayRequest } from '@sigilo/contracts';
import { formatPowHeader, generateFolio, keyIdFor, solvePow, toBase64Url } from '@sigilo/core';
import {
  createNodeNetworkClient,
  findNode,
  sealRoutedRequest,
  verifyRelayQueueReceipt,
} from '@sigilo/red';
import type { DemoNodeId } from '@sigilo/red';
import { retryDelayMs, DEFAULT_RELAY_QUEUE_LIMITS } from './relay-queue.ts';
import { TEST_DAY, createTestRouter } from './test-support.ts';
import type { TestRouter } from './test-support.ts';

const MARKER = 'hechos-que-no-deben-quedar-en-la-cola';

async function register(router: TestRouter, nodeId: DemoNodeId): Promise<void> {
  const client = createNodeNetworkClient({
    routerUrl: 'http://enrutador.invalid',
    nodeId,
    signingPrivateKey: router.keys.nodes[nodeId].signing.privateKey,
    fetch: router.routerFetch,
  });
  await client.register({ sequence: 1, standardVersion: '0.3.0', acceptsRelay: true });
}

async function queueProof(router: TestRouter): Promise<string> {
  const response = await router.app.request(NETWORK_ROUTES.queueChallenge);
  const challenge = PowChallengeSchema.parse(await response.json());
  const counter = solvePow(challenge.token, challenge.bits);
  if (counter === null) throw new Error('sin solución');
  return formatPowHeader(challenge.token, counter);
}

async function deferredComplaint(router: TestRouter, proof?: string): Promise<RelayRequest> {
  const node = findNode(router.signed.directory, 'node.queretaro');
  if (node === undefined) throw new Error('sin nodo');
  const { relay } = await sealRoutedRequest(
    {
      to: 'authority.comptroller-queretaro',
      operationId: 'submitComplaint',
      query: {},
      proofOfWork: null,
      body: { kind: 'json', value: { marcador: MARKER } },
      folio: generateFolio(),
    },
    node,
  );
  return { ...relay, deferral: { proof: proof ?? (await queueProof(router)) } };
}

function post(router: TestRouter, relay: unknown) {
  return router.app.request(NETWORK_ROUTES.relay, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relay),
  });
}

function at(minutes: number): Date {
  return new Date(new Date(`${TEST_DAY}T12:00:00Z`).getTime() + minutes * 60_000);
}

function queueRows(router: TestRouter): number {
  return Number(router.db.prepare('SELECT COUNT(*) AS n FROM relay_queue').get()?.n);
}

const operatorOf = (router: TestRouter) => ({
  keyId: keyIdFor(router.keys.operator.publicKey),
  signingPublicKey: toBase64Url(router.keys.operator.publicKey),
});

describe('cola de entrega del enrutador', () => {
  it('nodo caído: guarda el sobre cerrado, da un acuse firmado y lo entrega al volver', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    router.setNodeDown('node.queretaro', true);
    const relay = await deferredComplaint(router);
    const response = await post(router, relay);
    expect(response.status).toBe(200);
    const body = RelayResponseSchema.parse(await response.json());
    expect(body.queued).not.toBeNull();
    // El acuse lo firmó la operación y es de este sobre y de este nodo; para otro sobre no vale.
    expect(
      verifyRelayQueueReceipt(body.queued, operatorOf(router), {
        node: 'node.queretaro',
        sealed: relay.sealed,
      }),
    ).toBe(true);
    const other = await deferredComplaint(router);
    expect(
      verifyRelayQueueReceipt(body.queued, operatorOf(router), {
        node: 'node.queretaro',
        sealed: other.sealed,
      }),
    ).toBe(false);
    expect(body.queued?.expiresOn).toBe('2026-11-16');
    expect(queueRows(router)).toBe(1);
    // Lo guardado es el sobre cerrado: el contenido en claro no aparece.
    const stored = String(router.db.prepare('SELECT envelope FROM relay_queue').get()?.envelope);
    expect(stored).not.toContain(MARKER);
    expect(stored).not.toContain('authority.');

    // Antes de su espera no se intenta; después, con el nodo aún caído, se reprograma al doble.
    expect((await router.queue.deliverDue()).retried).toBe(0);
    router.setNow(at(1));
    expect(await router.queue.deliverDue()).toMatchObject({ retried: 1, delivered: 0 });
    const next = Number(
      router.db.prepare('SELECT next_attempt_at FROM relay_queue').get()?.next_attempt_at,
    );
    expect(next - at(1).getTime()).toBe(retryDelayMs(1, DEFAULT_RELAY_QUEUE_LIMITS));

    // El nodo vuelve: se entrega (como entrega diferida, con la etiqueta del enrutador) y se borra.
    router.setNodeDown('node.queretaro', false);
    router.setNow(at(3));
    const captured = router.captured.length;
    expect(await router.queue.deliverDue()).toMatchObject({ delivered: 1 });
    expect(queueRows(router)).toBe(0);
    const delivered = router.captured.slice(captured);
    expect(delivered).toHaveLength(1);
    expect(JSON.parse(delivered[0]?.body ?? '{}')).toMatchObject({ deferral: {} });
    router.db.exec('PRAGMA wal_checkpoint(FULL);');
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${router.dbPath}${suffix}`;
      if (!existsSync(path)) continue;
      const bytes = readFileSync(path).toString('latin1');
      for (const fragment of [relay.sealed.enc, relay.sealed.ct.slice(0, 64)]) {
        expect(bytes.includes(fragment), `${suffix || 'base'}: ${fragment.slice(0, 12)}`).toBe(
          false,
        );
      }
    }
    expect(router.queue.drainCounters()).toMatchObject({ queued: 1, delivered: 1, retried: 1 });
  });

  it('con el nodo arriba entrega al momento y no guarda nada', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    const response = RelayResponseSchema.parse(
      await (await post(router, await deferredComplaint(router))).json(),
    );
    expect(response.queued).toBeNull();
    expect(queueRows(router)).toBe(0);
  });

  it('un sobre sin pedir la cola no se guarda: el nodo caído da relleno, como siempre', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    router.setNodeDown('node.queretaro', true);
    const plain: RelayRequest = { ...(await deferredComplaint(router)) };
    delete plain.deferral;
    const response = RelayResponseSchema.parse(await (await post(router, plain)).json());
    expect(response.queued).toBeNull();
    expect(queueRows(router)).toBe(0);
  });

  it('exige el reto propio del enrutador, de un solo uso', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    router.setNodeDown('node.queretaro', true);
    expect((await post(router, await deferredComplaint(router, 'reto-falso:1'))).status).toBe(428);
    const proof = await queueProof(router);
    expect((await post(router, await deferredComplaint(router, proof))).status).toBe(200);
    expect((await post(router, await deferredComplaint(router, proof))).status).toBe(428);
    expect(queueRows(router)).toBe(1);
  });

  it('vence a los 7 días: se borra sin abrir', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    router.setNodeDown('node.queretaro', true);
    await post(router, await deferredComplaint(router));
    router.setNow(at(7 * 24 * 60 - 1));
    expect((await router.queue.deliverDue()).expired).toBe(0);
    router.setNow(at(7 * 24 * 60));
    expect((await router.queue.deliverDue()).expired).toBe(1);
    expect(queueRows(router)).toBe(0);
  });

  it('respeta el límite por nodo y responde 429 cuando la cola está llena', async () => {
    const router = createTestRouter({ withRelaySecrets: true, queueLimits: { maxPerNode: 1 } });
    router.setNodeDown('node.queretaro', true);
    expect((await post(router, await deferredComplaint(router))).status).toBe(200);
    expect((await post(router, await deferredComplaint(router))).status).toBe(429);
    expect(router.queue.stats('node.queretaro').count).toBe(1);
  });

  it('el nodo rechaza una entrega diferida que no es una denuncia con folio y se borra', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    router.setNodeDown('node.queretaro', true);
    const node = findNode(router.signed.directory, 'node.queretaro');
    if (node === undefined) throw new Error('sin nodo');
    const { relay } = await sealRoutedRequest(
      {
        to: 'authority.comptroller-queretaro',
        operationId: 'getTracking',
        query: {},
        proofOfWork: null,
        body: { kind: 'json', value: { folio: 'K7Q2-M9XP-4RTD', authKey: 'AAAA' } },
      },
      node,
    );
    await post(router, { ...relay, deferral: { proof: await queueProof(router) } });
    expect(queueRows(router)).toBe(1);
    router.setNodeDown('node.queretaro', false);
    router.setNow(at(1));
    expect(await router.queue.deliverDue()).toMatchObject({ rejected: 1, delivered: 0 });
    expect(queueRows(router)).toBe(0);
  });

  it('la espera crece al doble hasta un máximo', () => {
    const limits = DEFAULT_RELAY_QUEUE_LIMITS;
    expect(retryDelayMs(0, limits)).toBe(30_000);
    expect(retryDelayMs(1, limits)).toBe(60_000);
    expect(retryDelayMs(3, limits)).toBe(240_000);
    expect(retryDelayMs(40, limits)).toBe(limits.maxRetryMs);
  });
});
