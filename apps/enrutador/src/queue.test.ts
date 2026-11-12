// Pruebas de la cola de entrega: con el nodo caído el sobre cerrado queda en la cola con un acuse
// firmado, se reintenta con espera exponencial, se entrega y se borra (de la tabla, del archivo y
// del WAL), vence a los 7 días, respeta sus límites por nodo y en total, reparte las entregas por
// turnos entre nodos y exige el reto propio del enrutador, adaptativo (H07).
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
import { createQueuePow, occupancyExtraBits, queueLoadExtraBits } from './queue-pow.ts';
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
  await client.register({ sequence: 1, standardVersion: '0.2.0', acceptsRelay: true });
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

  it('H07: con el nodo arriba, la marca de diferida no llega al nodo (cobra su propio reto)', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    const relay = await deferredComplaint(router);
    expect((await post(router, relay)).status).toBe(200);
    const delivered = router.captured.find((request) =>
      request.url.endsWith(NETWORK_ROUTES.nodeInbox),
    );
    // El nodo recibe el sobre sin `deferral`: no puede saltarse su prueba de trabajo adaptativa ni
    // gastar su cupo de entregas diferidas.
    expect(JSON.parse(delivered?.body ?? '{}')).toEqual({
      v: relay.v,
      node: relay.node,
      sealed: relay.sealed,
    });
  });

  it('H07: los reintentos desde la cola sí llevan la marca de diferida', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    router.setNodeDown('node.queretaro', true);
    const relay = await deferredComplaint(router);
    await post(router, relay);
    router.setNodeDown('node.queretaro', false);
    router.captured.length = 0;
    router.setNow(at(1));
    expect((await router.queue.deliverDue()).delivered).toBe(1);
    expect(JSON.parse(router.captured.at(-1)?.body ?? '{}')).toEqual(relay);
  });

  it('H07: tope total entre nodos y reparto por turnos al entregar', async () => {
    const router = createTestRouter({
      withRelaySecrets: true,
      queueLimits: { maxTotalBytes: 1, batchSize: 2 },
    });
    router.setNodeDown('node.queretaro', true);
    // Con 1 byte de tope total, nada cabe aunque el nodo tenga lugar.
    expect((await post(router, await deferredComplaint(router))).status).toBe(429);
    expect(queueRows(router)).toBe(0);

    const fair = createTestRouter({ withRelaySecrets: true, queueLimits: { batchSize: 2 } });
    await register(fair, 'node.queretaro');
    await register(fair, 'node.oaxaca');
    fair.setNodeDown('node.queretaro', true);
    fair.setNodeDown('node.oaxaca', true);
    for (let index = 0; index < 3; index += 1) {
      await post(fair, await deferredComplaint(fair));
    }
    const oaxaca = findNode(fair.signed.directory, 'node.oaxaca');
    if (oaxaca === undefined) throw new Error('sin nodo');
    const { relay } = await sealRoutedRequest(
      {
        to: 'authority.comptroller-oaxaca',
        operationId: 'submitComplaint',
        query: {},
        proofOfWork: null,
        body: { kind: 'json', value: { marcador: MARKER } },
        folio: generateFolio(),
      },
      oaxaca,
    );
    fair.setNow(at(0.5));
    await post(fair, { ...relay, deferral: { proof: await queueProof(fair) } });
    fair.captured.length = 0;
    fair.setNow(at(2));
    await fair.queue.deliverDue();
    // Una vuelta de 2: un sobre de cada nodo, aunque Querétaro tenga tres más viejos.
    const origins = fair.captured
      .filter((request) => request.url.endsWith(NETWORK_ROUTES.nodeInbox))
      .map((request) => new URL(request.url).origin)
      .sort();
    expect(origins).toEqual(['http://nodo-oaxaca.invalid', 'http://nodo-queretaro.invalid']);
  });

  it('H07: la dificultad del reto de la cola sube con la ocupación y con la carga', () => {
    let fill = 0;
    const now = () => at(0);
    const pow = createQueuePow({ bits: 18, now, occupancy: () => fill, loadThreshold: 2 });
    expect(pow.currentBits()).toBe(18);
    fill = 0.3;
    expect(pow.currentBits()).toBe(19);
    fill = 0.8;
    expect(pow.currentBits()).toBe(21);
    fill = 1;
    expect(pow.currentBits()).toBe(21);
    expect(pow.issue().bits).toBe(21);
    // Nunca más de la base más el margen.
    expect(occupancyExtraBits(1) + queueLoadExtraBits(1_000_000, 2)).toBeGreaterThan(4);
    expect(
      createQueuePow({ bits: 18, now, occupancy: () => 1, loadThreshold: 0 }).currentBits(),
    ).toBe(21);
    // Un reto emitido con la cola vacía deja de servir cuando la cola se llena (más de un bit).
    fill = 0;
    const cheap = createQueuePow({ bits: 4, now, occupancy: () => fill });
    const challenge = cheap.issue();
    const counter = solvePow(challenge.token, challenge.bits) ?? '0';
    fill = 0.8;
    expect(cheap.spend(formatPowHeader(challenge.token, counter))).toBe(false);
  });

  it('la espera crece al doble hasta un máximo', () => {
    const limits = DEFAULT_RELAY_QUEUE_LIMITS;
    expect(retryDelayMs(0, limits)).toBe(30_000);
    expect(retryDelayMs(1, limits)).toBe(60_000);
    expect(retryDelayMs(3, limits)).toBe(240_000);
    expect(retryDelayMs(40, limits)).toBe(limits.maxRetryMs);
  });
});
