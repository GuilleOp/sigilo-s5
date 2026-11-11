// Pruebas de regresión de la revisión de seguridad de la Etapa 5 (hallazgos H1 a H11), con datos
// sintéticos. Cada caso reproduce la prueba de concepto y comprueba que el ataque ya no funciona.
import { describe, expect, it } from 'vitest';
import {
  ComplaintDetailSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
  TransferComplaintResponseSchema,
} from '@sigilo/contracts';
import { openRoutedReply } from '@sigilo/red';
import type { SubmitComplaintRequest } from '@sigilo/contracts';
import {
  deriveReceiptKeys,
  generateReceiptPhrase,
  sealMailboxMessage,
  toBase64Url,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import { demoCase } from '@sigilo/corroboracion/demo';
import { corroborateInBrowser } from '../../corroboracion/src/test-support.ts';
import { syncCorroboration } from './services/corroboration-service.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  messageBody,
  postJson,
  procedureAs,
  reporterRecipient,
  submitComplaint,
  SYNTHETIC_AGREEMENT,
  TEST_AUTHORITIES,
  testToken,
} from './test-support/harness.ts';
import type { TestAccountName, TestServer } from './test-support/harness.ts';
import {
  createTestNetwork,
  networkToken,
  scenarioDate,
  sealedRelay,
  sendThroughRouter,
  submitDirect,
} from './test-support/network-harness.ts';
import type { NetworkAccountName, TestNetwork, TestNode } from './test-support/network-harness.ts';

const IFFE = 'authority.oic-iffe';

function anonymousRequest(): SubmitComplaintRequest {
  const keys = deriveReceiptKeys(generateReceiptPhrase().entropy);
  return {
    version: 1,
    mode: 'anonymous',
    facts: {
      stateCode: '22',
      entityId: 'VE-INSTITUTO',
      offenseCode: 'LGRA-59',
      occurredPeriod: '2026-03',
      accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
      description: demoCase('case.marta').narrative,
    },
    evidence: [],
    protectionRequested: false,
    reporterKeys: {
      boxPublicKey: toBase64Url(keys.box.publicKey),
      signingPublicKey: toBase64Url(keys.signing.publicKey),
    },
    authVerifier: keys.authVerifier,
  };
}

