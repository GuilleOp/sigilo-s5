// Pruebas de seguimiento: respuesta indistinguible ante fallos, límites separados (fallos por
// folio, freno global y mensajes) y buzón con secuencia.
import { describe, expect, it } from 'vitest';
import {
  MailboxMessageSchema,
  POW_HEADER,
  PowChallengeSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type { PowPurpose } from '@sigilo/contracts';
import {
  formatPowHeader,
  generateFolio,
  sealMailboxMessage,
  solvePow,
  toBase64Url,
  verifyReceiptEvent,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import type { RateLimitConfig } from '../app.ts';
import {
  authorityRecipient,
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  postJson,
  submitComplaint,
  NEXT_DAY,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

async function setup(
  rateLimits: Partial<RateLimitConfig> = {},
): Promise<{ server: TestServer; reporter: ReceiptKeys; folio: string }> {
  const server = createTestServer({ rateLimits });
  const reporter = createReporter();
  const request = await buildComplaintRequest(server, { mode: 'anonymous', reporter });
  const { folio } = await submitComplaint(server, request);
  return { server, reporter, folio };
}

async function sealReporterMessage(
  server: TestServer,
  reporter: ReceiptKeys,
  folio: string,
  sequence = 0,
) {
  return sealMailboxMessage(
    'Respuesta sintética de la persona denunciante.',
    authorityRecipient(server),
    reporter.signing.privateKey,
    { folio, from: 'reporter', sequence },
  );
}

async function powHeader(server: TestServer, purpose: PowPurpose): Promise<string> {
  const { token, bits } = PowChallengeSchema.parse(
    await (await server.app.request(`${ROUTES.powChallenge}?purpose=${purpose}`)).json(),
  );
  return formatPowHeader(token, solvePow(token, bits) ?? '0');
}

async function submitComplaintWithPow(server: TestServer, reporter: ReceiptKeys) {
  const request = await buildComplaintRequest(server, { mode: 'anonymous', reporter });
  const response = await server.app.request(ROUTES.complaints, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [POW_HEADER]: await powHeader(server, 'complaint'),
    },
    body: JSON.stringify(request),
  });
  return (await response.json()) as { folio: string };
}

function wrongCredentials(folio: string) {
  return { folio, authKey: toBase64Url(createReporter().authKey) };
}

describe('POST tracking', () => {
  it('devuelve la vista de seguimiento con su evento de recepción', async () => {
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
    // El mismo día el evento sigue pendiente de publicar: no se entrega.
    expect(view.receivedEvent).toBeUndefined();
    await server.advanceTo(NEXT_DAY);
    const nextDay = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    if (nextDay.receivedEvent === undefined) throw new Error('Falta el evento publicado.');
    expect(nextDay.receivedEvent.payloadDigest).toBe(view.receipt.payloadDigest);
    expect(verifyReceiptEvent(nextDay.receivedEvent, view.receipt)).toBe(true);
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

  it('trata un authKey no canónico o de otra longitud como credencial incorrecta', async () => {
    const { server, folio } = await setup();
    for (const authKey of ['A', 'AAAA']) {
      const response = await postJson(server.app, ROUTES.tracking, { folio, authKey });
      expect(response.status).toBe(404);
    }
  });

  it('no cuenta los accesos legítimos: iniciar sesión y responder no agotan el límite', async () => {
    const { server, reporter, folio } = await setup({
      authFailuresPerFolio: { limit: 3, windowMs: 60 * 60 * 1000 },
    });
    const credentials = credentialsFor(folio, reporter);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await postJson(server.app, ROUTES.tracking, credentials)).status).toBe(200);
    }
    for (let sequence = 0; sequence < 5; sequence += 1) {
      const sealed = await sealReporterMessage(server, reporter, folio, sequence);
      const sent = await postJson(server.app, ROUTES.trackingMessages, {
        ...credentials,
        ...sealed,
      });
      expect(sent.status).toBe(201);
    }
  });

  it('limita los fallos por folio aunque el folio no exista y solo los fallos reciben 429', async () => {
    const { server, reporter, folio } = await setup();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await postJson(server.app, ROUTES.tracking, wrongCredentials(folio))).status).toBe(
        404,
      );
    }
    expect((await postJson(server.app, ROUTES.tracking, wrongCredentials(folio))).status).toBe(429);
    // Seguridad: quien conozca el folio no puede bloquear a su dueña con fallos acumulados.
    const credentials = credentialsFor(folio, reporter);
    expect((await postJson(server.app, ROUTES.tracking, credentials)).status).toBe(200);
    const sealed = await sealReporterMessage(server, reporter, folio, 0);
    const sent = await postJson(server.app, ROUTES.trackingMessages, { ...credentials, ...sealed });
    expect(sent.status).toBe(201);
    const unknownFolio = generateFolio();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await postJson(server.app, ROUTES.tracking, wrongCredentials(unknownFolio));
    }
    const limited = await postJson(server.app, ROUTES.tracking, wrongCredentials(unknownFolio));
    expect(limited.status).toBe(429);
    await server.advanceTo(new Date('2026-10-20T17:00:00Z'));
    expect((await postJson(server.app, ROUTES.tracking, wrongCredentials(folio))).status).toBe(404);
  });

  it('frena sin bloquear cuando los fallos globales exceden el presupuesto', async () => {
    const { server, reporter, folio } = await setup({
      authFailuresGlobal: { limit: 3, windowMs: 60_000, stepMs: 100, maxDelayMs: 250 },
    });
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await postJson(
        server.app,
        ROUTES.tracking,
        wrongCredentials(generateFolio()),
      );
      statuses.push(response.status);
    }
    expect(statuses).toEqual([404, 404, 404, 404, 404, 404]);
    expect(server.sleeps).toEqual([100, 200]);
    // Las credenciales correctas siguen entrando, solo con espera.
    const legit = await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
    expect(legit.status).toBe(200);
    expect(server.sleeps.at(-1)).toBe(250);
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
    expect(message).toMatchObject({ from: 'reporter', sequence: 0, sentOn: '2026-10-20T15:00Z' });
    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.messages).toEqual([message]);
  });

  it('fecha el mensaje igual que su evento si el reloj retrocede tras publicar', async () => {
    const { server, reporter, folio } = await setup();
    // El día 20 ya se publicó; el reloj vuelve al 19 y el evento se fecha el 21.
    await server.advanceTo(new Date('2026-10-21T09:00:00Z'));
    server.setNow(new Date('2026-10-19T08:00:00Z'));
    const sealed = await sealReporterMessage(server, reporter, folio);
    const response = await postJson(server.app, ROUTES.trackingMessages, {
      ...credentialsFor(folio, reporter),
      ...sealed,
    });
    expect(response.status).toBe(201);
    expect(MailboxMessageSchema.parse(await response.json()).sentOn).toBe('2026-10-21T00:00Z');
  });

  it('rechaza repetir un mensaje o saltar la secuencia', async () => {
    const { server, reporter, folio } = await setup();
    const credentials = credentialsFor(folio, reporter);
    const first = await sealReporterMessage(server, reporter, folio, 0);
    const post = (body: object) =>
      postJson(server.app, ROUTES.trackingMessages, { ...credentials, ...body });
    expect((await post(first)).status).toBe(201);
    expect((await post(first)).status).toBe(400);
    expect((await post(await sealReporterMessage(server, reporter, folio, 2))).status).toBe(400);
    expect((await post(await sealReporterMessage(server, reporter, folio, 1))).status).toBe(201);
  });

  it('aplica un límite de mensajes por folio aparte del de autenticación', async () => {
    const { server, reporter, folio } = await setup({
      reporterMessagesPerFolio: { limit: 2, windowMs: 60 * 60 * 1000 },
    });
    const credentials = credentialsFor(folio, reporter);
    const statuses: number[] = [];
    for (let sequence = 0; sequence < 3; sequence += 1) {
      const sealed = await sealReporterMessage(server, reporter, folio, sequence);
      statuses.push(
        (await postJson(server.app, ROUTES.trackingMessages, { ...credentials, ...sealed })).status,
      );
    }
    expect(statuses).toEqual([201, 201, 429]);
    // Leer el seguimiento sigue permitido.
    expect((await postJson(server.app, ROUTES.tracking, credentials)).status).toBe(200);
  });

  it('cuenta solo los mensajes guardados y no tiene tope global', async () => {
    const { server, reporter, folio } = await setup({
      reporterMessagesPerFolio: { limit: 1, windowMs: 60 * 60 * 1000 },
    });
    const credentials = credentialsFor(folio, reporter);
    const send = async (sequence: number) => {
      const sealed = await sealReporterMessage(server, reporter, folio, sequence);
      return (await postJson(server.app, ROUTES.trackingMessages, { ...credentials, ...sealed }))
        .status;
    };
    // Una secuencia equivocada se rechaza sin gastar el límite del folio.
    expect(await send(5)).toBe(400);
    expect(await send(0)).toBe(201);
    expect(await send(1)).toBe(429);
  });

  it('exige la prueba de trabajo de propósito message', async () => {
    const server = createTestServer({ powBits: 4 });
    const reporter = createReporter();
    const { folio } = await submitComplaintWithPow(server, reporter);
    const sealed = await sealReporterMessage(server, reporter, folio);
    const body = JSON.stringify({ ...credentialsFor(folio, reporter), ...sealed });
    const post = (headers: Record<string, string>) =>
      server.app.request(ROUTES.trackingMessages, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
      });
    expect((await post({})).status).toBe(428);
    expect((await post({ [POW_HEADER]: await powHeader(server, 'complaint') })).status).toBe(428);
    expect((await post({ [POW_HEADER]: await powHeader(server, 'message') })).status).toBe(201);
  });

  it('rechaza una firma inválida o de otra llave', async () => {
    const { server, reporter, folio } = await setup();
    const sealed = await sealReporterMessage(server, reporter, folio);
    const impostor = await sealMailboxMessage(
      'Mensaje sintético firmado con otra llave.',
      authorityRecipient(server),
      createReporter().signing.privateKey,
      { folio, from: 'reporter', sequence: 0 },
    );
    for (const body of [
      { ...sealed, signature: impostor.signature },
      { sequence: 0, envelope: impostor.envelope, signature: impostor.signature },
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
      ...wrongCredentials(folio),
      ...sealed,
    });
    expect(response.status).toBe(404);
  });
});
