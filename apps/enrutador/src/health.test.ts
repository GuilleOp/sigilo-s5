// Pruebas de la salud de los nodos y la versión mínima: arriba o abajo, versiones, último contacto
// y cola por nodo, en JSON y en la página sencilla; a un nodo con versión menor a la mínima no se
// le entrega (con aviso claro) y lo que pidió la cola espera hasta que se actualiza.
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES, NetworkHealthSchema, PowChallengeSchema } from '@sigilo/contracts';
import { formatPowHeader, generateFolio, solvePow } from '@sigilo/core';
import { createNodeNetworkClient, findNode, openRoutedReply, sealRoutedRequest } from '@sigilo/red';
import type { DemoNodeId } from '@sigilo/red';
import { compareVersions } from './node-health.ts';
import { TEST_DAY, createTestRouter } from './test-support.ts';
import type { TestRouter } from './test-support.ts';

async function register(router: TestRouter, nodeId: DemoNodeId): Promise<void> {
  const client = createNodeNetworkClient({
    routerUrl: 'http://enrutador.invalid',
    nodeId,
    signingPrivateKey: router.keys.nodes[nodeId].signing.privateKey,
    fetch: router.routerFetch,
  });
  await client.register({ sequence: 1, standardVersion: '0.3.0', acceptsRelay: true });
}

async function healthOf(router: TestRouter) {
  const response = await router.app.request(NETWORK_ROUTES.networkHealth);
  expect(response.status).toBe(200);
  return NetworkHealthSchema.parse(await response.json());
}

async function relayTo(router: TestRouter, deferred: boolean) {
  const node = findNode(router.signed.directory, 'node.queretaro');
  if (node === undefined) throw new Error('sin nodo');
  const sealed = await sealRoutedRequest(
    {
      to: 'authority.comptroller-queretaro',
      operationId: 'submitComplaint',
      query: {},
      proofOfWork: null,
      body: { kind: 'json', value: { marcador: 'hechos' } },
      folio: generateFolio(),
    },
    node,
  );
  let relay: object = sealed.relay;
  if (deferred) {
    const challenge = PowChallengeSchema.parse(
      await (await router.app.request(NETWORK_ROUTES.queueChallenge)).json(),
    );
    const counter = solvePow(challenge.token, challenge.bits) ?? '0';
    relay = { ...sealed.relay, deferral: { proof: formatPowHeader(challenge.token, counter) } };
  }
  const response = await router.app.request(NETWORK_ROUTES.relay, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relay),
  });
  return { response, sealed };
}

describe('salud de los nodos', () => {
  it('reporta arriba o abajo, versiones, último contacto, registro y cola', async () => {
    const router = createTestRouter({ withRelaySecrets: true });
    await register(router, 'node.queretaro');
    // Antes de la primera consulta: sin consultar.
    const initial = await healthOf(router);
    expect(initial.checkedAt).toBeNull();
    expect(initial.nodes.map((node) => node.status)).toEqual(['unknown', 'unknown', 'unknown']);

    await router.health.check();
    const first = await healthOf(router);
    expect(first.checkedAt).toBe(`${TEST_DAY}T12:00Z`);
    const queretaro = first.nodes.find((node) => node.nodeId === 'node.queretaro');
    expect(queretaro).toMatchObject({
      status: 'up',
      softwareVersion: '1.0.1',
      standardVersion: '0.3.0',
      lastContactAt: `${TEST_DAY}T12:00Z`,
      registered: true,
      deliverable: true,
      warning: null,
      queued: 0,
    });
    expect(first.nodes.find((node) => node.nodeId === 'node.federal')).toMatchObject({
      status: 'up',
      registered: false,
      warning: 'not-registered',
    });

    // Se cae: queda abajo con su último contacto, y lo que pidió la cola aparece como conteo.
    router.setNodeDown('node.queretaro', true);
    router.setNow(new Date(`${TEST_DAY}T12:30:00Z`));
    expect((await relayTo(router, true)).response.status).toBe(200);
    await router.health.check();
    const second = (await healthOf(router)).nodes.find((node) => node.nodeId === 'node.queretaro');
    expect(second).toMatchObject({
      status: 'down',
      lastCheckAt: `${TEST_DAY}T12:30Z`,
      lastContactAt: `${TEST_DAY}T12:00Z`,
      warning: 'unreachable',
      queued: 1,
    });
    // Nada de denuncias ni autoridades en la salud.
    const text = JSON.stringify(await healthOf(router));
    expect(text).not.toContain('authority.');
    expect(text).not.toContain('hechos');

    // La vista sencilla muestra lo mismo, con el texto escapado.
    const view = await router.app.request(NETWORK_ROUTES.networkHealthView);
    expect(view.headers.get('Content-Type')).toContain('text/html');
    const html = await view.text();
    expect(html).toContain('Salud de los nodos de la red');
    expect(html).toContain('No responde');
    expect(html).not.toContain('<script');
  });

  it('con versión mínima no entrega a un nodo con versión menor, avisa y la cola espera', async () => {
    const router = createTestRouter({ withRelaySecrets: true, minimumNodeVersion: '1.1.0' });
    await register(router, 'node.queretaro');
    await router.health.check();
    const health = await healthOf(router);
    expect(health.minimumSoftwareVersion).toBe('1.1.0');
    expect(health.nodes.find((node) => node.nodeId === 'node.queretaro')).toMatchObject({
      status: 'up',
      softwareVersion: '1.0.1',
      deliverable: false,
      warning: 'below-minimum-version',
    });
    // Un aviso por nodo por debajo (los tres nodos de prueba tienen 1.0.1).
    expect(router.warnings).toHaveLength(3);
    const warning = router.warnings.find((item) => item.includes('node.queretaro')) ?? '';
    expect(warning).toContain('menor que la mínima 1.1.0');
    expect(warning).toContain('no le entrega sobres');
    // Una segunda vuelta no repite el aviso.
    await router.health.check();
    expect(router.warnings).toHaveLength(3);

    // Sin cola: relleno, como si no se pudiera entregar; el nodo no recibe nada.
    const captured = router.captured.length;
    const plain = await relayTo(router, false);
    await expect(
      openRoutedReply(
        await plain.response.json(),
        plain.sealed.replyPrivateKey,
        'authority.comptroller-queretaro',
      ),
    ).rejects.toThrow();
    // Con cola: queda guardada hasta que el nodo se actualice.
    expect((await relayTo(router, true)).response.status).toBe(200);
    expect(router.captured.slice(captured).some((item) => item.url.endsWith('/inbox'))).toBe(false);
    expect(router.relay.drainCounters()).toMatchObject({ outdated: 2, delivered: 0 });

    router.nodeVersions['node.queretaro'] = '1.1.0';
    await router.health.check();
    router.setNow(new Date(`${TEST_DAY}T12:05:00Z`));
    expect(await router.queue.deliverDue()).toMatchObject({ delivered: 1 });
  });

  it('con versión mínima y versión aún desconocida, tampoco entrega', async () => {
    const router = createTestRouter({ minimumNodeVersion: '1.0.0' });
    await register(router, 'node.queretaro');
    expect(router.health.meetsMinimumVersion({ id: 'node.queretaro' })).toBe(false);
    await router.health.check();
    expect(router.health.meetsMinimumVersion({ id: 'node.queretaro' })).toBe(true);
  });

  it('compara versiones mayor.menor.parche como números', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.1', '1.0.1')).toBe(0);
    expect(compareVersions('0.9.0', '1.0.0')).toBeLessThan(0);
    expect(() => compareVersions('1.0', '1.0.0')).toThrow();
  });
});
