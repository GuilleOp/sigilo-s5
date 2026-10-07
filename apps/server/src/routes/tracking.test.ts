// Pruebas de seguimiento: respuesta indistinguible ante fallos, límite de intentos y buzón.
import { describe, expect, it } from 'vitest';
import { MailboxMessageSchema, ROUTES, TrackingViewSchema } from '@sigilo/contracts';
import { generateFolio, sealMailboxMessage, toBase64Url } from '@sigilo/core';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  postJson,
  submitComplaint,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';
import type { ReceiptKeys } from '@sigilo/core';

async function setup(): Promise<{ server: TestServer; reporter: ReceiptKeys; folio: string }> {
  const server = createTestServer();
  const reporter = createReporter();
  const request = await buildComplaintRequest(server, { mode: 'anonymous', reporter });
  const { folio } = await submitComplaint(server, request);
  return { server, reporter, folio };
}

async function sealReporterMessage(server: TestServer, reporter: ReceiptKeys, folio: string) {
  const { authority } = server.keys.publicKeySet;
  return sealMailboxMessage(
    'Respuesta sintética de la persona denunciante.',
    { keyId: authority.keyId, publicKey: server.authorityBox.publicKey },
    reporter.signing.privateKey,
    { folio, from: 'reporter' },
  );
}

describe('POST tracking', () => {
  it('devuelve la vista de seguimiento con credenciales válidas', async () => {
    const { server, reporter, folio } = await setup();
    const response = await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
    expect(response.status).toBe(200);
    const view = TrackingViewSchema.parse(await response.json());
    expect(view).toMatchObject({
      folio,
      mode: 'anonymous',
      status: 'received',
      timeline: [{ status: 'received', on: '2026-10-20' }],
      identityAccess: [],
      messages: [],
    });
  });

  it('responde exactamente igual a folio inexistente y a verificador incorrecto', async () => {
    const { server, folio } = await setup();
    const wrongKey = toBase64Url(createReporter().authKey);
    const unknown = await postJson(server.app, ROUTES.tracking, {
      folio: generateFolio(),
      authKey: wrongKey,
    });
    const mismatch = await postJson(server.app, ROUTES.tracking, { folio, authKey: wrongKey });
    expect(unknown.status).toBe(404);
    expect(mismatch.status).toBe(404);
    expect(await mismatch.text()).toBe(await unknown.text());
    expect([...mismatch.headers.entries()]).toEqual([...unknown.headers.entries()]);
  });

  it('trata un authKey no canónico como credencial incorrecta', async () => {
    const { server, folio } = await setup();
    const response = await postJson(server.app, ROUTES.tracking, { folio, authKey: 'A' });
    expect(response.status).toBe(404);
  });

  it('limita los intentos por folio aunque el folio no exista', async () => {
    const { server, reporter, folio } = await setup();
    const credentials = credentialsFor(folio, reporter);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await postJson(server.app, ROUTES.tracking, credentials)).status).toBe(200);
    }
    const limited = await postJson(server.app, ROUTES.tracking, credentials);
    expect(limited.status).toBe(429);
    server.setNow(new Date('2026-10-20T17:00:00Z'));
    expect((await postJson(server.app, ROUTES.tracking, credentials)).status).toBe(200);
  });

  it('aplica un límite global', async () => {
    const server = createTestServer({
      rateLimits: {
        perFolio: { limit: 10, windowMs: 60_000 },
        global: { limit: 3, windowMs: 60_000 },
      },
    });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const credentials = {
        folio: generateFolio(),
        authKey: toBase64Url(createReporter().authKey),
      };
      statuses.push((await postJson(server.app, ROUTES.tracking, credentials)).status);
    }
    expect(statuses).toEqual([404, 404, 404, 429]);
  });
});

describe('POST tracking/messages', () => {
  it('guarda un mensaje firmado por la persona denunciante y lo muestra en el seguimiento', async () => {
    const { server, reporter, folio } = await setup();
    const sealed = await sealReporterMessage(server, reporter, folio);
    const response = await postJson(server.app, ROUTES.trackingMessages, {
      ...credentialsFor(folio, reporter),
      ...sealed,
    });
    expect(response.status).toBe(201);
    const message = MailboxMessageSchema.parse(await response.json());
    expect(message).toMatchObject({ from: 'reporter', sentOn: '2026-10-20T15:00Z' });
    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.messages).toEqual([message]);
  });

  it('rechaza una firma inválida o de otra llave', async () => {
    const { server, reporter, folio } = await setup();
    const sealed = await sealReporterMessage(server, reporter, folio);
    const impostor = await sealMailboxMessage(
      'Mensaje sintético firmado con otra llave.',
      {
        keyId: server.keys.publicKeySet.authority.keyId,
        publicKey: server.authorityBox.publicKey,
      },
      createReporter().signing.privateKey,
      { folio, from: 'reporter' },
    );
    for (const body of [
      { ...sealed, signature: impostor.signature },
      { envelope: impostor.envelope, signature: impostor.signature },
    ]) {
      const response = await postJson(server.app, ROUTES.trackingMessages, {
        ...credentialsFor(folio, reporter),
        ...body,
      });
      expect(response.status).toBe(400);
    }
  });

  it('exige credenciales válidas con la misma respuesta que el seguimiento', async () => {
    const { server, reporter, folio } = await setup();
    const sealed = await sealReporterMessage(server, reporter, folio);
    const response = await postJson(server.app, ROUTES.trackingMessages, {
      folio,
      authKey: toBase64Url(createReporter().authKey),
      ...sealed,
    });
    expect(response.status).toBe(404);
  });
});
