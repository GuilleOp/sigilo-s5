// Pruebas del motor de plazos y escalamiento con el reloj de pruebas y de la segunda llave: el sobre
// de escalamiento solo se entrega a la supervisora cuando una regla pública se cumple.
import { describe, expect, it } from 'vitest';
import {
  EscalationDeliverySchema,
  EscalationSummarySchema,
  LedgerPageSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import {
  fromBase64Url,
  keyIdFor,
  openEscalation,
  receivedPayloadDigest,
  sealEscalation,
  sealMailboxMessage,
  submissionDigestFromEscalation,
} from '@sigilo/core';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  messageBody,
  postJson,
  procedureAs,
  reporterRecipient,
  submitComplaint,
  SYNTHETIC_AGREEMENT,
  TEST_AUTHORITIES,
  testToken,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

/** Día 31 después de la recepción del 2026-10-20 (hora del centro): vencieron los 30 días. */
const DAY_31 = new Date('2026-11-20T18:00:00Z');

async function setup(offenseCode = 'LGRA-59') {
  const server = createTestServer();
  const reporter = createReporter();
  const request = await buildComplaintRequest(server, {
    mode: 'sealed',
    reporter,
    offenseCode,
    withEscalation: true,
  });
  const { folio } = await submitComplaint(server, request);
  return { server, reporter, request, folio };
}

function deliver(server: TestServer, folio: string, token = testToken('supervisor')) {
  return postJson(server.app, ROUTES.authorityEscalationEnvelope(folio), {}, token);
}

describe('motor de reglas', () => {
  it('escala una falta grave sin iniciar el procedimiento al día 31 y solo una vez', async () => {
    const { server, folio, reporter } = await setup();
    server.setNow(new Date('2026-11-19T18:00:00Z'));
    expect(server.runRules().triggered).toBe(0);
    server.setNow(DAY_31);
    expect(server.runRules()).toMatchObject({ triggered: 1, escalated: 1 });
    expect(server.runRules().triggered).toBe(0);
    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.procedure?.rules).toEqual([
      expect.objectContaining({
        ruleKey: 'escalation.grave-stalled',
        effect: 'escalate',
        dueOn: '2026-11-19',
        on: '2026-11-20',
      }),
    ]);
    // El evento `rule.triggered` se publica al cerrar el día, del sistema y sin contenido.
    await server.advanceTo(new Date('2026-11-21T09:00:00Z'));
    const page = LedgerPageSchema.parse(
      await (await server.app.request(`${ROUTES.ledgerEvents}?limit=500`)).json(),
    );
    const triggered = page.events.filter((event) => event.type === 'rule.triggered');
    expect(triggered).toHaveLength(1);
    expect(triggered[0]?.actorRole).toBe('system');
  });

  it('no escala si la investigación inició a tiempo', async () => {
    const { server, folio } = await setup();
    await procedureAs(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
    });
    await procedureAs(server, 'oicIntake', folio, { action: 'accept' });
    server.setNow(new Date('2026-11-18T18:00:00Z'));
    await procedureAs(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'investigation',
    });
    server.setNow(DAY_31);
    expect(server.runRules().triggered).toBe(0);
  });

  it('escala el archivo sin aviso por el buzón en 10 días hábiles, salvo si se avisa', async () => {
    const archive = {
      action: 'close',
      reason: 'insufficient_information',
      legalBasis: 'LGRA, art. 100: no hay elementos suficientes (fundamento sintético).',
      agreement: SYNTHETIC_AGREEMENT,
    } as const;
    const silent = await setup('LGRA-50');
    await procedureAs(silent.server, 'inboxIntake', silent.folio, archive);
    // Archivo el martes 20 de octubre: 10 días hábiles vencen el martes 3 de noviembre (el 2 de
    // noviembre no es inhábil oficial; los fines de semana sí cuentan como inhábiles).
    silent.server.setNow(new Date('2026-11-03T18:00:00Z'));
    expect(silent.server.runRules().triggered).toBe(0);
    silent.server.setNow(new Date('2026-11-04T18:00:00Z'));
    const keys = (() => {
      silent.server.runRules();
      return silent.server.ctx.procedure.listRuleTriggers(silent.folio).map((item) => item.ruleKey);
    })();
    expect(keys).toEqual(['escalation.archive-unnotified']);

    const notified = await setup('LGRA-50');
    await procedureAs(notified.server, 'inboxIntake', notified.folio, archive);
    const message = await sealMailboxMessage(
      'Su denuncia se archivó por falta de elementos; puede aportar nuevos indicios.',
      reporterRecipient(notified.reporter),
      notified.server.authoritySigning.privateKey,
      { folio: notified.folio, from: 'authority', sequence: 0 },
    );
    const sent = await postJson(
      notified.server.app,
      ROUTES.authorityMessages(notified.folio),
      messageBody(message),
      testToken('inboxInvestigator'),
    );
    expect(sent.status).toBe(201);
    notified.server.setNow(new Date('2026-11-05T18:00:00Z'));
    expect(notified.server.runRules().triggered).toBe(0);
  });
});

