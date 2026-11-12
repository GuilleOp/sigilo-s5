// Pruebas del enrutador ciego: entrega al nodo correcto, no reenvía cabeceras de quien envía,
// responde igual para cualquier destino y no persiste el sobre (se inspecciona la base y su WAL).
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NETWORK_ROUTES,
  RELAY_MAX_BODY_BYTES,
  RELAY_PLAINTEXT_BUCKETS,
  RELAY_V1_REJECTION_MESSAGE,
} from '@sigilo/contracts';
import type { RelayRequest } from '@sigilo/contracts';
import { createNodeNetworkClient, findNode, openRoutedReply, sealRoutedRequest } from '@sigilo/red';
import type { DemoNodeId } from '@sigilo/red';
import { MAX_RELAY_BODY_BYTES } from './app.ts';
import { createTestRouter } from './test-support.ts';
import type { TestRouter } from './test-support.ts';

async function seal(router: TestRouter, to: string, nodeId: DemoNodeId, marker = 'hechos') {
  const node = findNode(router.signed.directory, nodeId);
  if (node === undefined) throw new Error('sin nodo');
  return sealRoutedRequest(
    {
      to,
      operationId: 'submitComplaint',
      query: {},
      proofOfWork: 'reto:1',
      body: { kind: 'json', value: { marcador: marker } },
    },
    node,
  );
}

function post(router: TestRouter, relay: unknown, headers: Record<string, string> = {}) {
  return router.app.request(NETWORK_ROUTES.relay, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(relay),
  });
}

async function register(router: TestRouter, nodeId: DemoNodeId): Promise<void> {
  const client = createNodeNetworkClient({
    routerUrl: 'http://enrutador.invalid',
    nodeId,
    signingPrivateKey: router.keys.nodes[nodeId].signing.privateKey,
    fetch: router.routerFetch,
  });
  await client.register({ sequence: 1, standardVersion: '0.1.0', acceptsRelay: true });
}

