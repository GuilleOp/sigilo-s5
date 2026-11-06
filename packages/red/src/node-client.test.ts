// Pruebas del cliente del nodo: registro firmado, publicación de la cabeza, directorio verificado
// y buzón de red que traduce los sobres a las rutas v1 del nodo.
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES, POW_HEADER, ROUTES } from '@sigilo/contracts';
import { keyIdFor, signLedgerHead } from '@sigilo/core';
import { findNode } from './directory.ts';
import {
  createNodeInboxHandler,
  createNodeNetworkClient,
  responseToRoutedReply,
  routedRequestToFetch,
} from './node-client.ts';
import type { FetchLike } from './node-client.ts';
import { openRoutedReply, sealRoutedRequest } from './relay-envelope.ts';
import { signNodeRegistration, signingKeyIdOf, verifyNodeRegistration } from './registration.ts';
import { FIXTURE_DAY, createNetworkFixture } from './test-fixtures.ts';

const { keys, signed, trust } = createNetworkFixture();
const queretaro = findNode(signed.directory, 'node.queretaro');
if (queretaro === undefined) throw new Error('sin nodo');
const signingKey = keys.nodes['node.queretaro'].signing.privateKey;

describe('registro del nodo', () => {
  it('se firma con la llave del nodo y no vale para otro nodo ni alterado', () => {
    const registration = signNodeRegistration(
      { nodeId: 'node.queretaro', sequence: 1, standardVersion: '0.1.0', acceptsRelay: true },
      signingKey,
    );
    expect(verifyNodeRegistration(registration, queretaro)).toBe(true);
    expect(verifyNodeRegistration({ ...registration, sequence: 2 }, queretaro)).toBe(false);
    const federal = findNode(signed.directory, 'node.federal');
    expect(federal && verifyNodeRegistration(registration, federal)).toBe(false);
    expect(signingKeyIdOf(signingKey)).toBe(queretaro.signingKeyId);
  });
});

describe('cliente del nodo', () => {
  it('registra, publica la cabeza y verifica el directorio contra el enrutador', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fakeFetch: FetchLike = async (input, init) => {
      const url = String(input);
      const body: unknown = init?.body === undefined ? null : JSON.parse(String(init.body));
      calls.push({ url, body });
      if (url.endsWith(NETWORK_ROUTES.directory)) return Response.json(signed);
      if (url.endsWith('/registration')) {
        return Response.json({
          nodeId: 'node.queretaro',
          sequence: 7,
          acceptsRelay: true,
          registeredOn: FIXTURE_DAY,
        });
      }
      return Response.json({ nodeId: 'node.queretaro', status: 'recorded', entrySeq: 3 });
    };
    const client = createNodeNetworkClient({
      routerUrl: 'http://enrutador.invalid/',
      nodeId: 'node.queretaro',
      signingPrivateKey: signingKey,
      fetch: fakeFetch,
    });
    const receipt = await client.register({
      sequence: 7,
      standardVersion: '0.1.0',
      acceptsRelay: true,
    });
    expect(receipt.sequence).toBe(7);
    expect(verifyNodeRegistration(calls[0]?.body, queretaro)).toBe(true);
    expect(calls[0]?.url).toBe(
      `http://enrutador.invalid${NETWORK_ROUTES.nodeRegistration('node.queretaro')}`,
    );
    const head = signLedgerHead(
      {
        seq: 0,
        hash: '0'.repeat(64),
        at: FIXTURE_DAY,
        serverKeyId: keyIdFor(keys.nodes['node.queretaro'].signing.publicKey),
      },
      signingKey,
    );
    expect((await client.publishHead(head)).status).toBe('recorded');
    expect((await client.fetchDirectory(trust)).valid).toBe(true);
    const failing = createNodeNetworkClient({
      routerUrl: 'http://enrutador.invalid',
      nodeId: 'node.queretaro',
      signingPrivateKey: signingKey,
      fetch: async () => new Response('', { status: 503 }),
    });
    await expect(failing.publishHead(head)).rejects.toThrow('503');
  });
});

describe('buzón de red del nodo', () => {
  it('abre el sobre, llama a la ruta v1 equivalente y cifra la respuesta', async () => {
    const seen: Request[] = [];
    const inbox = createNodeInboxHandler({
      nodeBoxPrivateKey: keys.nodes['node.queretaro'].box.privateKey,
      handle: async (routed) => {
        const request = routedRequestToFetch(routed);
        seen.push(request);
        return responseToRoutedReply(Response.json({ ok: true }, { status: 201 }));
      },
    });
    const { relay, replyPrivateKey } = await sealRoutedRequest(
      {
        to: 'authority.comptroller-queretaro',
        operationId: 'submitComplaint',
        query: {},
        proofOfWork: 'reto:7',
        body: { kind: 'json', value: { prueba: true } },
      },
      queretaro,
    );
    const response = await inbox(
      new Request('http://nodo.invalid/api/v1/red/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relay),
      }),
    );
    expect(response.status).toBe(200);
    const reply = await openRoutedReply(await response.json(), replyPrivateKey, relay.to);
    expect(reply).toEqual({ v: 1, status: 201, body: { kind: 'json', value: { ok: true } } });
    const [request] = seen;
    expect(new URL(request?.url ?? '').pathname).toBe(ROUTES.complaints);
    expect(request?.headers.get(POW_HEADER)).toBe('reto:7');
    expect([...(request?.headers.keys() ?? [])].sort()).toEqual(
      ['content-type', POW_HEADER.toLowerCase()].sort(),
    );
  });

  it('responde 400 a un sobre que no abre y 500 cifrado si el nodo falla', async () => {
    const inbox = createNodeInboxHandler({
      nodeBoxPrivateKey: keys.nodes['node.queretaro'].box.privateKey,
      handle: async () => {
        throw new Error('falla interna');
      },
    });
    const bad = await inbox(
      new Request('http://nodo.invalid/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(bad.status).toBe(400);
    const { relay, replyPrivateKey } = await sealRoutedRequest(
      {
        to: 'authority.comptroller-queretaro',
        operationId: 'getPowChallenge',
        query: { purpose: 'complaint' },
        proofOfWork: null,
        body: { kind: 'none' },
      },
      queretaro,
    );
    const response = await inbox(
      new Request('http://nodo.invalid/x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(relay),
      }),
    );
    const reply = await openRoutedReply(await response.json(), replyPrivateKey, relay.to);
    expect(reply.status).toBe(500);
    expect(JSON.stringify(reply)).not.toContain('falla interna');
  });

  it('traduce cuerpos binarios y consultas', async () => {
    const request = routedRequestToFetch({
      v: 1,
      to: 'authority.oic-iffe',
      operationId: 'uploadEvidence',
      query: { purpose: 'complaint' },
      proofOfWork: null,
      body: { kind: 'binary', mediaType: 'image/png', data: 'iVBORw' },
      replyPublicKey: 'AAAA',
    });
    expect(request.method).toBe('POST');
    expect(request.headers.get('Content-Type')).toBe('image/png');
    expect(new URL(request.url).search).toBe('?purpose=complaint');
    const reply = await responseToRoutedReply(
      new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } }),
    );
    expect(reply.body).toEqual({ kind: 'binary', mediaType: 'image/png', data: 'AQID' });
    expect((await responseToRoutedReply(new Response(null, { status: 204 }))).body).toEqual({
      kind: 'none',
    });
  });
});
