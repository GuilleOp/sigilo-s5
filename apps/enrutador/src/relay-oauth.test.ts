// Pruebas de la entrega con OAuth 2.0: el enrutador agrega el token que le dio el nodo
// (`Authorization: Bearer`) junto a la etiqueta HMAC, y si el nodo lo rechaza con 401 lo olvida.
import { describe, expect, it } from 'vitest';
import { RELAY_AUTH_HEADER, findNode, sealRoutedRequest, signNodeRegistration } from '@sigilo/red';
import type { FetchLike } from '@sigilo/red';
import { openRouterDatabase } from './database.ts';
import { createRelayService } from './relay-service.ts';
import { createTestNetwork } from './test-support.ts';

async function setup(status: number) {
  const network = createTestNetwork();
  const node = findNode(network.signed.directory, 'node.queretaro');
  if (node === undefined) throw new Error('sin nodo');
  const headers: Record<string, string>[] = [];
  const fetch: FetchLike = async (input, init) => {
    headers.push(Object.fromEntries(new Request(input, init).headers));
    return new Response('{}', { status });
  };
  const rejected: string[] = [];
  const relay = createRelayService({
    db: openRouterDatabase(':memory:'),
    nodeUrl: (item) => item.baseUrl,
    fetch,
    relaySecret: () => new Uint8Array(32).fill(1),
    authorization: async (item) => `token-de-${item.id}`,
    onUnauthorized: (item) => rejected.push(item.id),
  });
  relay.register(
    signNodeRegistration(
      { nodeId: node.id, sequence: 1, standardVersion: '0.1.0', acceptsRelay: true },
      network.keys.nodes['node.queretaro'].signing.privateKey,
    ),
    '2026-11-09',
  );
  const { relay: request } = await sealRoutedRequest(
    {
      to: 'authority.comptroller-queretaro',
      operationId: 'getPowChallenge',
      query: {},
      proofOfWork: null,
      body: { kind: 'none' },
    },
    node,
  );
  await relay.forward(node, request);
  return { headers, rejected };
}

describe('entrega con OAuth 2.0', () => {
  it('lleva el token Bearer del nodo y la etiqueta HMAC, y nada más de quien envía', async () => {
    const { headers } = await setup(200);
    expect(headers[0]?.authorization).toBe('Bearer token-de-node.queretaro');
    expect(headers[0]?.[RELAY_AUTH_HEADER.toLowerCase()]).toBeDefined();
    expect(Object.keys(headers[0] ?? {}).sort()).toEqual(
      ['authorization', 'content-type', RELAY_AUTH_HEADER.toLowerCase()].sort(),
    );
  });

  it('si el nodo responde 401 avisa para pedir otro token', async () => {
    expect((await setup(401)).rejected).toEqual(['node.queretaro']);
    expect((await setup(400)).rejected).toEqual([]);
  });
});