describe('segunda llave', () => {
  it('no se entrega antes de que se cumpla una regla de escalamiento', async () => {
    const { server, folio } = await setup();
    expect((await deliver(server, folio)).status).toBe(404);
    const list = await getAsAuthority(
      server.app,
      ROUTES.authorityEscalations,
      testToken('supervisor'),
    );
    expect(await list.json()).toEqual([]);
    // Aunque falte un día, sigue sin entregarse.
    server.setNow(new Date('2026-11-19T18:00:00Z'));
    server.runRules();
    expect((await deliver(server, folio)).status).toBe(404);
  });

  it('se entrega a la supervisora al escalar y abre con su llave, sin la identidad', async () => {
    const { server, folio, request } = await setup();
    server.setNow(DAY_31);
    server.runRules();
    const summaries = EscalationSummarySchema.array().parse(
      await (
        await getAsAuthority(server.app, ROUTES.authorityEscalations, testToken('supervisor'))
      ).json(),
    );
    expect(summaries).toEqual([
      expect.objectContaining({ folio, fromAuthorityId: TEST_AUTHORITIES.inbox }),
    ]);
    const response = await deliver(server, folio);
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain('sealedIdentity"');
    const delivery = EscalationDeliverySchema.parse(JSON.parse(raw));
    const content = await openEscalation(
      delivery.escalationEnvelope,
      server.supervisorBox.privateKey,
      {
        authVerifier: delivery.authVerifier,
        reporterKeys: delivery.reporterKeys,
      },
    );
    expect(content.facts).toEqual(request.facts);
    // La supervisora comprueba que el sobre es el que firmó el servidor al recibir.
    await server.advanceTo(new Date('2026-11-21T09:00:00Z'));
    const again = EscalationDeliverySchema.parse(await (await deliver(server, folio)).json());
    const seq = again.receivedEventSeq;
    if (seq === undefined) throw new Error('Falta el evento de recepción publicado.');
    const page = LedgerPageSchema.parse(
      await (await server.app.request(`${ROUTES.ledgerEvents}?from=${seq}&limit=1`)).json(),
    );
    expect(page.events[0]?.payloadDigest).toBe(
      receivedPayloadDigest(folio, submissionDigestFromEscalation(content, again)),
    );
    const releases = server.ctx.securityLog
      .listAll()
      .filter((event) => event.kind === 'escalation_envelope_released');
    expect(releases).toHaveLength(2);
  });

  it('solo la supervisión de la supervisora la recibe', async () => {
    const { server, folio } = await setup();
    server.setNow(DAY_31);
    server.runRules();
    for (const name of ['inboxSupervision', 'oicInvestigator', 'inboxInvestigator'] as const) {
      expect((await deliver(server, folio, testToken(name))).status).toBe(403);
    }
  });

  it('el servidor rechaza un sobre de escalamiento para otra llave o de otro tamaño', async () => {
    const server = createTestServer();
    const reporter = createReporter();
    const request = await buildComplaintRequest(server, { mode: 'anonymous', reporter });
    const wrongKey = await sealEscalation(
      request,
      { keyId: keyIdFor(server.authorityBox.publicKey), publicKey: server.authorityBox.publicKey },
      { authVerifier: request.authVerifier, reporterKeys: request.reporterKeys },
    );
    const rejected = await postJson(server.app, ROUTES.complaints, {
      ...request,
      escalationEnvelope: wrongKey,
    });
    expect(rejected.status).toBe(400);
    const valid = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      withEscalation: true,
    });
    const envelope = valid.escalationEnvelope;
    if (envelope === undefined) throw new Error('Falta el sobre.');
    const truncated = { ...envelope, ct: envelope.ct.slice(0, 200) };
    expect(fromBase64Url(truncated.ct).length).toBeLessThan(1000);
    const short = await postJson(server.app, ROUTES.complaints, {
      ...valid,
      escalationEnvelope: truncated,
    });
    expect(short.status).toBe(400);
  });
});