function asAccount(node: TestNode, name: NetworkAccountName, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${networkToken(name)}` };
  if (body === undefined) return node.app.request(path, { headers });
  headers['Content-Type'] = 'application/json';
  return node.app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

describe('H2: un cierre que declina no entierra una falta grave', () => {
  it('el cierre improcedente de una falta grave se escala de inmediato a la supervisora', async () => {
    const server = createTestServer();
    const request = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter: createReporter(),
      offenseCode: 'LGRA-59',
      withEscalation: true,
    });
    const { folio } = await submitComplaint(server, request);
    const closed = await procedureAs(server, 'inboxIntake', folio, {
      action: 'close',
      reason: 'inadmissible',
      legalBasis: 'Bases de la PDN: los hechos no son competencia de este sistema (sintético).',
      agreement:
        'Se determina improcedente la denuncia por no tratarse de hechos de la competencia de esta autoridad.',
    });
    // El cierre no se bloquea: se revisa.
    expect(closed.status).toBe(200);
    server.runRules();
    const triggers = server.ctx.procedure.listRuleTriggers(folio);
    expect(triggers.map((item) => [item.ruleKey, item.supervisorId])).toContainEqual([
      'escalation.declined-serious',
      TEST_AUTHORITIES.supervisor,
    ]);
  });
});

describe('H5: la autoridad con conflicto no se autojustifica ni actúa después de excusarse', () => {
  async function routedComplaint() {
    const network = createTestNetwork();
    await network.federal.tasks.run();
    const reply = await sendThroughRouter(network, IFFE, {
      operationId: 'submitComplaint',
      body: anonymousRequest(),
    });
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    const detail = ComplaintDetailSchema.parse(
      await (
        await asAccount(network.federal, 'iffeIntake', ROUTES.authorityComplaint(folio))
      ).json(),
    );
    expect(detail.conflictReview?.requiresResponse).toBe(true);
    return { network, folio };
  }

  it('la justificación propia escala a la supervisora y no apaga la regla del acto resolutivo', async () => {
    const { network, folio } = await routedComplaint();
    const { federal } = network;
    const procedure = ROUTES.authorityProcedure(folio);
    expect(
      (
        await asAccount(federal, 'iffeIntake', procedure, {
          action: 'respond_conflict',
          response: 'justification',
          note: 'No hay conflicto.',
        })
      ).status,
    ).toBe(200);
    await asAccount(federal, 'iffeIntake', procedure, { action: 'accept' });
    await asAccount(federal, 'iffeInvestigator', procedure, {
      action: 'advance_stage',
      stage: 'investigation',
    });
    network.setNow(scenarioDate(2));
    const archived = await asAccount(federal, 'iffeInvestigator', procedure, {
      action: 'close',
      reason: 'insufficient_information',
      legalBasis: 'LGRA, art. 100: archivo por falta de elementos (sintético).',
      agreement:
        'Se archiva el expediente sintético porque, revisadas las constancias, no se acreditó la relación señalada.',
    });
    expect(archived.status).toBe(200);
    federal.server.runRules();
    const keys = federal.ctx.procedure.listRuleTriggers(folio).map((item) => item.ruleKey);
    expect(keys).toContain('escalation.conflict-justified');
    expect(keys).toContain('escalation.conflict');
  });

  it('la excusa bloquea la aceptación y los actos resolutivos; solo queda reasignar', async () => {
    const { network, folio } = await routedComplaint();
    const { federal } = network;
    const procedure = ROUTES.authorityProcedure(folio);
    await asAccount(federal, 'iffeIntake', procedure, {
      action: 'respond_conflict',
      response: 'excuse',
      note: 'La titular tiene intereses en común con la persona denunciada.',
    });
    expect((await asAccount(federal, 'iffeIntake', procedure, { action: 'accept' })).status).toBe(
      409,
    );
    const close = await asAccount(federal, 'iffeIntake', procedure, {
      action: 'close',
      reason: 'inadmissible',
      legalBasis: 'Cierre sintético que no debe proceder.',
      agreement: 'Acuerdo sintético que la autoridad excusada no puede emitir.',
    });
    expect(close.status).toBe(409);
    const reassigned = await asAccount(federal, 'iffeIntake', procedure, {
      action: 'reassign',
      authorityId: 'authority.oic-dfps',
      note: 'Se reasigna por la excusa de la titular (LGRA, art. 58).',
    });
    expect(reassigned.status).toBe(200);
  });
});

async function authorityMessage(
  server: TestServer,
  reporter: ReceiptKeys,
  folio: string,
  sequence: number,
  account: TestAccountName,
) {
  const sealed = await sealMailboxMessage(
    'Mensaje sintético de la autoridad.',
    reporterRecipient(reporter),
    server.authoritySigning.privateKey,
    { folio, from: 'authority', sequence },
  );
  return postJson(
    server.app,
    ROUTES.authorityMessages(folio),
    messageBody(sealed),
    testToken(account),
  );
}

describe('H6: un mensaje anterior al acto no cuenta como su notificación', () => {
  it('un mensaje del mismo día, antes del archivo, no apaga escalation.archive-unnotified', async () => {
    const server = createTestServer();
    const reporter = createReporter();
    const request = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter,
      offenseCode: 'LGRA-50',
      withEscalation: true,
    });
    const { folio } = await submitComplaint(server, request);
    server.setNow(new Date('2026-10-20T16:00:00Z'));
    expect((await authorityMessage(server, reporter, folio, 0, 'inboxInvestigator')).status).toBe(
      201,
    );
    server.setNow(new Date('2026-10-20T23:00:00Z'));
    const archived = await procedureAs(server, 'inboxIntake', folio, {
      action: 'close',
      reason: 'insufficient_information',
      legalBasis: 'LGRA, art. 100: no hay elementos suficientes (fundamento sintético).',
      agreement: SYNTHETIC_AGREEMENT,
    });
    expect(archived.status).toBe(200);
    // El seguimiento muestra el aviso del sistema al archivar.
    const view = await (
      await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))
    ).json();
    expect(JSON.stringify(view)).toContain('archivó tu denuncia');
    server.setNow(new Date('2026-11-10T18:00:00Z'));
    server.runRules();
    expect(server.ctx.procedure.listRuleTriggers(folio).map((item) => item.ruleKey)).toContain(
      'escalation.archive-unnotified',
    );
  });

  it('el plazo de inconformidad corre solo desde un mensaje posterior a la calificación', async () => {
    const server = createTestServer();
    const reporter = createReporter();
    const request = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter,
      offenseCode: 'LGRA-59',
      withEscalation: true,
    });
    const { folio } = await submitComplaint(server, request);
    await procedureAs(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
    });
    await procedureAs(server, 'oicIntake', folio, { action: 'accept' });
    await procedureAs(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'investigation',
    });
    server.setNow(new Date('2026-10-22T15:00:00Z'));
    await authorityMessage(server, reporter, folio, 0, 'oicInvestigator');
    server.setNow(new Date('2026-10-22T23:30:00Z'));
    const qualified = await procedureAs(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'qualification',
      qualification: {
        severity: 'non_serious',
        legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
        agreement: 'Acuerdo sintético de calificación de la conducta como falta no grave.',
      },
    });
    expect(qualified.status).toBe(200);
    const track = async () =>
      (await (
        await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))
      ).json()) as {
        procedure?: { qualification?: { appealDueOn?: string } };
      };
    expect((await track()).procedure?.qualification?.appealDueOn).toBeUndefined();
    server.setNow(new Date('2026-10-23T16:00:00Z'));
    await authorityMessage(server, reporter, folio, 1, 'oicInvestigator');
    expect((await track()).procedure?.qualification?.appealDueOn).toBe('2026-10-30');
  });
});

describe('H7: el sobre de identidad del recurso pide dos aprobaciones y vence con el recurso', () => {
  it('una sola cuenta no lo recibe y, pasado el plazo de la Sala, nadie', async () => {
    const server = createTestServer();
    const reporter = createReporter();
    const request = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter,
      offenseCode: 'LGRA-59',
      withEscalation: true,
    });
    const { folio } = await submitComplaint(server, request);
    await procedureAs(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
    });
    await procedureAs(server, 'oicIntake', folio, { action: 'accept' });
    await procedureAs(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'investigation',
    });
    await procedureAs(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'qualification',
      qualification: {
        severity: 'non_serious',
        legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
        agreement: 'Acuerdo sintético de calificación de la conducta como falta no grave.',
      },
    });
    const appeal = await server.app.request(ROUTES.trackingAppeal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentialsFor(folio, reporter),
        revealIdentityForAppeal: true,
        reasons: 'No estoy de acuerdo con la calificación porque los hechos son graves.',
      }),
    });
    expect(appeal.status).toBe(201);
    const { openingId } = (await appeal.json()) as { openingId: string };
    // El panel distingue la solicitud del recurso por un campo del contrato, no por su texto.
    const detail = ComplaintDetailSchema.parse(
      await (
        await server.app.request(ROUTES.authorityComplaint(folio), {
          headers: { Authorization: `Bearer ${testToken('oicInvestigator')}` },
        })
      ).json(),
    );
    expect(detail.identityRequests?.find((item) => item.requestId === openingId)?.purpose).toBe(
      'appeal',
    );
    const envelope = () =>
      postJson(
        server.app,
        ROUTES.authorityIdentityEnvelope(folio, openingId),
        {},
        testToken('oicInvestigator'),
      );
    expect((await envelope()).status).toBe(403);
    const approved = await postJson(
      server.app,
      ROUTES.authorityIdentityApprovals(folio, openingId),
      { legalBasis: 'LGRA, art. 104: integrar el recurso (sintético).' },
      testToken('oicInvestigator'),
    );
    expect(approved.status).toBe(200);
    // Con una sola aprobación (y sin supervisión), no hay entrega.
    expect((await envelope()).status).toBe(409);
    // Meses después, fuera de la ventana del recurso, tampoco.
    server.setNow(new Date('2027-06-01T18:00:00Z'));
    expect((await envelope()).status).toBe(409);
    const late = await postJson(
      server.app,
      ROUTES.authorityIdentityApprovals(folio, openingId),
      { legalBasis: 'Aprobación sintética fuera de plazo.' },
      testToken('oicInvestigator2'),
    );
    expect(late.status).toBe(409);
  });
});

describe('H1: el turnado entre nodos no cede la denuncia sin un comprobante ligado a ella', () => {
  it('un comprobante de otra denuncia no cede la competencia y el turnado sin comprobante se escala', async () => {
    const network = createTestNetwork();
    const { federal, queretaro } = network;
    await federal.tasks.run();
    await queretaro.tasks.run();
    const victim = anonymousRequest();
    const submitted = SubmitComplaintResponseSchema.parse(
      await (await submitDirect(federal, victim)).json(),
    );
    // Quien turna no usa el navegador: manda al destino OTRA denuncia (otro recibo, otros hechos).
    const target = 'authority.comptroller-queretaro';
    const decoy = anonymousRequest();
    decoy.facts.description =
      'Texto sin relación con la denuncia original, enviado por quien turna.';
    const sealed = await sealedRelay(network, target, {
      operationId: 'submitComplaint',
      body: decoy,
    });
    const transferred = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityTransfer(submitted.folio),
      { toAuthorityId: target, relay: sealed.relay, note: 'Competencia estatal (sintético).' },
    );
    expect(transferred.status).toBe(200);
    const { relay, transferId } = TransferComplaintResponseSchema.parse(await transferred.json());
    const reply = await openRoutedReply(relay, sealed.replyPrivateKey, target);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const there = SubmitComplaintResponseSchema.parse(reply.body.value);
    const confirm = (request: SubmitComplaintRequest) =>
      asAccount(federal, 'federalInboxIntake', ROUTES.authorityTransferReceipt(submitted.folio), {
        transferId,
        receipt: there.receipt,
        request,
      });
    // El comprobante es de la denuncia señuelo: ni con ella ni con la verdadera se acepta.
    expect((await confirm(decoy)).status).toBe(400);
    expect((await confirm(victim)).status).toBe(400);
    // La competencia sigue en el origen: la supervisión del nodo la ve y la recepción también.
    const detail = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityComplaint(submitted.folio),
    );
    expect(detail.status).toBe(200);
    expect(federal.ctx.complaints.find(submitted.folio)?.assignedAuthorityId).toBe(
      'authority.buzon-federal',
    );
    // Mientras espera, no se puede turnar otra vez.
    const again = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityTransfer(submitted.folio),
      { toAuthorityId: target, relay: sealed.relay, note: 'Segundo intento (sintético).' },
    );
    expect(again.status).toBe(409);
    // A los 10 días hábiles sin comprobante válido, el turnado se escala a la supervisora del nodo.
    network.setNow(scenarioDate(20));
    federal.server.runRules();
    const triggers = federal.ctx.procedure.listRuleTriggers(submitted.folio);
    expect(triggers.map((item) => [item.ruleKey, item.supervisorId])).toContainEqual([
      'escalation.transfer-unconfirmed',
      'authority.oversight-federal',
    ]);
    // Y un comprobante tardío ya no cede la denuncia.
    expect((await confirm(victim)).status).toBe(409);
  });
});

describe('H3: la corroboración no sirve de oráculo', () => {
  async function corroborated(network: TestNetwork, description: string, ocid: string) {
    const request = anonymousRequest();
    request.facts.description = description;
    const browser = await corroborateInBrowser(
      network.services,
      { kind: 'ocid', ocid },
      description,
    );
    request.corroboration = {
      epoch: browser.keys.epoch,
      tag: browser.keys.tag,
      similarity: browser.similarity,
    };
    return request;
  }

  it('una denuncia de sondeo no ve conteos ni cuenta como fuente; la competente ve intervalos', async () => {
    const network = createTestNetwork();
    const { federal, queretaro } = network;
    await federal.tasks.run();
    await queretaro.tasks.run();
    const ocid = 'ocds-fict00-QRO-2026-0042';
    // La denuncia real llega a Querétaro y se registra cuando cumple 7 días.
    await submitDirect(
      queretaro,
      await corroborated(
        network,
        'El jefe de compras adjudicó el contrato a una empresa de su cuñado sin licitación y con sobreprecio.',
        ocid,
      ),
    );
    // Un sondeo desde el buzón general Federal con el mismo contrato.
    network.setNow(scenarioDate(3));
    const probe = SubmitComplaintResponseSchema.parse(
      await (
        await submitDirect(
          federal,
          await corroborated(
            network,
            'Texto de sondeo cualquiera sin relación con hechos concretos, solo para consultar el índice.',
            ocid,
          ),
        )
      ).json(),
    );
    await syncCorroboration(queretaro.ctx);
    // El sondeo se registra, pero sin confirmar no cuenta para otras ni ve su grupo.
    await syncCorroboration(federal.ctx);
    await syncCorroboration(queretaro.ctx);
    for (const folio of queretaro.ctx.complaints.listFoliosForRules()) {
      expect(queretaro.ctx.integration.lastCorroborationStatus(folio)?.independentSources).toBe(1);
    }
    expect(federal.ctx.integration.lastCorroborationStatus(probe.folio)?.independentSources).toBe(
      1,
    );
    const probeView = ComplaintDetailSchema.parse(
      await (
        await asAccount(federal, 'federalInboxIntake', ROUTES.authorityComplaint(probe.folio))
      ).json(),
    );
    expect(probeView.corroboration).toBeUndefined();
    expect(JSON.stringify(probeView.contextSheet ?? {})).not.toMatch(/independient/u);
    // Cerrarlo como improcedente pide su baja y ya nunca se registra.
    const closed = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityProcedure(probe.folio),
      {
        action: 'close',
        reason: 'inadmissible',
        legalBasis: 'Bases de la PDN: sin hechos que investigar (sintético).',
        agreement: 'Se determina improcedente por no describir hechos concretos (sintético).',
      },
    );
    expect(closed.status).toBe(200);
    // La baja firmada sale en la siguiente sincronización: aun pasados los 30 días de gracia, el
    // sondeo ya no cuenta para la denuncia real.
    await syncCorroboration(federal.ctx);
    expect(federal.ctx.integration.findCorroborationRegistration(probe.folio)?.withdrawn).toBe(
      true,
    );
    network.setNow(scenarioDate(40));
    await syncCorroboration(queretaro.ctx);
    for (const folio of queretaro.ctx.complaints.listFoliosForRules()) {
      expect(queretaro.ctx.integration.lastCorroborationStatus(folio)?.independentSources).toBe(1);
    }
  });

  it('la autoridad competente ve la corroboración solo después de aceptar, y queda en la bitácora', async () => {
    const network = createTestNetwork();
    const { federal } = network;
    await federal.tasks.run();
    const reply = await sendThroughRouter(network, IFFE, {
      operationId: 'submitComplaint',
      body: await corroborated(
        network,
        demoCase('case.marta').narrative,
        'ocds-fict00-IFFE-AD-2026-0042',
      ),
    });
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    const view = async () =>
      ComplaintDetailSchema.parse(
        await (await asAccount(federal, 'iffeIntake', ROUTES.authorityComplaint(folio))).json(),
      );
    await syncCorroboration(federal.ctx);
    expect((await view()).corroboration).toBeUndefined();
    await asAccount(federal, 'iffeIntake', ROUTES.authorityProcedure(folio), { action: 'accept' });
    await syncCorroboration(federal.ctx);
    expect((await view()).corroboration?.sources).toBe('one');
    await federal.ctx.ledger.publishClosedDays();
    network.setNow(scenarioDate(1));
    await federal.ctx.ledger.publishClosedDays();
    const page = (await (await federal.app.request(`${ROUTES.ledgerEvents}?limit=500`)).json()) as {
      events: { type: string }[];
    };
    expect(page.events.map((event) => event.type)).toContain('corroboration.viewed');
  });
});