describe('enrutador ciego', () => {
  it('entrega el sobre al buzón del nodo de la autoridad y devuelve la respuesta cifrada', async () => {
    const router = createTestRouter();
    await register(router, 'node.queretaro');
    const { relay, replyPrivateKey } = await seal(
      router,
      'authority.comptroller-queretaro',
      'node.queretaro',
    );
    const response = await post(router, relay, {
      'User-Agent': 'Navegador/1.0',
      'X-Forwarded-For': '203.0.113.7',
      'Accept-Language': 'es-MX',
      Cookie: 'sesion=abc',
    });
    expect(response.status).toBe(200);
    const reply = await openRoutedReply(
      await response.json(),
      replyPrivateKey,
      'authority.comptroller-queretaro',
    );
    expect(reply).toEqual({ v: 1, status: 201, body: { kind: 'json', value: { recibido: true } } });
    const [forwarded] = router.captured;
    expect(forwarded?.url).toBe(`http://nodo-queretaro.invalid${NETWORK_ROUTES.nodeInbox}`);
    // Sobre v2: lo que ve el enrutador (y reenvía) dice el nodo, nunca la autoridad.
    expect(relay).toMatchObject({ v: 2, node: 'node.queretaro' });
    expect(forwarded?.body).not.toContain('authority.');
    // Solo el tipo de contenido: nada de la persona llega al nodo.
    expect(Object.keys(forwarded?.headers ?? {})).toEqual(['content-type']);
    expect(JSON.parse(forwarded?.body ?? '{}')).toEqual(relay);
  });

  it('responde igual en estatus, cabeceras y tamaño sin importar el destino ni el resultado', async () => {
    const router = createTestRouter();
    await register(router, 'node.queretaro');
    const delivered = await post(
      router,
      (await seal(router, 'authority.comptroller-queretaro', 'node.queretaro')).relay,
    );
    // El nodo Federal no se registró: el enrutador responde relleno con la misma forma.
    const decoy = await post(
      router,
      (await seal(router, 'authority.oic-iffe', 'node.federal')).relay,
    );
    expect(decoy.status).toBe(delivered.status);
    const headerMap = (response: Response) =>
      Object.fromEntries([...response.headers].filter(([name]) => name !== 'date'));
    expect(headerMap(decoy)).toEqual(headerMap(delivered));
    expect((await decoy.text()).length).toBe((await delivered.text()).length);
  });

  it('rechaza nodos desconocidos, llaves de otro nodo y tamaños fuera de tramo', async () => {
    const router = createTestRouter();
    const { relay } = await seal(router, 'authority.oic-iffe', 'node.federal');
    expect((await post(router, { ...relay, node: 'node.no-existe' })).status).toBe(400);
    // Sobre cifrado hacia la llave del nodo Federal pero con otro nodo en el encabezado.
    expect((await post(router, { ...relay, node: 'node.queretaro' })).status).toBe(400);
    const truncated: RelayRequest = {
      ...relay,
      sealed: { ...relay.sealed, ct: relay.sealed.ct.slice(0, -8) },
    };
    expect((await post(router, truncated)).status).toBe(400);
    const wrongType = await router.app.request(NETWORK_ROUTES.relay, {
      method: 'POST',
      body: JSON.stringify(relay),
    });
    expect(wrongType.status).toBe(415);
    expect(router.captured).toEqual([]);
  });

  it('rechaza el sobre v1 (con la autoridad a la vista) con un mensaje claro', async () => {
    const router = createTestRouter();
    const { relay } = await seal(router, 'authority.oic-iffe', 'node.federal');
    const response = await post(router, { v: 1, to: 'authority.oic-iffe', sealed: relay.sealed });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: 'bad_request', message: RELAY_V1_REJECTION_MESSAGE },
    });
    expect(router.captured).toEqual([]);
  });

  it('no persiste el sobre: ni en las tablas ni en el archivo de la base ni en su WAL', async () => {
    const router = createTestRouter();
    await register(router, 'node.queretaro');
    const before = dumpDatabase(router);
    const { relay } = await seal(
      router,
      'authority.comptroller-queretaro',
      'node.queretaro',
      'marcador-que-no-debe-quedar',
    );
    expect((await post(router, relay, { 'X-Forwarded-For': '198.51.100.23' })).status).toBe(200);
    expect(dumpDatabase(router)).toEqual(before);
    router.db.exec('PRAGMA wal_checkpoint(FULL);');
    for (const suffix of ['', '-wal', '-shm']) {
      const path = `${router.dbPath}${suffix}`;
      if (!existsSync(path)) continue;
      const bytes = readFileSync(path).toString('latin1');
      for (const fragment of [relay.sealed.enc, relay.sealed.ct.slice(0, 64), '198.51.100.23']) {
        expect(bytes.includes(fragment), `${suffix || 'base'}: ${fragment.slice(0, 12)}`).toBe(
          false,
        );
      }
    }
    const tables = router.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String(row.name));
    expect(tables).toEqual([
      'directory_versions',
      'latest_node_heads',
      'national_entries',
      'national_heads',
      'node_head_rejections',
      'node_registrations',
      'relay_queue',
    ]);
    // La cola existe solo para nodos caídos con entrega diferida: un reenvío normal no la toca.
    expect(router.db.prepare('SELECT COUNT(*) AS n FROM relay_queue').get()).toEqual({ n: 0 });
  });

  it('cuenta los resultados de forma agregada, sin destino', async () => {
    const router = createTestRouter();
    await post(router, (await seal(router, 'authority.oic-iffe', 'node.federal')).relay);
    expect(router.relay.drainCounters()).toEqual({
      delivered: 0,
      'not-registered': 1,
      outdated: 0,
      failed: 0,
    });
    expect(router.relay.drainCounters()).toEqual({
      delivered: 0,
      'not-registered': 0,
      outdated: 0,
      failed: 0,
    });
  });
});

