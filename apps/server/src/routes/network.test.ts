// Buzón de red del nodo: sin red responde como una ruta inexistente; con red, un sobre que no abre
// responde 400 sin decir por qué, y nadie puede fijar la autoridad destino con una cabecera.
import { describe, expect, it } from 'vitest';
import {
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  NationalOpenDataSchema,
  NodeHealthReportSchema,
  PDN_SCOPES,
  RELAY_V1_REJECTION_MESSAGE,
  ROUTES,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import type { PdnScope } from '@sigilo/contracts';
import { deriveReceiptKeys, generateReceiptPhrase, toBase64Url } from '@sigilo/core';
import {
  RELAY_AUTH_HEADER,
  openRoutedReply,
  relayAuthTag,
  sealRoutedRequest,
  verifySignedDirectory,
} from '@sigilo/red';
import { STANDARD_VERSION } from '@sigilo/contracts/standard';
import { createTestServer } from '../test-support/harness.ts';
import { SERVER_SOFTWARE_VERSION } from '../version.ts';
import {
  createTestNetwork,
  sealedRelay,
  sendThroughRouter,
} from '../test-support/network-harness.ts';
import { routedTargetOf } from './network.ts';

const SEALED = {
  v: 2,
  node: 'node.federal',
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
  token?: string | null,
) {
  return app.request(NETWORK_ROUTES.nodeInbox, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token == null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  });
}

/** Token que el nodo dio a la SESNA (la del harness) con el permiso pedido. */
async function sesnaToken(
  network: ReturnType<typeof createTestNetwork>,
  nodeId: 'node.federal' | 'node.queretaro',
  scope: PdnScope = PDN_SCOPES.deliveries,
): Promise<string> {
  const node = network.services.directory.nodes.find((item) => item.id === nodeId);
  if (node === undefined) throw new Error('Nodo sin directorio.');
  const token = await network.tokens.token(node, scope);
  if (token === null) throw new Error('El nodo no dio token.');
  return token;
}

describe('buzón de red', () => {
  it('sin red configurada responde 404', async () => {
    const { app } = createTestServer();
    expect((await post(app, SEALED)).status).toBe(404);
  });

  it('un sobre que no abre responde 400', async () => {
    const network = createTestNetwork();
    const token = await sesnaToken(network, 'node.federal');
    expect((await post(network.federal.app, SEALED, token)).status).toBe(400);
  });

  it('exige el token OAuth 2.0 de la SESNA con sesna:entregas y de este nodo', async () => {
    const network = createTestNetwork();
    const missing = await post(network.federal.app, SEALED);
    expect(missing.status).toBe(401);
    expect(missing.headers.get('WWW-Authenticate')).toContain('error="invalid_token"');
    // Otro permiso: 403 con insufficient_scope.
    const statistics = await sesnaToken(network, 'node.federal', PDN_SCOPES.statistics);
    const wrongScope = await post(network.federal.app, SEALED, statistics);
    expect(wrongScope.status).toBe(403);
    expect(wrongScope.headers.get('WWW-Authenticate')).toContain('insufficient_scope');
    // Un token de Querétaro no vale en el nodo Federal (otro emisor y otra llave).
    const foreign = await sesnaToken(network, 'node.queretaro');
    expect((await post(network.federal.app, SEALED, foreign)).status).toBe(401);
    expect((await post(network.federal.app, SEALED, 'a.b.c')).status).toBe(401);
  });

  it('rechaza un sobre válido que no pasó por el enrutador (H11)', async () => {
    const network = createTestNetwork();
    const sealed = await sealedRelay(network, 'authority.oic-iffe', {
      operationId: 'getTracking',
      body: { folio: 'K7Q2-M9XP-4RTD', authKey: 'AAAA' },
    });
    // El mismo sobre, aun con un token válido, sin la etiqueta HMAC del enrutador o con una falsa,
    // no abre: el HMAC es la defensa en profundidad si el token se filtrara.
    const token = await sesnaToken(network, 'node.federal');
    expect((await post(network.federal.app, sealed.relay, token)).status).toBe(400);
    const forged = await network.federal.app.request(NETWORK_ROUTES.nodeInbox, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
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

  it('el nodo entrega solo a autoridades que aloja: una de otro nodo dentro del sobre no pasa', async () => {
    const network = createTestNetwork();
    await network.federal.tasks.run();
    const federalNode = network.services.directory.nodes.find((node) => node.id === 'node.federal');
    if (federalNode === undefined) throw new Error('sin nodo');
    // Sobre hacia el nodo Federal que dice, adentro, una autoridad de Querétaro.
    const sealed = await sealRoutedRequest(
      {
        to: 'authority.comptroller-queretaro',
        operationId: 'getPowChallenge',
        query: { purpose: 'complaint' },
        proofOfWork: null,
        body: { kind: 'none' },
      },
      federalNode,
    );
    const response = await network.routerApp.request(
      `http://enrutador.invalid${NETWORK_ROUTES.relay}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sealed.relay),
      },
    );
    expect(response.status).toBe(200);
    // El nodo lo rechazó: el enrutador respondió relleno, que no abre.
    await expect(
      openRoutedReply(
        await response.json(),
        sealed.replyPrivateKey,
        'authority.comptroller-queretaro',
      ),
    ).rejects.toThrow();
    expect(network.relay.drainCounters()).toMatchObject({ delivered: 0, failed: 1 });
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

  it('sirve su salud al enrutador: identificador y versiones, sin datos de denuncias', async () => {
    const { app } = createTestServer();
    expect((await app.request(NETWORK_ROUTES.nodeHealth)).status).toBe(404);
    const network = createTestNetwork();
    const response = await network.queretaro.app.request(NETWORK_ROUTES.nodeHealth);
    expect(response.status).toBe(200);
    expect(NodeHealthReportSchema.parse(await response.json())).toEqual({
      v: 1,
      nodeId: 'node.queretaro',
      softwareVersion: SERVER_SOFTWARE_VERSION,
      standardVersion: STANDARD_VERSION,
    });
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
    // Un sobre v1 (autoridad a la vista) se rechaza con un mensaje claro antes de salir del nodo.
    const forwardedBefore = network.forwarded.length;
    const legacy = await network.federal.app.request(NETWORK_ROUTES.relay, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: 1, to: 'authority.oic-iffe', sealed: sealed.relay.sealed }),
    });
    expect(legacy.status).toBe(400);
    expect(await legacy.json()).toEqual({
      error: { code: 'bad_request', message: RELAY_V1_REJECTION_MESSAGE },
    });
    expect(network.forwarded.length).toBe(forwardedBefore);
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
