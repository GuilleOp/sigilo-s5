// Pruebas de la bitácora nacional en el enrutador: cabezas de nodo (empujadas y recogidas),
// cabeza nacional cofirmada por testigos 2 de 3 e inclusión verificable de una cabeza de nodo.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEDGER_GENESIS_HASH, NETWORK_ROUTES, ROUTES } from '@sigilo/contracts';
import {
  createNodeNetworkClient,
  demoWitnessPrivateKey,
  verifyNationalHead,
  verifyNodeHeadInclusion,
} from '@sigilo/red';
import type { FetchLike } from '@sigilo/red';
import { collectNodeHeads } from './collector.ts';
import { TEST_DAY, createTestRouter } from './test-support.ts';
import type { TestRouter } from './test-support.ts';
import { runWitnessOnce } from './witness/witness.ts';

function witness(router: TestRouter, witnessId: string, statePath?: string) {
  return runWitnessOnce({
    routerUrl: 'http://enrutador.invalid',
    witnessId,
    signingPrivateKey: demoWitnessPrivateKey(router.keys, witnessId),
    trust: router.trust,
    statePath: statePath ?? join(mkdtempSync(join(tmpdir(), 'sigilo-testigo-')), 'state.json'),
    fetch: router.routerFetch,
  });
}

async function getJson(
  router: TestRouter,
  path: string,
): Promise<{ status: number; body: unknown }> {
  const response = await router.app.request(path);
  return { status: response.status, body: await response.json() };
}

