// Pruebas del panel de autoridad: autenticación, detalle, identidad (incluido el rechazo del
// trasplante), estatus sin carreras, buzón con secuencia y descarga de pruebas.
import { describe, expect, it } from 'vitest';
import {
  ComplaintDetailSchema,
  ComplaintSummarySchema,
  LedgerPageSchema,
  MailboxMessageSchema,
  OpenIdentityResponseSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type {
  ComplaintDetail,
  EvidenceDescriptor,
  SubmitComplaintRequest,
} from '@sigilo/contracts';
import {
  fromBase64Url,
  identityContextFromDetail,
  identityOpenedPayloadDigest,
  receiptTagFor,
  receivedPayloadDigest,
  reconcileIdentityOpenings,
  sealedIdentityDigest,
  submissionDigestFromDetail,
  verifyChain,
  openIdentity,
  openMailboxMessage,
  sealMailboxMessage,
  toBase64Url,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import { z } from 'zod';
import { createContext } from '../context.ts';
import { ApiFailure } from '../http/errors.ts';
import { changeStatus } from '../services/complaint-service.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  NEXT_DAY,
  postJson,
  reporterRecipient,
  samplePng,
  submitComplaint,
  SYNTHETIC_IDENTITY,
  TEST_TOKEN,
  uploadEvidence,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

const LEGAL_BASIS = 'Artículo sintético 64 de la ley de prueba: requerimiento judicial.';
const OPEN_ERROR = 'No se pudo abrir el sobre.';

interface Scenario {
  server: TestServer;
  reporter: ReceiptKeys;
  folio: string;
  evidence: EvidenceDescriptor;
  request: SubmitComplaintRequest;
}

async function setup(
  mode: 'sealed' | 'anonymous' = 'sealed',
  offenseCode?: string,
): Promise<Scenario> {
  const server = createTestServer();
  const reporter = createReporter();
  const upload = await uploadEvidence(server.app, samplePng(128), 'image/png');
  const evidence = (await upload.json()) as EvidenceDescriptor;
  const request = await buildComplaintRequest(server, {
    mode,
    reporter,
    evidence: [evidence],
    ...(offenseCode === undefined ? {} : { offenseCode }),
  });
  const { folio } = await submitComplaint(server, request);
  return { server, reporter, folio, evidence, request };
}

async function trackingView({ server, reporter, folio }: Scenario) {
  const response = await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
  return TrackingViewSchema.parse(await response.json());
}

async function fetchDetail(server: TestServer, folio: string): Promise<ComplaintDetail> {
  const response = await getAsAuthority(server.app, ROUTES.authorityComplaint(folio));
  return ComplaintDetailSchema.parse(await response.json());
}

async function requestIdentity(server: TestServer, folio: string) {
  const response = await postJson(
    server.app,
    ROUTES.authorityIdentity(folio),
    { legalBasis: LEGAL_BASIS },
    TEST_TOKEN,
  );
  return OpenIdentityResponseSchema.parse(await response.json());
}

describe('autenticación de la autoridad', () => {
  it('rechaza peticiones sin token, con token incorrecto o con otro esquema', async () => {
    const { server } = await setup();
    const attempts = [
      server.app.request(ROUTES.authorityComplaints),
      getAsAuthority(server.app, ROUTES.authorityComplaints, `${TEST_TOKEN}x`),
      server.app.request(ROUTES.authorityComplaints, {
        headers: { Authorization: `Basic ${TEST_TOKEN}` },
      }),
      postJson(server.app, ROUTES.authorityStatus('AAAA-AAAA-AAAA'), { status: 'routing' }),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(401);
      expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
    }
  });
});

describe('listado y detalle', () => {
  it('lista resúmenes sin el sobre de identidad', async () => {
    const { server, folio } = await setup();
    const response = await getAsAuthority(server.app, ROUTES.authorityComplaints);
    const raw = await response.text();
    const summaries = z.array(ComplaintSummarySchema.strict()).parse(JSON.parse(raw));
    expect(summaries).toEqual([
      {
        folio,
        mode: 'sealed',
        status: 'received',
        receivedOn: '2026-10-20',
        stateCode: '22',
        offenseCode: 'LGRA-52',
        protectionRequested: true,
      },
    ]);
    expect(raw).not.toContain('sealedIdentity');
  });

  it('pagina el listado con offset y limit', async () => {
    const { server, folio } = await setup();
    const page = async (query: string) =>
      (await getAsAuthority(server.app, `${ROUTES.authorityComplaints}?${query}`)).json();
    expect(await page('offset=0&limit=1')).toMatchObject([{ folio }]);
    expect(await page('offset=1&limit=1')).toEqual([]);
    for (const query of ['limit=0', 'offset=-1', 'limit=x']) {
      const response = await getAsAuthority(server.app, `${ROUTES.authorityComplaints}?${query}`);
      expect(response.status, query).toBe(400);
    }
  });

  it('devuelve el detalle con todo lo necesario para recalcular el contexto, sin identidad', async () => {
    const { server, folio, evidence, reporter, request } = await setup();
    const response = await getAsAuthority(server.app, ROUTES.authorityComplaint(folio));
    const raw = await response.text();
    const detail = ComplaintDetailSchema.parse(JSON.parse(raw));
    expect(detail).toMatchObject({
      version: 1,
      facts: request.facts,
      evidence: [evidence],
      reporterKeys: request.reporterKeys,
      authVerifier: reporter.authVerifier,
      identityOpenedCount: 0,
    });
    expect(fromBase64Url(detail.reporterKeys.boxPublicKey)).toEqual(reporter.box.publicKey);
    // Solo viaja el digesto del sobre, nunca el sobre.
    expect(detail).not.toHaveProperty('sealedIdentity');
    expect(raw).not.toContain('"ct"');
    if (request.sealedIdentity === undefined) throw new Error('Falta el sobre.');
    expect(detail.sealedIdentityDigest).toBe(sealedIdentityDigest(request.sealedIdentity));
  });

  it('permite recalcular el digesto del envío y compararlo con el evento publicado', async () => {
    for (const mode of ['sealed', 'anonymous'] as const) {
      const { server, folio } = await setup(mode);
      const sameDay = await fetchDetail(server, folio);
      expect(sameDay.receivedEventSeq).toBeUndefined();
      await server.advanceTo(NEXT_DAY);
      const detail = await fetchDetail(server, folio);
      const seq = detail.receivedEventSeq;
      if (seq === undefined) throw new Error('Falta la secuencia publicada.');
      const page = LedgerPageSchema.parse(
        await (await server.app.request(`${ROUTES.ledgerEvents}?from=${seq}&limit=1`)).json(),
      );
      expect(page.events[0]?.payloadDigest).toBe(
        receivedPayloadDigest(folio, submissionDigestFromDetail(detail)),
      );
    }
  });

  it('guarda la clave equivalente en los hechos y la principal en el resumen', async () => {
    const { server, folio, request } = await setup('anonymous', 'CPF-222');
    const detail = await fetchDetail(server, folio);
    expect(detail.facts.offenseCode).toBe('CPF-222');
    expect(detail.summary.offenseCode).toBe('LGRA-52');
    // Los hechos tal como se enviaron mantienen el digesto del envío.
    expect(detail.facts).toEqual(request.facts);
  });

  it('responde 404 con folio inexistente o mal formado', async () => {
    const { server } = await setup();
    for (const folio of ['ZZZZ-ZZZZ-ZZZZ', 'no-es-folio']) {
      const response = await getAsAuthority(server.app, ROUTES.authorityComplaint(folio));
      expect(response.status).toBe(404);
    }
  });
});

describe('apertura de identidad', () => {
  it('registra el fundamento, entrega el sobre y lo hace visible en el seguimiento', async () => {
    const scenario = await setup();
    const { server, folio } = scenario;
    await server.advanceTo(new Date('2026-10-22T09:15:00Z'));
    const detail = await fetchDetail(server, folio);
    const opened = await requestIdentity(server, folio);
    expect(opened).not.toHaveProperty('authVerifier');
    const identity = await openIdentity(
      opened.sealedIdentity,
      server.authorityBox.privateKey,
      identityContextFromDetail(detail),
    );
    expect(identity).toEqual(SYNTHETIC_IDENTITY);

    // La persona la ve de inmediato, aunque el evento siga pendiente de publicar.
    const view = await trackingView(scenario);
    expect(view.identityAccess).toEqual([
      {
        on: '2026-10-22',
        actorRole: 'authority',
        legalBasis: LEGAL_BASIS,
        openingId: opened.openingId,
      },
    ]);
    expect((await fetchDetail(server, folio)).identityOpenedCount).toBe(1);
    const authVerifier = scenario.reporter.authVerifier;
    const sameDay = LedgerPageSchema.parse(
      await (await server.app.request(ROUTES.ledgerEvents)).json(),
    );
    expect(sameDay.events.some((event) => event.type === 'identity.opened')).toBe(false);

    // Al día siguiente, el evento público lleva la etiqueta del recibo y concilia con el seguimiento.
    await server.advanceTo(new Date('2026-10-23T09:00:00Z'));
    const page = LedgerPageSchema.parse(
      await (await server.app.request(ROUTES.ledgerEvents)).json(),
    );
    expect(verifyChain(page.events)).toEqual({ valid: true });
    const openings = page.events.filter((event) => event.type === 'identity.opened');
    expect(openings).toHaveLength(1);
    expect(openings[0]?.receiptTag).toBe(receiptTagFor(authVerifier));
    expect(openings[0]?.payloadDigest).toBe(
      identityOpenedPayloadDigest({
        folio,
        openingId: opened.openingId,
        legalBasis: LEGAL_BASIS,
        authVerifier,
      }),
    );
    expect(
      reconcileIdentityOpenings(page.events, view.identityAccess, {
        folio,
        authVerifier,
        publishedThrough: page.head.at,
      }),
    ).toEqual({ unlisted: [], unpublished: [] });
  });

  it('no abre si el servidor altera hechos, pruebas o llaves del detalle', async () => {
    const { server, folio } = await setup();
    const detail = await fetchDetail(server, folio);
    const opened = await requestIdentity(server, folio);
    const otherKeys = createReporter();
    const tampered: ComplaintDetail[] = [
      { ...detail, facts: { ...detail.facts, accused: 'Otra persona sintética' } },
      { ...detail, evidence: [] },
      {
        ...detail,
        reporterKeys: {
          ...detail.reporterKeys,
          boxPublicKey: toBase64Url(otherKeys.box.publicKey),
        },
      },
      { ...detail, summary: { ...detail.summary, protectionRequested: false } },
    ];
    for (const variant of tampered) {
      await expect(
        openIdentity(
          opened.sealedIdentity,
          server.authorityBox.privateKey,
          identityContextFromDetail(variant),
        ),
      ).rejects.toThrow(OPEN_ERROR);
    }
  });

  it('rechaza el trasplante del sobre de A a una denuncia B', async () => {
    const victim = await setup();
    const { server, request: requestA } = victim;
    const attacker = createReporter();
    const requestB = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter: attacker,
      stateCode: '09',
      offenseCode: 'LGRA-53',
    });
    // Ataque original: B lleva el sobre y el authVerifier de A. El servidor lo rechaza.
    const withVerifierOfA = {
      ...requestB,
      sealedIdentity: requestA.sealedIdentity,
      authVerifier: requestA.authVerifier,
    };
    const rejected = await postJson(server.app, ROUTES.complaints, withVerifierOfA);
    expect(rejected.status).toBe(400);
    // Variante: B lleva el sobre de A con un recibo propio. Se acepta, pero no abre en B.
    const withEnvelopeOfA = { ...requestB, sealedIdentity: requestA.sealedIdentity };
    const { folio: folioB } = await submitComplaint(server, withEnvelopeOfA);
    const detailB = await fetchDetail(server, folioB);
    const openedB = await requestIdentity(server, folioB);
    await expect(
      openIdentity(
        openedB.sealedIdentity,
        server.authorityBox.privateKey,
        identityContextFromDetail(detailB),
      ),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('responde 404 si la denuncia es anónima y 400 sin fundamento suficiente', async () => {
    const anonymous = await setup('anonymous');
    const response = await postJson(
      anonymous.server.app,
      ROUTES.authorityIdentity(anonymous.folio),
      { legalBasis: LEGAL_BASIS },
      TEST_TOKEN,
    );
    expect(response.status).toBe(404);
    const sealed = await setup();
    const short = await postJson(
      sealed.server.app,
      ROUTES.authorityIdentity(sealed.folio),
      { legalBasis: 'corto' },
      TEST_TOKEN,
    );
    expect(short.status).toBe(400);
  });
});

describe('cambio de estatus', () => {
  it('agrega el cambio a la línea de tiempo y rechaza repetir el estatus actual', async () => {
    const scenario = await setup();
    const { server, folio } = scenario;
    await server.advanceTo(new Date('2026-10-23T23:59:59Z'));
    const response = await postJson(
      server.app,
      ROUTES.authorityStatus(folio),
      { status: 'routing' },
      TEST_TOKEN,
    );
    expect(response.status).toBe(200);
    expect(ComplaintSummarySchema.parse(await response.json()).status).toBe('routing');
    const repeated = await postJson(
      server.app,
      ROUTES.authorityStatus(folio),
      { status: 'routing' },
      TEST_TOKEN,
    );
    expect(repeated.status).toBe(400);
    const view = await trackingView(scenario);
    expect(view.status).toBe('routing');
    expect(view.timeline).toEqual([
      { status: 'received', on: '2026-10-20' },
      { status: 'routing', on: '2026-10-23' },
    ]);
  });

  it('vuelve a leer el estatus dentro de la transacción y no duplica el evento', async () => {
    const scenario = await setup();
    const { server, folio } = scenario;
    // Otra petición cambia el estatus después de que esta leyó el registro (ya obsoleto).
    const ctx = createContext({
      db: server.db,
      keys: server.keys,
      evidenceStore: server.evidenceStore,
      authorityToken: TEST_TOKEN,
      now: () => new Date('2026-10-20T16:00:00Z'),
    });
    const stale = ctx.complaints.find(folio);
    expect(stale?.status).toBe('received');
    await postJson(server.app, ROUTES.authorityStatus(folio), { status: 'routing' }, TEST_TOKEN);
    expect(() => changeStatus(ctx, folio, 'routing')).toThrow(ApiFailure);
    expect((await trackingView(scenario)).timeline).toHaveLength(2);
    expect(() => changeStatus(ctx, 'ZZZZ-ZZZZ-ZZZZ', 'routed')).toThrow(ApiFailure);
  });
});

describe('buzón de la autoridad', () => {
  async function sealAuthorityMessage(
    scenario: Scenario,
    signingKey: Uint8Array,
    sequence = 0,
    text = 'Pregunta sintética de la autoridad.',
  ) {
    const { reporter, folio } = scenario;
    return sealMailboxMessage(text, reporterRecipient(reporter), signingKey, {
      folio,
      from: 'authority',
      sequence,
    });
  }

  it('guarda un mensaje firmado que la persona denunciante puede abrir', async () => {
    const scenario = await setup();
    const { server, folio, reporter } = scenario;
    const sealed = await sealAuthorityMessage(scenario, server.authoritySigning.privateKey);
    const response = await postJson(
      server.app,
      ROUTES.authorityMessages(folio),
      sealed,
      TEST_TOKEN,
    );
    expect(response.status).toBe(201);
    expect(MailboxMessageSchema.parse(await response.json())).toMatchObject({
      from: 'authority',
      sequence: 0,
    });
    const [message] = (await trackingView(scenario)).messages;
    if (!message) throw new Error('Falta el mensaje.');
    const text = await openMailboxMessage(
      message,
      reporter.box.privateKey,
      server.authoritySigning.publicKey,
      folio,
    );
    expect(text).toBe('Pregunta sintética de la autoridad.');
  });

  it('exige la siguiente secuencia: rechaza repetir, saltar o reordenar mensajes', async () => {
    const scenario = await setup();
    const { server, folio } = scenario;
    const key = server.authoritySigning.privateKey;
    const post = (body: unknown) =>
      postJson(server.app, ROUTES.authorityMessages(folio), body, TEST_TOKEN);
    const first = await sealAuthorityMessage(scenario, key, 0, 'Primera pregunta sintética.');
    const third = await sealAuthorityMessage(scenario, key, 2, 'Tercera pregunta sintética.');
    expect((await post(first)).status).toBe(201);
    expect((await post(first)).status).toBe(400);
    expect((await post(third)).status).toBe(400);
    // Cambiar la secuencia de un mensaje capturado invalida su firma.
    expect((await post({ ...first, sequence: 1 })).status).toBe(400);
    const second = await sealAuthorityMessage(scenario, key, 1, 'Segunda pregunta sintética.');
    expect((await post(second)).status).toBe(201);
    const view = await trackingView(scenario);
    expect(view.messages.map((message) => message.sequence)).toEqual([0, 1]);
  });

  it('rechaza un mensaje con firma inválida o dirigido a otra llave', async () => {
    const scenario = await setup();
    const { server, folio } = scenario;
    const forged = await sealAuthorityMessage(scenario, createReporter().signing.privateKey);
    const misdirected = await sealMailboxMessage(
      'Mensaje sintético hacia la autoridad.',
      {
        keyId: server.keys.publicKeySet.authority.keyId,
        publicKey: server.authorityBox.publicKey,
      },
      server.authoritySigning.privateKey,
      { folio, from: 'authority', sequence: 0 },
    );
    for (const body of [forged, misdirected]) {
      const response = await postJson(
        server.app,
        ROUTES.authorityMessages(folio),
        body,
        TEST_TOKEN,
      );
      expect(response.status).toBe(400);
    }
  });
});

describe('descarga de pruebas', () => {
  it('sirve el binario como adjunto con su tipo y nosniff', async () => {
    const { server, evidence } = await setup();
    const response = await getAsAuthority(
      server.app,
      ROUTES.authorityEvidence(evidence.evidenceId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="${evidence.evidenceId}.png"`,
    );
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(samplePng(128));
  });

  it('no sirve pruebas pendientes ni identificadores inválidos', async () => {
    const { server } = await setup();
    const pending = (await (
      await uploadEvidence(server.app, samplePng(), 'image/png')
    ).json()) as EvidenceDescriptor;
    for (const id of [pending.evidenceId, '../keys.json', 'f'.repeat(32)]) {
      const response = await getAsAuthority(server.app, ROUTES.authorityEvidence(id));
      expect(response.status).toBe(404);
    }
  });
});
