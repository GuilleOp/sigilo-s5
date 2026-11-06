// Recorrido de integración de la red (docs/demo-escenario.md) con todos los servicios en memoria:
// Marta envía por el enrutador ciego al nodo Federal, Luis corrobora por la entrada propia del nodo,
// el nodo alerta del conflicto de interés, el OIC archiva con plantilla, el auditor señala, las
// reglas escalan a la supervisora y Marta lo ve en su seguimiento. También el turnado entre nodos.
import { describe, expect, it } from 'vitest';
import {
  AppealResponseSchema,
  ComplaintDetailSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
  TrackingViewSchema,
  TransferComplaintResponseSchema,
} from '@sigilo/contracts';
import type { SubmitComplaintRequest } from '@sigilo/contracts';
import {
  deriveReceiptKeys,
  fromBase64Url,
  generateReceiptPhrase,
  identityContextFor,
  keyIdFor,
  sealEscalation,
  sealIdentity,
  sealMailboxMessage,
  toBase64Url,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import { templateQualificationText } from '@sigilo/auditor/eval';
import { DEMO_OCID, demoCase } from '@sigilo/corroboracion/demo';
import { openRoutedReply } from '@sigilo/red';
import { corroborateInBrowser } from '../../corroboracion/src/test-support.ts';
import { runNodeAudit } from './services/audit-service.ts';
import { syncCorroboration } from './services/corroboration-service.ts';
import {
  createTestNetwork,
  networkToken,
  scenarioDate,
  sealedRelay,
  sendThroughRouter,
  submitDirect,
} from './test-support/network-harness.ts';
import type { NetworkAccountName, TestNetwork, TestNode } from './test-support/network-harness.ts';
import { SYNTHETIC_IDENTITY } from './test-support/harness.ts';

const IFFE = 'authority.oic-iffe';
const OVERSIGHT = 'authority.oversight-federal';

function reporter(): ReceiptKeys {
  return deriveReceiptKeys(generateReceiptPhrase().entropy);
}

function directoryKey(network: TestNetwork, authorityId: string) {
  const authority = network.services.directory.authorities.find((item) => item.id === authorityId);
  if (authority === undefined) throw new Error(`Sin autoridad ${authorityId}.`);
  return { keyId: authority.keyId, publicKey: fromBase64Url(authority.boxPublicKey) };
}

async function complaintRequest(
  network: TestNetwork,
  keys: ReceiptKeys,
  options: { mode: 'sealed' | 'anonymous'; narrative: string; withCorroboration: boolean },
): Promise<SubmitComplaintRequest> {
  const request: SubmitComplaintRequest = {
    version: 1,
    mode: options.mode,
    facts: {
      stateCode: '22',
      entityId: 'VE-INSTITUTO',
      offenseCode: 'LGRA-59',
      occurredPeriod: '2026-03',
      accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
      description: options.narrative,
    },
    evidence: [],
    protectionRequested: options.mode === 'sealed',
    reporterKeys: {
      boxPublicKey: toBase64Url(keys.box.publicKey),
      signingPublicKey: toBase64Url(keys.signing.publicKey),
    },
    authVerifier: keys.authVerifier,
  };
  if (options.withCorroboration) {
    // Lo que hace el navegador: OPRF con el evaluador; el nodo nunca ve el identificador.
    const browser = await corroborateInBrowser(
      network.services,
      { kind: 'ocid', ocid: DEMO_OCID },
      options.narrative,
    );
    request.corroboration = {
      epoch: browser.keys.epoch,
      tag: browser.keys.tag,
      similarity: browser.similarity,
    };
  }
  request.escalationEnvelope = await sealEscalation(request, directoryKey(network, OVERSIGHT), {
    authVerifier: request.authVerifier,
    reporterKeys: request.reporterKeys,
  });
  if (options.mode === 'sealed') {
    request.sealedIdentity = await sealIdentity(
      SYNTHETIC_IDENTITY,
      directoryKey(network, IFFE),
      identityContextFor(request),
    );
  }
  return request;
}

function asAccount(node: TestNode, name: NetworkAccountName, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${networkToken(name)}` };
  if (body === undefined) return node.app.request(path, { headers });
  headers['Content-Type'] = 'application/json';
  return node.app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function detail(node: TestNode, name: NetworkAccountName, folio: string) {
  const response = await asAccount(node, name, ROUTES.authorityComplaint(folio));
  expect(response.status).toBe(200);
  return ComplaintDetailSchema.parse(await response.json());
}

async function tracking(node: TestNode, folio: string, keys: ReceiptKeys) {
  const response = await node.app.request(ROUTES.tracking, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folio, authKey: toBase64Url(keys.authKey) }),
  });
  expect(response.status).toBe(200);
  return TrackingViewSchema.parse(await response.json());
}

/** Acuerdo de archivo con la plantilla del escenario (sección 4.4). */
function templateAgreement(fileNumber: string, index: number): string {
  const variants = [
    'no se cuenta con elementos suficientes',
    'no se advierten elementos suficientes',
    'no existen elementos suficientes',
  ];
  return `Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se determina la conclusión y archivo del expediente ${fileNumber}, toda vez que ${variants[index % 3] ?? ''} para acreditar la existencia de la infracción y la presunta responsabilidad. Notifíquese.`;
}

function dayOf(day: number): string {
  return scenarioDate(day).toISOString().slice(0, 10);
}

describe('red del escenario de la demostración', () => {
  it('Marta por el enrutador, Luis corrobora, conflicto, calificación con plantilla, auditor, escalamiento e inconformidad', async () => {
    const network = createTestNetwork();
    const { federal, queretaro } = network;
    // Día 0: los nodos se registran ante el enrutador (aceptan sobres).
    expect((await federal.tasks.run()).registered).toBe(true);
    expect((await queretaro.tasks.run()).registered).toBe(true);

    // Semilla: 31 acuerdos con plantilla importados (Bases de la PDN, art. 58).
    const acts = Array.from({ length: 31 }, (_, i) => {
      const fileNumber = `OIC-IFFE-INV-${String(i + 1).padStart(4, '0')}`;
      return {
        fileNumber,
        issuedOn: dayOf(-330 + 10 * i),
        reason: 'insufficient_information' as const,
        agreement: templateAgreement(fileNumber, i),
      };
    });
    const imported = await asAccount(federal, 'iffeIntake', ROUTES.authorityClosureImports, {
      acts,
    });
    expect(imported.status).toBe(201);
    expect(await imported.json()).toMatchObject({ imported: 31, skipped: 0 });

    // Marta: denuncia sellada por la ventanilla única, cifrada hacia el nodo Federal.
    const marta = reporter();
    const martaRequest = await complaintRequest(network, marta, {
      mode: 'sealed',
      narrative: demoCase('case.marta').narrative,
      withCorroboration: true,
    });
    const reply = await sendThroughRouter(network, IFFE, {
      operationId: 'submitComplaint',
      body: martaRequest,
    });
    expect(reply.status).toBe(201);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    // El enrutador es ciego: lo que reenvió al nodo no contiene nada de la denuncia.
    expect(network.forwarded.join('')).not.toContain('Servidor Ficticio Uno');
    expect(network.forwarded.join('')).not.toContain(folio);

    // Llega turnada al OIC con la alerta de conflicto (S1 sintético: intereses en común).
    let view = await detail(federal, 'iffeIntake', folio);
    expect(view.procedure?.managementState).toBe('routed');
    expect(view.conflictReview?.requiresResponse).toBe(true);
    expect(view.conflictReview?.alerts.length).toBeGreaterThan(0);
    expect(view.contextSheet?.level).toBeDefined();
    await syncCorroboration(federal.ctx);

    // Día 1: el OIC acepta sin excusarse.
    network.setNow(scenarioDate(1));
    const accepted = await asAccount(federal, 'iffeIntake', ROUTES.authorityProcedure(folio), {
      action: 'accept',
    });
    expect(accepted.status).toBe(200);

    // Día 3: Luis corrobora por la entrada propia del nodo Federal, en modo anónimo.
    network.setNow(scenarioDate(3, '16:20:00'));
    const luis = reporter();
    await submitDirect(
      federal,
      await complaintRequest(network, luis, {
        mode: 'anonymous',
        narrative: demoCase('case.luis').narrative,
        withCorroboration: true,
      }),
    );
    // La de Luis se registra, pero sin confirmar no cuenta para Marta (H3).
    expect((await syncCorroboration(federal.ctx)).registered).toBe(1);
    view = await detail(federal, 'iffeIntake', folio);
    expect(view.corroboration?.sources).toBe('one');
    // El buzón general turna la de Luis al OIC, que la acepta: el nodo la confirma ante el índice.
    const luisFolio = federal.ctx.complaints
      .listSummariesForAuthority('authority.buzon-federal', 'authority.buzon-federal', 0, 10)
      .map((item) => item.folio)
      .find((item) => item !== folio);
    if (luisFolio === undefined) throw new Error('Falta la denuncia de Luis.');
    await asAccount(federal, 'federalInboxIntake', ROUTES.authorityProcedure(luisFolio), {
      action: 'route',
      authorityId: IFFE,
    });
    await asAccount(federal, 'iffeIntake', ROUTES.authorityProcedure(luisFolio), {
      action: 'accept',
    });
    await syncCorroboration(federal.ctx);
    await syncCorroboration(federal.ctx);
    view = await detail(federal, 'iffeIntake', folio);
    expect(view.corroboration?.sources).toBe('two_or_more');
    expect(view.contextSheet?.factors.map((factor) => factor.id).join(' ')).toMatch(/corrobor/u);

    // Día 30: el OIC inicia el procedimiento y el mismo día califica la falta grave como no grave
    // con su plantilla (LGRA, art. 100).
    network.setNow(scenarioDate(30));
    const started = await asAccount(federal, 'iffeInvestigator', ROUTES.authorityProcedure(folio), {
      action: 'advance_stage',
      stage: 'investigation',
    });
    expect(started.status).toBe(200);
    const qualified = await asAccount(
      federal,
      'iffeInvestigator',
      ROUTES.authorityProcedure(folio),
      {
        action: 'advance_stage',
        stage: 'qualification',
        qualification: {
          severity: 'non_serious',
          legalBasis: 'LGRA, arts. 100 y 102: calificación de la conducta.',
          agreement: templateQualificationText('OIC-IFFE-INV-0032'),
        },
      },
    );
    expect(qualified.status).toBe(200);
    // La notificación de la calificación llega por el buzón (art. 102), cifrada hacia Marta.
    const notice = await sealMailboxMessage(
      'Se calificó la conducta como falta no grave. Puedes inconformarte dentro de 5 días hábiles; el acuerdo está en tu seguimiento.',
      { keyId: keyIdFor(marta.box.publicKey), publicKey: marta.box.publicKey },
      network.services.network.authorities[IFFE].signing.privateKey,
      { folio, from: 'authority', sequence: 0 },
    );
    const notified = await asAccount(federal, 'iffeInvestigator', ROUTES.authorityMessages(folio), {
      sequence: notice.sequence,
      envelope: notice.envelope,
      signature: notice.signature,
    });
    expect(notified.status).toBe(201);
    let seen = await tracking(federal, folio, marta);
    expect(seen.procedure?.qualification?.severity).toBe('non_serious');
    expect(seen.procedure?.qualification?.appealDueOn).toBeDefined();
    expect(seen.procedure?.deadlines.map((deadline) => deadline.key)).toContain('appeal_filing');

    // Día 31: el auditor señala AUD-01 (plantilla) y AUD-03 (calificación degradada) y las reglas
    // escalan a la supervisora por el conflicto sin excusa y por la calificación con señales.
    network.setNow(scenarioDate(31));
    await network.runNodeTasks(federal);
    expect(runNodeAudit(federal.ctx)).toBeGreaterThan(0);
    view = await detail(federal, 'iffeInvestigator', folio);
    const rules = view.auditSignals?.map((signal) => signal.ruleId) ?? [];
    expect(rules).toContain('AUD-01');
    expect(rules).toContain('AUD-03');
    expect(rules).not.toContain('AUD-02');
    const result = federal.server.runRules();
    expect(result.triggered).toBeGreaterThan(0);
    const escalations = await asAccount(federal, 'oversight', ROUTES.authorityEscalations);
    const escalated = (await escalations.json()) as {
      folio: string;
      rules: { ruleKey: string }[];
    }[];
    const ours = escalated.find((item) => item.folio === folio);
    expect(ours?.rules.map((rule) => rule.ruleKey)).toEqual(
      expect.arrayContaining(['escalation.conflict', 'escalation.downgrade-signals']),
    );
    // La supervisora recibe la segunda llave sin depender del OIC.
    const delivery = await asAccount(
      federal,
      'oversight',
      ROUTES.authorityEscalationEnvelope(folio),
      {},
    );
    expect(delivery.status).toBe(200);
    seen = await tracking(federal, folio, marta);
    expect(seen.procedure?.rules.map((rule) => rule.ruleKey)).toContain('escalation.conflict');

    // Día 35: Marta se inconforma (2.º día hábil) y abre su identidad solo para el recurso.
    network.setNow(scenarioDate(35));
    const appeal = await federal.app.request(ROUTES.trackingAppeal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folio,
        authKey: toBase64Url(marta.authKey),
        reasons:
          'La contratación indebida es una falta grave (LGRA, art. 59) y el acuerdo no explica por qué la califica como no grave; además no considera la lista 69-B ni la corroboración.',
        revealIdentityForAppeal: true,
      }),
    });
    expect(appeal.status).toBe(201);
    const { openingId } = AppealResponseSchema.parse(await appeal.json());
    seen = await tracking(federal, folio, marta);
    expect(seen.identityAccess.at(-1)).toMatchObject({ actorRole: 'reporter', openingId });
    expect(seen.procedure?.qualification?.appeal?.resolutionDueOn).toBeDefined();
    expect(seen.procedure?.deadlines.map((deadline) => deadline.key)).toContain(
      'appeal_resolution',
    );
    // Una segunda inconformidad no procede.
    const again = await federal.app.request(ROUTES.trackingAppeal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folio,
        authKey: toBase64Url(marta.authKey),
        reasons: 'Otra vez los mismos motivos para inconformarme contra la calificación.',
        revealIdentityForAppeal: true,
      }),
    });
    expect(again.status).toBe(409);
    // El sobre de identidad del recurso pide dos aprobaciones, una de supervisión (H7).
    const envelopePath = ROUTES.authorityIdentityEnvelope(folio, openingId);
    const approve = (name: NetworkAccountName) =>
      asAccount(federal, name, ROUTES.authorityIdentityApprovals(folio, openingId), {
        legalBasis: 'LGRA, arts. 104 y 109: integrar el recurso de inconformidad (sintético).',
      });
    expect((await asAccount(federal, 'iffeInvestigator', envelopePath, {})).status).toBe(403);
    expect((await approve('iffeInvestigator')).status).toBe(200);
    expect((await asAccount(federal, 'iffeInvestigator', envelopePath, {})).status).toBe(409);
    expect((await approve('iffeSupervision')).status).toBe(200);
    const envelope = await asAccount(federal, 'iffeInvestigator', envelopePath, {});
    expect(envelope.status).toBe(200);
    // La entrega queda en el seguimiento y en la bitácora (identity.released).
    seen = await tracking(federal, folio, marta);
    expect(seen.identityReleases?.map((item) => item.openingId)).toEqual([openingId]);

    // La cabeza del nodo se publicó en la bitácora nacional; Querétaro, testigo, hizo su vuelta.
    expect((await federal.tasks.run()).publishedSeq).toBeNull();
    const round = await queretaro.tasks.run();
    expect(round.witness).not.toBeNull();
  });

  it('la autoridad que se excusa no se escala por conflicto', async () => {
    const network = createTestNetwork();
    const { federal } = network;
    await federal.tasks.run();
    const marta = reporter();
    const reply = await sendThroughRouter(network, IFFE, {
      operationId: 'submitComplaint',
      body: await complaintRequest(network, marta, {
        mode: 'anonymous',
        narrative: demoCase('case.marta').narrative,
        withCorroboration: false,
      }),
    });
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    const excused = await asAccount(federal, 'iffeIntake', ROUTES.authorityProcedure(folio), {
      action: 'respond_conflict',
      response: 'excuse',
      note: 'La titular declara intereses en común con la persona denunciada y se excusa.',
    });
    expect(excused.status).toBe(200);
    const view = await detail(federal, 'iffeIntake', folio);
    expect(view.conflictReview?.response).toBe('excuse');
    // Una segunda respuesta ya no procede.
    const again = await asAccount(federal, 'iffeIntake', ROUTES.authorityProcedure(folio), {
      action: 'respond_conflict',
      response: 'justification',
      note: 'Otra explicación.',
    });
    expect(again.status).toBe(409);
    const seen = await tracking(federal, folio, marta);
    expect(seen.procedure?.steps.map((step) => step.action)).toContain('conflict_excused');
  });

  it('verifica contra S3 la sanción declarada al cerrar: la contradicha se informa', async () => {
    const network = createTestNetwork();
    const { federal } = network;
    await federal.tasks.run();
    const reply = await sendThroughRouter(network, IFFE, {
      operationId: 'submitComplaint',
      body: await complaintRequest(network, reporter(), {
        mode: 'anonymous',
        narrative: demoCase('case.luis').narrative,
        withCorroboration: false,
      }),
    });
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    await asAccount(federal, 'iffeIntake', ROUTES.authorityProcedure(folio), { action: 'accept' });
    const closed = await asAccount(federal, 'iffeInvestigator', ROUTES.authorityProcedure(folio), {
      action: 'close',
      reason: 'attended',
      legalBasis: 'LGRA, art. 75: resolución con sanción.',
      agreement:
        'Se resuelve el expediente OIC-IFFE-RES-0007 con suspensión de 30 días a la persona servidora pública responsable.',
      sanction: {
        fileNumber: 'OIC-IFFE-RES-0007',
        personName: 'Servidor Ficticio Seis',
        sanction: 'Suspensión de 30 días',
        institution: 'Instituto Federal Ficticio de Equipamiento',
        stateCode: '00',
      },
    });
    expect(closed.status).toBe(200);
    const view = await detail(federal, 'iffeInvestigator', folio);
    expect(view.procedure?.closure?.sanctionCheck?.outcome).toBe('contradicted');
  });

  it('turna a otro nodo: el servidor solo transporta y avisa del folio nuevo', async () => {
    const network = createTestNetwork();
    const { federal, queretaro } = network;
    await federal.tasks.run();
    await queretaro.tasks.run();
    const luis = reporter();
    const request = await complaintRequest(network, luis, {
      mode: 'anonymous',
      narrative: demoCase('case.luis').narrative,
      withCorroboration: false,
    });
    const submitted = SubmitComplaintResponseSchema.parse(
      await (await submitDirect(federal, request)).json(),
    );
    // El navegador de quien turna descifra y vuelve a cifrar hacia el nodo destino. Conserva las
    // llaves de seguimiento de Luis; la segunda llave era de la supervisora del nodo de origen.
    const target = 'authority.comptroller-queretaro';
    const reencrypted: SubmitComplaintRequest = { ...request };
    delete reencrypted.escalationEnvelope;
    const sealed = await sealedRelay(network, target, {
      operationId: 'submitComplaint',
      body: reencrypted,
    });
    const transferred = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityTransfer(submitted.folio),
      {
        toAuthorityId: target,
        relay: sealed.relay,
        note: 'Los hechos son de competencia estatal: la turnamos a la Contraloría de Querétaro.',
      },
    );
    expect(transferred.status).toBe(200);
    const { relay, transferId } = TransferComplaintResponseSchema.parse(await transferred.json());
    const reply = await openRoutedReply(relay, sealed.replyPrivateKey, target);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const there = SubmitComplaintResponseSchema.parse(reply.body.value);
    // Un comprobante que no firmó el nodo destino se rechaza.
    const forged = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityTransferReceipt(submitted.folio),
      { transferId, receipt: { ...there.receipt, folio: submitted.folio }, request: reencrypted },
    );
    expect(forged.status).toBe(400);
    const confirmed = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityTransferReceipt(submitted.folio),
      { transferId, receipt: there.receipt, request: reencrypted },
    );
    expect(confirmed.status).toBe(204);
    // Luis ve en el nodo Federal el folio nuevo y sigue con las mismas 8 palabras en Querétaro.
    const seen = await tracking(federal, submitted.folio, luis);
    expect(seen.procedure?.steps.map((step) => step.note ?? '').join(' ')).toContain(
      there.receipt.folio,
    );
    const elsewhere = await tracking(queretaro, there.receipt.folio, luis);
    expect(elsewhere.procedure?.managementState).toBe('routed');
    // El turnado queda en la bitácora con el seudónimo de la cuenta.
    expect(keyIdFor(network.services.network.nodes['node.queretaro'].signing.publicKey)).toBe(
      there.receipt.serverKeyId,
    );
    // Y la denuncia ya no es del nodo Federal: nadie aquí la ve después.
    const gone = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityComplaint(submitted.folio),
    );
    expect(gone.status).toBe(404);
  });
});
