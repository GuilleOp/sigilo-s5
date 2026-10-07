// Pruebas del panel de autoridad: autenticación, detalle, identidad, estatus, buzón y pruebas.
import { describe, expect, it } from 'vitest';
import {
  ComplaintDetailSchema,
  ComplaintSummarySchema,
  MailboxMessageSchema,
  OpenIdentityResponseSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import {
  fromBase64Url,
  keyIdFor,
  openIdentity,
  openMailboxMessage,
  sealMailboxMessage,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import { z } from 'zod';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  postJson,
  samplePng,
  submitComplaint,
  TEST_TOKEN,
  uploadEvidence,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

const LEGAL_BASIS = 'Artículo sintético 64 de la ley de prueba: requerimiento judicial.';

interface Scenario {
  server: TestServer;
  reporter: ReceiptKeys;
  folio: string;
  evidence: EvidenceDescriptor;
}

async function setup(mode: 'sealed' | 'anonymous' = 'sealed'): Promise<Scenario> {
  const server = createTestServer();
  const reporter = createReporter();
  const upload = await uploadEvidence(server.app, samplePng(128), 'image/png');
  const evidence = (await upload.json()) as EvidenceDescriptor;
  const request = await buildComplaintRequest(server, { mode, reporter, evidence: [evidence] });
  const { folio } = await submitComplaint(server, request);
  return { server, reporter, folio, evidence };
}

async function trackingView({ server, reporter, folio }: Scenario) {
  const response = await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
  return TrackingViewSchema.parse(await response.json());
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

  it('devuelve el detalle con pruebas y llaves, sin identidad', async () => {
    const { server, folio, evidence, reporter } = await setup();
    const response = await getAsAuthority(server.app, ROUTES.authorityComplaint(folio));
    const raw = await response.text();
    const detail = ComplaintDetailSchema.strict().parse(JSON.parse(raw));
    expect(detail.evidence).toEqual([evidence]);
    expect(fromBase64Url(detail.reporterBoxPublicKey)).toEqual(reporter.box.publicKey);
    expect(detail.identityOpenedCount).toBe(0);
    expect(raw).not.toContain('sealedIdentity');
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
    const { server, folio, reporter } = scenario;
    scenario.server.setNow(new Date('2026-10-22T09:15:00Z'));
    const response = await postJson(
      server.app,
      ROUTES.authorityIdentity(folio),
      { legalBasis: LEGAL_BASIS },
      TEST_TOKEN,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { authVerifier: string };
    const opened = OpenIdentityResponseSchema.parse(body);
    expect(body.authVerifier).toBe(reporter.authVerifier);
    const identity = await openIdentity(
      opened.sealedIdentity,
      server.authorityBox.privateKey,
      body.authVerifier,
    );
    expect(identity.fullName).toBe('Persona Sintética de Prueba');

    const view = await trackingView(scenario);
    expect(view.identityAccess).toEqual([
      { on: '2026-10-22', actorRole: 'authority', legalBasis: LEGAL_BASIS, ledgerSeq: 1 },
    ]);
    const detail = ComplaintDetailSchema.parse(
      await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folio))).json(),
    );
    expect(detail.identityOpenedCount).toBe(1);
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
    server.setNow(new Date('2026-10-23T23:59:59Z'));
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
});

describe('buzón de la autoridad', () => {
  async function sealAuthorityMessage(scenario: Scenario, signingKey: Uint8Array) {
    const { reporter, folio } = scenario;
    return sealMailboxMessage(
      'Pregunta sintética de la autoridad.',
      { keyId: keyIdFor(reporter.box.publicKey), publicKey: reporter.box.publicKey },
      signingKey,
      { folio, from: 'authority' },
    );
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
    MailboxMessageSchema.parse(await response.json());
    const [message] = (await trackingView(scenario)).messages;
    expect(message?.from).toBe('authority');
    if (!message) throw new Error('Falta el mensaje.');
    const text = await openMailboxMessage(
      message,
      reporter.box.privateKey,
      server.authoritySigning.publicKey,
      { folio, from: 'authority' },
    );
    expect(text).toBe('Pregunta sintética de la autoridad.');
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
      { folio, from: 'authority' },
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