describe('topes del relevo antes de leer el cuerpo (H02)', () => {
  /** Cuerpo en flujo que anota si alguien lo empezó a leer. */
  function trackedBody(text: string) {
    const state = { pulled: false };
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          state.pulled = true;
          controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    return { stream, state };
  }

  function postStream(router: TestRouter, body: ReadableStream<Uint8Array>, length?: number) {
    return router.app.request(NETWORK_ROUTES.relay, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(length === undefined ? {} : { 'Content-Length': String(length) }),
      },
      body,
      duplex: 'half',
    } as RequestInit);
  }

  it('rechaza un Content-Length mayor que el tope sin leer el cuerpo', async () => {
    const router = createTestRouter();
    const { stream, state } = trackedBody('{}');
    const response = await postStream(router, stream, MAX_RELAY_BODY_BYTES + 1);
    expect(response.status).toBe(413);
    expect(state.pulled).toBe(false);
  });

  it('sin cupo de bytes en vuelo responde 429 sin leer el cuerpo', async () => {
    const router = createTestRouter({ relayLimits: { maxRelayBytesInFlight: 1000 } });
    const declared = trackedBody('{}');
    expect((await postStream(router, declared.stream, 5000)).status).toBe(429);
    expect(declared.state.pulled).toBe(false);
    // Sin Content-Length se reserva el tope completo: tampoco cabe.
    const chunked = trackedBody('{}');
    expect((await postStream(router, chunked.stream)).status).toBe(429);
    expect(chunked.state.pulled).toBe(false);
    // Uno que sí cabe se procesa normalmente.
    await register(router, 'node.queretaro');
    const { relay } = await seal(router, 'authority.comptroller-queretaro', 'node.queretaro');
    const body = JSON.stringify(relay);
    const small = createTestRouter({
      relayLimits: { maxRelayBytesInFlight: body.length + 10 },
    });
    await register(small, 'node.queretaro');
    const { relay: smallRelay } = await seal(
      small,
      'authority.comptroller-queretaro',
      'node.queretaro',
    );
    const text = JSON.stringify(smallRelay);
    const ok = trackedBody(text);
    expect((await postStream(small, ok.stream, text.length)).status).toBe(200);
  });

  it('sin cupo de reenvíos simultáneos responde 429 sin leer el cuerpo', async () => {
    const router = createTestRouter({ relayLimits: { maxConcurrentRelays: 0 } });
    const { stream, state } = trackedBody('{}');
    expect((await postStream(router, stream, 2)).status).toBe(429);
    expect(state.pulled).toBe(false);
  });

  it('el tope de cuerpo cubre el tramo mayor y es el mismo en el nodo', () => {
    const largest = Math.max(...RELAY_PLAINTEXT_BUCKETS);
    expect(MAX_RELAY_BODY_BYTES).toBe(RELAY_MAX_BODY_BYTES);
    expect(MAX_RELAY_BODY_BYTES).toBeGreaterThan(Math.ceil(((largest + 16) * 4) / 3));
    expect(MAX_RELAY_BODY_BYTES).toBeLessThan(23 * 1024 * 1024);
  });
});

describe('registro de nodos', () => {
  it('acepta un registro firmado y rechaza uno reenviado, ajeno o de un nodo inexistente', async () => {
    const router = createTestRouter();
    const client = createNodeNetworkClient({
      routerUrl: 'http://enrutador.invalid',
      nodeId: 'node.federal',
      signingPrivateKey: router.keys.nodes['node.federal'].signing.privateKey,
      fetch: router.routerFetch,
    });
    const receipt = await client.register({
      sequence: 5,
      standardVersion: '0.1.0',
      acceptsRelay: false,
    });
    expect(receipt).toMatchObject({ nodeId: 'node.federal', sequence: 5, acceptsRelay: false });
    await expect(
      client.register({ sequence: 5, standardVersion: '0.1.0', acceptsRelay: true }),
    ).rejects.toThrow('400');
    const impostor = createNodeNetworkClient({
      routerUrl: 'http://enrutador.invalid',
      nodeId: 'node.federal',
      signingPrivateKey: router.keys.nodes['node.queretaro'].signing.privateKey,
      fetch: router.routerFetch,
    });
    await expect(
      impostor.register({ sequence: 9, standardVersion: '0.1.0', acceptsRelay: true }),
    ).rejects.toThrow('400');
    const missing = await router.app.request(NETWORK_ROUTES.nodeRegistration('node.nadie'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(missing.status).toBe(404);
  });
});

function dumpDatabase(router: TestRouter): string {
  const tables = router.db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => String(row.name));
  return JSON.stringify(
    tables.map((table) => [table, router.db.prepare(`SELECT * FROM ${table}`).all()]),
  );
}
