// Presupuestos del enrutador bajo presión: el cupo de bytes de relevo en vuelo se reserva por
// petición y se devuelve al terminar (también si falla), los topes de bytes por nodo de la cola en su
// borde exacto, el reparto por turnos que no deja a un nodo sin entregas y los sobres que ya no se
// pueden entregar (nodo fuera del directorio o sobre ilegible).
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES } from '@sigilo/contracts';
import type { RelayRequest } from '@sigilo/contracts';
import { generateFolio } from '@sigilo/core';
import { createNodeNetworkClient, findNode, sealRoutedRequest } from '@sigilo/red';
import type { DemoNodeId } from '@sigilo/red';
import { TEST_DAY, createTestRouter } from './test-support.ts';
import type { TestRouter } from './test-support.ts';

/** Cuerpo que no termina de llegar hasta que se llama a `finish`. */
function heldBody(text: string) {
  let finish: () => void = () => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      finish = () => {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      };
    },
  });
  return { stream, finish: () => finish() };
}

function postRelay(router: TestRouter, body: BodyInit, length: number) {
  return router.app.request(NETWORK_ROUTES.relay, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(length) },
    body,
    duplex: 'half',
  } as RequestInit);
}

async function sealedFor(router: TestRouter, nodeId: DemoNodeId, to: string) {
  const node = findNode(router.signed.directory, nodeId);
  if (node === undefined) throw new Error('sin nodo');
  const { relay } = await sealRoutedRequest(
    {
      to,
      operationId: 'submitComplaint',
      query: {},
      proofOfWork: null,
      body: { kind: 'json', value: { marcador: 'hechos sintéticos' } },
      folio: generateFolio(),
    },
    node,
  );
  return { node, relay: { ...relay, deferral: { proof: 'reto:1' } } as RelayRequest };
}

async function register(router: TestRouter, nodeId: DemoNodeId): Promise<void> {
  const client = createNodeNetworkClient({
    routerUrl: 'http://enrutador.invalid',
    nodeId,
    signingPrivateKey: router.keys.nodes[nodeId].signing.privateKey,
    fetch: router.routerFetch,
  });
  await client.register({ sequence: 1, standardVersion: '0.3.0', acceptsRelay: true });
}

function at(minutes: number): Date {
  return new Date(new Date(`${TEST_DAY}T12:00:00Z`).getTime() + minutes * 60_000);
}

describe('cupo de bytes de relevo en vuelo', () => {
  it('una petición en vuelo ocupa su parte hasta terminar; luego el cupo vuelve', async () => {
    const router = createTestRouter({ relayLimits: { maxRelayBytesInFlight: 100 } });
    const held = heldBody('{}');
    const first = postRelay(router, held.stream, 60);
    // Mientras la primera no termina, otra de 60 bytes no cabe (60 + 60 > 100) y una de 40 sí.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await postRelay(router, '{}', 60)).status).toBe(429);
    expect((await postRelay(router, '{}', 40)).status).toBe(400);
    held.finish();
    expect((await first).status).toBe(400);
    // Terminada, aunque haya fallado, devolvió su parte: otra de 60 ya pasa el cupo.
    expect((await postRelay(router, '{}', 60)).status).toBe(400);
  });

  it('las peticiones que fallan no agotan el cupo', async () => {
    const router = createTestRouter({ relayLimits: { maxRelayBytesInFlight: 10 } });
    for (let index = 0; index < 5; index += 1) {
      expect((await postRelay(router, 'no-es-json', 10)).status).toBe(400);
    }
    expect((await postRelay(router, '{}', 10)).status).toBe(400);
  });

  it('un Content-Length que no es un número se rechaza sin reservar', async () => {
    const router = createTestRouter({ relayLimits: { maxRelayBytesInFlight: 10 } });
    for (const length of ['-1', '1e3', '0x10', '12345678901']) {
      const response = await router.app.request(NETWORK_ROUTES.relay, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': length },
        body: '{}',
      });
      expect(response.status, length).toBe(400);
    }
    expect((await postRelay(router, '{}', 2)).status).toBe(400);
  });
});

