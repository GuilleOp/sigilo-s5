// Pruebas de los sobres de red: ida y vuelta, tramos fijos, ligadura al destino y relleno.
import { describe, expect, it } from 'vitest';
import { RELAY_PLAINTEXT_BUCKETS } from '@sigilo/contracts';
import type { RoutedRequest } from '@sigilo/contracts';
import { envelopePlaintextLength, generateBoxKeyPair } from '@sigilo/core';
import { findNode } from './directory.ts';
import {
  hasRelayBucketSize,
  openRoutedReply,
  openRoutedRequest,
  relayBucketFor,
  relayDecoyResponse,
  sealRoutedReply,
  sealRoutedRequest,
} from './relay-envelope.ts';
import { createNetworkFixture } from './test-fixtures.ts';

const { signed, keys } = createNetworkFixture();
const federal = findNode(signed.directory, 'node.federal');
if (federal === undefined) throw new Error('sin nodo federal');
const federalBoxKey = keys.nodes['node.federal'].box.privateKey;

const INPUT = {
  to: 'authority.oic-iffe',
  operationId: 'submitComplaint',
  query: {},
  proofOfWork: 'token:42',
  body: { kind: 'json', value: { marcador: 'hechos-sinteticos' } },
} as const satisfies Omit<RoutedRequest, 'v' | 'replyPublicKey'>;

describe('sobres de red', () => {
  it('el nodo abre la petición y el navegador abre la respuesta', async () => {
    const { relay, replyPrivateKey } = await sealRoutedRequest(INPUT, federal);
    expect(Object.keys(relay).sort()).toEqual(['sealed', 'to', 'v']);
    expect(JSON.stringify(relay)).not.toContain('hechos-sinteticos');
    const opened = await openRoutedRequest(relay, federalBoxKey);
    expect(opened).toMatchObject(INPUT);
    const response = await sealRoutedReply(
      { v: 1, status: 201, body: { kind: 'json', value: { folio: 'K7Q2-M9XP-4RTD' } } },
      opened,
    );
    const reply = await openRoutedReply(response, replyPrivateKey, INPUT.to);
    expect(reply.status).toBe(201);
  });

  it('rellena a un tramo fijo sin importar el tamaño real', async () => {
    const small = await sealRoutedRequest(INPUT, federal);
    const larger = await sealRoutedRequest(
      { ...INPUT, body: { kind: 'json', value: { texto: 'x'.repeat(2000) } } },
      federal,
    );
    expect(envelopePlaintextLength(small.relay.sealed)).toBe(RELAY_PLAINTEXT_BUCKETS[0]);
    expect(envelopePlaintextLength(larger.relay.sealed)).toBe(RELAY_PLAINTEXT_BUCKETS[0]);
    expect(hasRelayBucketSize(small.relay.sealed)).toBe(true);
    expect(relayBucketFor(5000)).toBe(RELAY_PLAINTEXT_BUCKETS[1]);
    expect(() => relayBucketFor(64 * 1024 * 1024)).toThrow();
  });

  it('el sobre queda ligado a la autoridad destino y a la llave del nodo', async () => {
    const { relay } = await sealRoutedRequest(INPUT, federal);
    await expect(
      openRoutedRequest({ ...relay, to: 'authority.oic-dfps' }, federalBoxKey),
    ).rejects.toThrow('No se pudo abrir el sobre de red.');
    await expect(
      openRoutedRequest(relay, keys.nodes['node.queretaro'].box.privateKey),
    ).rejects.toThrow('No se pudo abrir el sobre de red.');
  });

  it('la respuesta de relleno tiene la misma forma y no abre', async () => {
    const { relay, replyPrivateKey } = await sealRoutedRequest(INPUT, federal);
    const opened = await openRoutedRequest(relay, federalBoxKey);
    const real = await sealRoutedReply({ v: 1, status: 200, body: { kind: 'none' } }, opened);
    const decoy = relayDecoyResponse(real.sealed.keyId);
    expect(decoy.sealed.ct.length).toBe(real.sealed.ct.length);
    expect(decoy.sealed.enc.length).toBe(real.sealed.enc.length);
    await expect(openRoutedReply(decoy, replyPrivateKey, INPUT.to)).rejects.toThrow(
      /intenta de nuevo/u,
    );
    const stranger = generateBoxKeyPair();
    await expect(openRoutedReply(real, stranger.privateKey, INPUT.to)).rejects.toThrow();
  });
});