describe('bitácora nacional', () => {
  it('incluye la cabeza de un nodo y la prueba con la cabeza nacional cofirmada 2 de 3', async () => {
    const router = createTestRouter();
    const client = createNodeNetworkClient({
      routerUrl: 'http://enrutador.invalid',
      nodeId: 'node.queretaro',
      signingPrivateKey: router.keys.nodes['node.queretaro'].signing.privateKey,
      fetch: router.routerFetch,
    });
    const head = router.nodeHead('node.queretaro', 7, 'a'.repeat(64));
    expect(await client.publishHead(head)).toEqual({
      nodeId: 'node.queretaro',
      status: 'recorded',
      entrySeq: 1,
    });
    expect((await client.publishHead(head)).status).toBe('unchanged');
    router.national.emitHead(1, TEST_DAY);
    // Sin cofirmas todavía no hay cabeza publicada ni prueba de inclusión.
    expect((await getJson(router, NETWORK_ROUTES.nationalHead)).status).toBe(404);
    expect(await witness(router, 'observer.cpc-queretaro')).toBe('cosigned');
    expect((await getJson(router, NETWORK_ROUTES.nationalHead)).status).toBe(404);
    // El testigo de la universidad está apagado: basta el del nodo Querétaro para 2 de 3.
    expect(await witness(router, 'node.queretaro')).toBe('cosigned');
    const published = await getJson(router, NETWORK_ROUTES.nationalHead);
    expect(published.status).toBe(200);
    expect(verifyNationalHead(published.body, router.trust)).toMatchObject({ valid: true });
    const query = `?nodeId=node.queretaro&seq=7&hash=${'a'.repeat(64)}`;
    const proof = await getJson(router, `${NETWORK_ROUTES.nationalInclusion}${query}`);
    expect(proof.status).toBe(200);
    expect(
      verifyNodeHeadInclusion(proof.body, router.trust, {
        nodeId: 'node.queretaro',
        seq: 7,
        hash: 'a'.repeat(64),
      }),
    ).toEqual({ valid: true, nationalSeq: 1 });
    const missing = await getJson(
      router,
      `${NETWORK_ROUTES.nationalInclusion}?nodeId=node.queretaro&seq=8&hash=${'a'.repeat(64)}`,
    );
    expect(missing.status).toBe(404);
    expect((await getJson(router, `${NETWORK_ROUTES.nationalInclusion}?nodeId=x`)).status).toBe(
      400,
    );
  });

  it('rechaza cabezas con otra firma, que retroceden o que se bifurcan', async () => {
    const router = createTestRouter();
    const push = (nodeId: string, body: unknown) =>
      router.app.request(NETWORK_ROUTES.nodeHeads(nodeId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect(
      (await push('node.queretaro', router.nodeHead('node.queretaro', 5, 'b'.repeat(64)))).status,
    ).toBe(200);
    expect(
      (await push('node.federal', router.nodeHead('node.queretaro', 6, 'c'.repeat(64)))).status,
    ).toBe(400);
    expect(
      (await push('node.queretaro', router.nodeHead('node.queretaro', 4, 'c'.repeat(64)))).status,
    ).toBe(400);
    const fork = await push('node.queretaro', router.nodeHead('node.queretaro', 5, 'd'.repeat(64)));
    expect(fork.status).toBe(400);
    expect(await fork.json()).toEqual({
      error: { code: 'bad_request', message: 'La solicitud no es válida.' },
    });
  });

  it('recoge las cabezas de los nodos en su ruta pública y sigue si uno no responde', async () => {
    const router = createTestRouter();
    const genesis = router.nodeHead('node.queretaro', 0, LEDGER_GENESIS_HASH);
    const fakeFetch: FetchLike = async (input) => {
      const url = String(input);
      if (url === `http://nodo-queretaro.invalid${ROUTES.ledgerHead}`)
        return Response.json(genesis);
      throw new Error('sin conexión');
    };
    const deps = {
      national: router.national,
      directory: router.directory.directory,
      nodeUrl: (node: { baseUrl: string }) => node.baseUrl,
      fetch: fakeFetch,
      today: () => TEST_DAY,
    };
    expect(await collectNodeHeads(deps)).toEqual({
      'node.queretaro': 'recorded',
      'node.federal': 'unreachable',
    });
    expect(await collectNodeHeads(deps)).toEqual({
      'node.queretaro': 'unchanged',
      'node.federal': 'unreachable',
    });
    expect(router.national.pendingHead()?.head.seq).toBe(1);
    const page = await getJson(router, `${NETWORK_ROUTES.nationalEntries}?from=0&limit=10`);
    expect((page.body as { entries: unknown[] }).entries).toHaveLength(2);
  });

  it('un testigo se niega a cofirmar si la bitácora se reescribió después de su última cofirma', async () => {
    const router = createTestRouter();
    await router.national.recordNodeHead(
      router.directory.directory().nodes[0] ??
        (() => {
          throw new Error('sin nodos');
        })(),
      router.nodeHead('node.queretaro', 1, 'e'.repeat(64)),
      TEST_DAY,
    );
    router.national.emitHead(1, TEST_DAY);
    const statePath = join(mkdtempSync(join(tmpdir(), 'sigilo-testigo-')), 'state.json');
    expect(await witness(router, 'observer.university-ejemplo', statePath)).toBe('cosigned');
    expect(await witness(router, 'observer.university-ejemplo', statePath)).toBe('up-to-date');
    // Otro enrutador con otra historia (la misma red y otra base): el testigo lo detecta.
    const other = createTestRouter({
      network: { keys: router.keys, signed: router.signed, trust: router.trust },
    });
    await other.national.recordNodeHead(
      other.directory.directory().nodes[1] ??
        (() => {
          throw new Error('sin nodos');
        })(),
      other.nodeHead('node.federal', 3, 'f'.repeat(64)),
      TEST_DAY,
    );
    other.national.emitHead(1, TEST_DAY);
    const outcome = await runWitnessOnce({
      routerUrl: 'http://enrutador.invalid',
      witnessId: 'observer.university-ejemplo',
      signingPrivateKey: demoWitnessPrivateKey(router.keys, 'observer.university-ejemplo'),
      trust: router.trust,
      statePath,
      fetch: other.routerFetch,
    });
    expect(outcome).toBe('refused:regression');
  });

  it('rechaza cofirmas inválidas y cabezas desconocidas', async () => {
    const router = createTestRouter();
    const pending = router.national.emitHead(1, TEST_DAY);
    if (pending === null) throw new Error('sin cabeza');
    const post = (body: unknown) =>
      router.app.request(NETWORK_ROUTES.nationalCosignatures, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    const forged = {
      seq: pending.head.seq,
      hash: pending.head.hash,
      cosignature: {
        witnessId: 'observer.cpc-queretaro',
        keyId: '0'.repeat(16),
        signature: 'AAAA',
      },
    };
    expect((await post(forged)).status).toBe(400);
    expect((await post({ ...forged, seq: 99 })).status).toBe(400);
    expect((await getJson(router, NETWORK_ROUTES.nationalPending)).status).toBe(200);
    expect((await getJson(router, NETWORK_ROUTES.directory)).status).toBe(200);
  });
});
