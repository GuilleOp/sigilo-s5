// Buzón de red del nodo: sin red responde como una ruta inexistente; con red, un sobre que no abre
// responde 400 sin decir por qué, y nadie puede fijar la autoridad destino con una cabecera.
import { describe, expect, it } from 'vitest';
import {
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  NationalOpenDataSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import { deriveReceiptKeys, generateReceiptPhrase, toBase64Url } from '@sigilo/core';
import { RELAY_AUTH_HEADER, relayAuthTag, verifySignedDirectory } from '@sigilo/red';
import { createTestServer } from '../test-support/harness.ts';
import {
  createTestNetwork,
  sealedRelay,
  sendThroughRouter,
} from '../test-support/network-harness.ts';
import { routedTargetOf } from './network.ts';

const SEALED = {
  v: 1,
  to: 'authority.oic-iffe',
  sealed: {
    v: 1,
    suite: 'HPKE-v1-X25519-HKDF-SHA256-AES-256-GCM',
    keyId: '0123456789abcdef',
    enc: 'AAAA',
    ct: 'AAAA',
  },
};

function post(
  app: { request: (path: string, init: RequestInit) => Response | Promise<Response> },
  body: unknown,
) {
  return app.request(NETWORK_ROUTES.nodeInbox, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('buzón de red', () => {
  it('sin red configurada responde 404', async () => {
    const { app } = createTestServer();
    expect((await post(app, SEALED)).status).toBe(404);
  });

  it('un sobre que no abre responde 400', async () => {
    const { federal } = createTestNetwork();
    expect((await post(federal.app, SEALED)).status).toBe(400);
  });

  it('rechaza un sobre válido que no pasó por el enrutador (H11)', async () => {
    const network = createTestNetwork();
    const sealed = await sealedRelay(network, 'authority.oic-iffe', {
      operationId: 'getTracking',
      body: { folio: 'K7Q2-M9XP-4RTD', authKey: 'AAAA' },
    });
    // El mismo sobre, sin la etiqueta HMAC del enrutador o con una falsa, no abre.
    expect((await post(network.federal.app, sealed.relay)).status).toBe(400);
    const forged = await network.federal.app.request(NETWORK_ROUTES.nodeInbox, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [RELAY_AUTH_HEADER]: relayAuthTag(new Uint8Array(32).fill(7), JSON.stringify(sealed.relay)),
      },
      body: JSON.stringify(sealed.relay),
    });
    expect(forged.status).toBe(400);
  });

  it('una denuncia dirigida a la supervisora se queda en el buzón general (H11)', async () => {
    const network = createTestNetwork();
    await network.federal.tasks.run();
    const keys = deriveReceiptKeys(generateReceiptPhrase().entropy);
    const reply = await sendThroughRouter(network, 'authority.oversight-federal', {
      operationId: 'submitComplaint',
      body: {
        version: 1,
        mode: 'anonymous',
        facts: {
          stateCode: '22',
          entityId: 'VE-INSTITUTO',
          offenseCode: 'LGRA-59',
          occurredPeriod: '2026-03',
          accused: 'Servidor Ficticio Uno',
          description: 'Hechos sintéticos dirigidos a la supervisora para saltarse el turnado.',
        },
        evidence: [],
        protectionRequested: false,
        reporterKeys: {
          boxPublicKey: toBase64Url(keys.box.publicKey),
          signingPublicKey: toBase64Url(keys.signing.publicKey),
        },
        authVerifier: keys.authVerifier,
      },
    });
    expect(reply.status).toBe(201);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    expect(network.federal.ctx.complaints.find(folio)?.assignedAuthorityId).toBe(
      'authority.buzon-federal',
    );
  });

  it('una petición directa nunca tiene autoridad destino', () => {
    expect(routedTargetOf(new Request(`http://nodo.invalid${ROUTES.complaints}`))).toBeUndefined();
  });
});

describe('pasos del mismo origen para la web', () => {
  it('sin red, el directorio, el enrutador y el evaluador responden 404', async () => {
    const { app } = createTestServer();
    expect((await app.request(NETWORK_ROUTES.directory)).status).toBe(404);
    expect((await app.request(NETWORK_ROUTES.nationalOpenData)).status).toBe(404);
    expect((await app.request(CORROBORATION_ROUTES.evaluatorChallenge)).status).toBe(404);
    const relay = await app.request(NETWORK_ROUTES.relay, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(SEALED),
    });
    expect(relay.status).toBe(404);
  });

  it('sirve el directorio firmado tal cual y verifica con la raíz fijada', async () => {
    const network = createTestNetwork();
    const response = await network.federal.app.request(NETWORK_ROUTES.directory);
    expect(response.status).toBe(200);
    expect(verifySignedDirectory(await response.json(), network.trust).valid).toBe(true);
  });

  it('pasa el sobre al enrutador y devuelve su respuesta', async () => {
    const network = createTestNetwork();
    await network.queretaro.tasks.run();
    const sealed = await sealedRelay(network, 'authority.comptroller-queretaro', {
      operationId: 'getTracking',
      body: { folio: 'K7Q2-M9XP-4RTD', authKey: 'AAAA' },
    });
    const response = await network.federal.app.request(NETWORK_ROUTES.relay, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'no=pasa' },
      body: JSON.stringify(sealed.relay),
    });
    expect(response.status).toBe(200);
    expect(network.forwarded.some((body) => body.includes(sealed.relay.sealed.ct))).toBe(true);
    expect(network.forwarded.some((body) => body.includes('no=pasa'))).toBe(false);
    // Un cuerpo que no es un sobre de red no sale del nodo.
    const invalid = await network.federal.app.request(NETWORK_ROUTES.relay, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"to":"nadie"}',
    });
    expect(invalid.status).toBe(400);
  });

  it('pasa el corte nacional de datos abiertos, que suma el CSV real de cada nodo', async () => {
    const network = createTestNetwork();
    // Antes del primer corte, el enrutador responde 404 y el nodo también.
    expect((await network.federal.app.request(NETWORK_ROUTES.nationalOpenData)).status).toBe(404);
    const cut = await network.openData.run();
    // El CSV del servidor de referencia cumple las reglas del agregador.
    expect(cut.nodes.map((node) => [node.nodeId, node.status])).toEqual(
      expect.arrayContaining([
        ['node.federal', 'included'],
        ['node.queretaro', 'included'],
      ]),
    );
    const response = await network.queretaro.app.request(NETWORK_ROUTES.nationalOpenData);
    expect(response.status).toBe(200);
    expect(NationalOpenDataSchema.parse(await response.json())).toEqual(cut);
  });

  it('pasa el reto del evaluador', async () => {
    const network = createTestNetwork();
    const response = await network.federal.app.request(CORROBORATION_ROUTES.evaluatorChallenge);
    expect(response.status).toBe(200);
  });
});