describe('topes de la cola en su borde', () => {
  it('el tope de bytes por nodo admite justo hasta el límite y ni un byte más', async () => {
    const probe = createTestRouter({ withRelaySecrets: true });
    const sample = await sealedFor(probe, 'node.queretaro', 'authority.comptroller-queretaro');
    const size = JSON.stringify(sample.relay).length;

    const exact = createTestRouter({
      withRelaySecrets: true,
      queueLimits: { maxBytesPerNode: size * 2 },
    });
    const one = await sealedFor(exact, 'node.queretaro', 'authority.comptroller-queretaro');
    const two = await sealedFor(exact, 'node.queretaro', 'authority.comptroller-queretaro');
    const three = await sealedFor(exact, 'node.queretaro', 'authority.comptroller-queretaro');
    expect(JSON.stringify(two.relay).length).toBe(size);
    expect(exact.queue.enqueue(one.node, one.relay)).not.toBeNull();
    expect(exact.queue.enqueue(two.node, two.relay)).not.toBeNull();
    expect(exact.queue.stats('node.queretaro')).toEqual({ count: 2, bytes: size * 2 });
    expect(exact.queue.enqueue(three.node, three.relay)).toBeNull();
    expect(exact.queue.occupancy()).toBe(1);
    // El tope es por nodo: otro nodo todavía tiene lugar.
    const other = await sealedFor(exact, 'node.oaxaca', 'authority.comptroller-oaxaca');
    expect(exact.queue.enqueue(other.node, other.relay)).not.toBeNull();
    expect(exact.queue.drainCounters().queued).toBe(3);
  });

  it('la ocupación crece con los sobres guardados y vuelve a cero al entregarlos', async () => {
    const router = createTestRouter({ withRelaySecrets: true, queueLimits: { maxPerNode: 4 } });
    await register(router, 'node.queretaro');
    expect(router.queue.occupancy()).toBe(0);
    router.setNodeDown('node.queretaro', true);
    for (let index = 0; index < 2; index += 1) {
      const { node, relay } = await sealedFor(
        router,
        'node.queretaro',
        'authority.comptroller-queretaro',
      );
      router.queue.enqueue(node, relay);
    }
    expect(router.queue.occupancy()).toBe(0.5);
    router.setNodeDown('node.queretaro', false);
    router.setNow(at(1));
    expect((await router.queue.deliverDue()).delivered).toBe(2);
    expect(router.queue.occupancy()).toBe(0);
  });
});

describe('entregas desde la cola', () => {
  it('un nodo que sigue caído no deja sin entregas a los demás en vueltas sucesivas', async () => {
    const router = createTestRouter({ withRelaySecrets: true, queueLimits: { batchSize: 2 } });
    await register(router, 'node.queretaro');
    await register(router, 'node.oaxaca');
    router.setNodeDown('node.queretaro', true);
    router.setNodeDown('node.oaxaca', true);
    for (let index = 0; index < 4; index += 1) {
      const { node, relay } = await sealedFor(
        router,
        'node.queretaro',
        'authority.comptroller-queretaro',
      );
      router.queue.enqueue(node, relay);
    }
    const { node, relay } = await sealedFor(router, 'node.oaxaca', 'authority.comptroller-oaxaca');
    router.setNow(at(0.1));
    router.queue.enqueue(node, relay);
    // Oaxaca vuelve; Querétaro sigue caído con cuatro sobres más viejos.
    router.setNodeDown('node.oaxaca', false);
    router.setNow(at(5));
    const round = await router.queue.deliverDue();
    expect(round).toMatchObject({ delivered: 1, retried: 1 });
    expect(router.queue.stats('node.oaxaca').count).toBe(0);
    expect(router.queue.stats('node.queretaro').count).toBe(4);
  });

  it('dos vueltas a la vez no entregan el mismo sobre dos veces', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    router.setNodeDown('node.queretaro', true);
    const { node, relay } = await sealedFor(
      router,
      'node.queretaro',
      'authority.comptroller-queretaro',
    );
    router.queue.enqueue(node, relay);
    router.setNodeDown('node.queretaro', false);
    router.setNow(at(1));
    const [first, second] = await Promise.all([
      router.queue.deliverDue(),
      router.queue.deliverDue(),
    ]);
    expect(first.delivered + second.delivered).toBe(1);
  });

  it('descarta sin entregar un sobre de un nodo que salió del directorio o ilegible', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    const insert = router.db.prepare(
      'INSERT INTO relay_queue (queue_id, node_id, envelope, size_bytes, accepted_on, expires_at, attempts, next_attempt_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    );
    const expiresAt = at(7 * 24 * 60).getTime();
    insert.run('a'.repeat(32), 'node.desaparecido', '{}', 2, TEST_DAY, expiresAt, 0);
    insert.run('b'.repeat(32), 'node.queretaro', 'no-es-json', 10, TEST_DAY, expiresAt, 0);
    insert.run('c'.repeat(32), 'node.queretaro', '{"v":2}', 7, TEST_DAY, expiresAt, 0);
    const captured = router.captured.length;
    expect(await router.queue.deliverDue()).toMatchObject({ rejected: 3, delivered: 0 });
    expect(router.captured.length).toBe(captured);
    expect(router.queue.stats('node.queretaro').count).toBe(0);
    expect(router.queue.drainCounters()).toMatchObject({ rejected: 3 });
    expect(router.queue.drainCounters()).toMatchObject({ rejected: 0, queued: 0 });
  });
});
