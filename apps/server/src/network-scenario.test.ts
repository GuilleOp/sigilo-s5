// Recorrido de integración de la red (docs/demo-escenario.md) con todos los servicios en memoria:
// Marta envía por el enrutador ciego al nodo Federal, Luis corrobora por la entrada propia del nodo,
// el nodo alerta del conflicto de interés, el OIC archiva con plantilla, el auditor señala, las
// reglas escalan a la supervisora y Marta lo ve en su seguimiento. También el turnado entre nodos y
// la denuncia sin autoridad competente, que llega al buzón general del nodo y este la turna.
import { describe, expect, it } from 'vitest';
import {
  AppealResponseSchema,
  ComplaintDetailSchema,
  EvidenceUploadResponseSchema,
  NODE_KEY_AUTHORITY_ID,
  ROUTES,
  SubmitComplaintResponseSchema,
  TrackingViewSchema,
  TransferComplaintResponseSchema,
} from '@sigilo/contracts';
import type { SubmitComplaintRequest } from '@sigilo/contracts';
import {
  decodeFileKey,
  deriveReceiptKeys,
  encodeFileKey,
  evidenceReceivedPayloadDigest,
  fromBase64Url,
  generateFolio,
  generateReceiptPhrase,
  grantEvidenceKey,
  identityContextFor,
  keyIdFor,
  openEscalation,
  openEvidenceBody,
  openEvidenceGrant,
  openEvidenceKey,
  sealEscalation,
  sealEvidence,
  sealIdentity,
  sealMailboxMessage,
  toBase64Url,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import { templateQualificationText } from '@sigilo/auditor/eval';
import { DEMO_OCID, demoCase } from '@sigilo/corroboracion/demo';
import { openRoutedReply, proposeCompetentAuthority } from '@sigilo/red';
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
      note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
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

describe('canal único: sin autoridad competente llega al buzón general (Bases de la PDN, 56 y 58)', () => {
  /** Denuncia sintética contra un ente federal sin autoridad competente en el directorio. */
  function aduanaRequest(keys: ReceiptKeys, stateCode: string): SubmitComplaintRequest {
    return {
      version: 1,
      mode: 'anonymous',
      facts: {
        stateCode,
        entityId: 'VE-ADUANA',
        offenseCode: 'LGRA-54',
        occurredPeriod: '2026-04',
        accused: 'Servidor Ficticio Tres',
        description: 'Hechos sintéticos sin autoridad competente en el directorio de la red.',
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

  it('un ente federal sin OIC en la tabla va al buzón federal; queda en el buzón y este la turna al OIC', async () => {
    const network = createTestNetwork();
    const { federal } = network;
    await network.runNodeTasks(federal);
    const proposal = proposeCompetentAuthority(
      network.services.directory,
      { stateCode: '09', entityId: 'VE-ADUANA', offenseCode: 'LGRA-54' },
      '2026-11-09',
    );
    expect(proposal.status).toBe('inbox');
    const inbox = proposal.proposed?.authority;
    expect(inbox?.id).toBe('authority.buzon-federal');
    if (inbox === undefined) return;
    // La llave del buzón en el directorio es la de `keys.json` del nodo: el buzón la abre.
    expect(inbox.keyId).toBe(federal.ctx.deps.keys.publicKeySet.authority.keyId);

    const keys = reporter();
    const request = aduanaRequest(keys, '09');
    request.escalationEnvelope = await sealEscalation(request, directoryKey(network, OVERSIGHT), {
      authVerifier: request.authVerifier,
      reporterKeys: request.reporterKeys,
    });
    const reply = await sendThroughRouter(network, inbox.id, {
      operationId: 'submitComplaint',
      body: request,
    });
    expect(reply.status).toBe(201);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    // El enrutador solo vio el destino: nada de la denuncia.
    expect(network.forwarded.join('')).not.toContain('Servidor Ficticio Tres');

    const stored = federal.ctx.complaints.find(folio);
    expect(stored?.assignedAuthorityId).toBe('authority.buzon-federal');
    expect(stored?.managementState).toBe('received_in_inbox');
    let view = await detail(federal, 'federalInboxIntake', folio);
    expect(view.procedure?.managementState).toBe('received_in_inbox');

    // Una persona del buzón la turna a quien corresponda.
    const routed = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityProcedure(folio),
      {
        action: 'route',
        authorityId: IFFE,
        note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
      },
    );
    expect(routed.status).toBe(200);
    expect(federal.ctx.complaints.find(folio)?.assignedAuthorityId).toBe(IFFE);
    view = await detail(federal, 'iffeIntake', folio);
    expect(view.procedure?.managementState).toBe('routed');
  });

  it('con nodo estatal, llega al buzón de ese nodo con la identidad sellada hacia su llave', async () => {
    const network = createTestNetwork();
    const { queretaro } = network;
    await network.runNodeTasks(queretaro);
    // Un ente fuera del catálogo: la tabla de Querétaro no nombra quién lo investiga.
    const proposal = proposeCompetentAuthority(
      network.services.directory,
      { stateCode: '22', entityId: 'VE-OTRO-SIN-CATALOGO', offenseCode: 'LGRA-54' },
      '2026-11-09',
    );
    expect(proposal.proposed?.authority.id).toBe('authority.buzon-queretaro');
    const keys = reporter();
    const request: SubmitComplaintRequest = {
      ...aduanaRequest(keys, '22'),
      mode: 'sealed',
      protectionRequested: true,
    };
    request.sealedIdentity = await sealIdentity(
      SYNTHETIC_IDENTITY,
      directoryKey(network, 'authority.buzon-queretaro'),
      identityContextFor(request),
    );
    const reply = await sendThroughRouter(network, 'authority.buzon-queretaro', {
      operationId: 'submitComplaint',
      body: request,
    });
    expect(reply.status).toBe(201);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const { folio } = SubmitComplaintResponseSchema.parse(reply.body.value);
    const stored = queretaro.ctx.complaints.find(folio);
    expect(stored?.assignedAuthorityId).toBe('authority.buzon-queretaro');
    expect(stored?.managementState).toBe('received_in_inbox');
    expect(stored?.sealedIdentity?.keyId).toBe(
      queretaro.ctx.deps.keys.publicKeySet.authority.keyId,
    );
  });
});

describe('pruebas cifradas de extremo a extremo y su custodia en la red', () => {
  const QUERETARO = 'authority.comptroller-queretaro';

  function cleanPng(): Uint8Array {
    const bytes = new Uint8Array(600).fill(5);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes;
  }

  async function upload(node: TestNode, container: Uint8Array) {
    const response = await node.app.request(ROUTES.evidenceUpload, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: container,
    });
    expect(response.status).toBe(201);
    return EvidenceUploadResponseSchema.parse(await response.json());
  }

  async function download(node: TestNode, name: NetworkAccountName, evidenceId: string) {
    const response = await asAccount(node, name, ROUTES.authorityEvidence(evidenceId));
    return response.status === 200 ? new Uint8Array(await response.arrayBuffer()) : null;
  }

  /** Denuncia directa al nodo Federal con una prueba cifrada hacia la llave del nodo. */
  async function withEvidence(network: TestNetwork) {
    const { federal } = network;
    const keys = reporter();
    const folio = generateFolio();
    const plaintext = cleanPng();
    const inbox = {
      keyId: keyIdFor(federal.inboxBox.publicKey),
      publicKey: federal.inboxBox.publicKey,
    };
    const sealed = await sealEvidence(plaintext, inbox, {
      folio,
      authorityId: NODE_KEY_AUTHORITY_ID,
      mediaType: 'image/png',
    });
    const descriptor = await upload(federal, sealed.container);
    const request = await complaintRequest(network, keys, {
      mode: 'anonymous',
      narrative: demoCase('case.luis').narrative,
      withCorroboration: false,
    });
    request.evidence = [descriptor];
    request.escalationEnvelope = await sealEscalation(
      request,
      directoryKey(network, OVERSIGHT),
      { authVerifier: request.authVerifier, reporterKeys: request.reporterKeys },
      [{ evidenceId: descriptor.evidenceId, fileKey: encodeFileKey(sealed.fileKey) }],
    );
    const response = await federal.app.request(`${ROUTES.complaints}?folio=${folio}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    expect(response.status).toBe(201);
    expect(SubmitComplaintResponseSchema.parse(await response.json()).folio).toBe(folio);
    return { keys, folio, plaintext, sealed, descriptor, request };
  }

  it('el nodo guarda solo el contenedor y ancla sus digestos; la autoridad lo abre y comprueba', async () => {
    const network = createTestNetwork();
    const { federal } = network;
    const { folio, plaintext, sealed, descriptor } = await withEvidence(network);
    // Lo guardado no contiene la imagen en claro.
    const stored = federal.server.evidenceStore.read(descriptor.evidenceId);
    expect(stored).toEqual(sealed.container);
    expect(Buffer.from(stored ?? []).includes(Buffer.from(plaintext.subarray(0, 32)))).toBe(false);

    const view = await detail(federal, 'federalInboxIntake', folio);
    expect(view.evidenceCustody?.items).toEqual([
      {
        evidenceId: descriptor.evidenceId,
        sha256: sealed.sha256,
        commitment: sealed.commitment,
        isStored: true,
      },
    ]);
    const anchored = view.evidenceCustody?.events[0];
    expect(anchored?.type).toBe('evidence.received');
    expect(anchored?.payloadDigest).toBe(
      evidenceReceivedPayloadDigest(folio, view.evidenceCustody?.items ?? []),
    );
    // Al cerrar el día, el anclaje queda publicado en la bitácora con ese digesto.
    network.setNow(scenarioDate(1));
    await network.runNodeTasks(federal);
    const published = await detail(federal, 'federalInboxIntake', folio);
    expect(published.evidenceCustody?.events[0]?.seq).toBeTypeOf('number');

    // El navegador del buzón abre la prueba con su llave y el compromiso coincide con el anclado.
    const container = await download(federal, 'federalInboxIntake', descriptor.evidenceId);
    if (container === null) throw new Error('Sin prueba.');
    const fileKey = await openEvidenceKey(
      container,
      federal.inboxBox.privateKey,
      keyIdFor(federal.inboxBox.publicKey),
      { folio, authorityId: NODE_KEY_AUTHORITY_ID },
    );
    const opened = await openEvidenceBody(container, fileKey, folio, 'image/png');
    expect(opened.plaintext).toEqual(plaintext);
    expect(opened.commitment).toBe(sealed.commitment);
  });

  it('al turnar dentro del nodo, el buzón re-cifra la llave hacia la autoridad competente', async () => {
    const network = createTestNetwork();
    const { federal } = network;
    const { folio, sealed, descriptor, plaintext } = await withEvidence(network);
    const iffe = directoryKey(network, IFFE);
    const grant = {
      evidenceId: descriptor.evidenceId,
      authorityId: IFFE,
      envelope: await grantEvidenceKey(
        sealed.fileKey,
        iffe,
        { folio, authorityId: IFFE },
        sealed.commitment,
      ),
    };
    // Un sobre que no va hacia la llave publicada de la autoridad nombrada se rechaza.
    const wrongKey = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityEvidenceKeys(folio),
      { grants: [{ ...grant, authorityId: OVERSIGHT }] },
    );
    expect(wrongKey.status).toBe(400);
    const granted = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityEvidenceKeys(folio),
      { grants: [grant] },
    );
    expect(granted.status).toBe(200);
    const routed = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityProcedure(folio),
      {
        action: 'route',
        authorityId: IFFE,
        note: 'Se turna a la autoridad competente para el ente (motivo sintético).',
      },
    );
    expect(routed.status).toBe(200);
    const view = await detail(federal, 'iffeIntake', folio);
    const own = view.evidenceCustody?.keyGrants[0];
    if (own === undefined) throw new Error('Sin llave re-cifrada.');
    const iffeKeys = network.services.network.authorities[IFFE].box;
    const fileKey = await openEvidenceGrant(
      own.envelope,
      iffeKeys.privateKey,
      { folio, authorityId: IFFE },
      sealed.commitment,
    );
    const container = await download(federal, 'iffeIntake', descriptor.evidenceId);
    if (container === null) throw new Error('Sin prueba.');
    expect((await openEvidenceBody(container, fileKey, folio, 'image/png')).plaintext).toEqual(
      plaintext,
    );
  });

  it('la supervisora abre las pruebas con las llaves del sobre de escalamiento', async () => {
    const network = createTestNetwork();
    const { folio, request, plaintext, descriptor, sealed } = await withEvidence(network);
    const supervisor = network.services.network.authorities[OVERSIGHT].box;
    if (request.escalationEnvelope === undefined) throw new Error('Sin segunda llave.');
    const content = await openEscalation(request.escalationEnvelope, supervisor.privateKey, {
      authVerifier: request.authVerifier,
      reporterKeys: request.reporterKeys,
    });
    const key = content.evidenceKeys.find((item) => item.evidenceId === descriptor.evidenceId);
    if (key === undefined) throw new Error('Sin llave del archivo.');
    const opened = await openEvidenceBody(
      sealed.container,
      decodeFileKey(key.fileKey),
      folio,
      'image/png',
    );
    expect(opened.plaintext).toEqual(plaintext);
  });

  it('al confirmar el turnado a otro nodo, el origen borra sus copias y registra la custodia', async () => {
    const network = createTestNetwork();
    const { federal, queretaro } = network;
    await federal.tasks.run();
    await queretaro.tasks.run();
    const { folio, request, sealed, descriptor } = await withEvidence(network);

    // El navegador de quien turna abre la prueba y la vuelve a cifrar hacia la autoridad destino,
    // con el folio que elige para el destino y la misma sal: el compromiso no cambia.
    const opened = await openEvidenceBody(sealed.container, sealed.fileKey, folio, 'image/png');
    const targetFolio = generateFolio();
    const resealed = await sealEvidence(
      opened.plaintext,
      directoryKey(network, QUERETARO),
      { folio: targetFolio, authorityId: QUERETARO, mediaType: 'image/png' },
      opened.salt,
    );
    expect(resealed.commitment).toBe(sealed.commitment);
    const targetDescriptor = await upload(queretaro, resealed.container);
    const reencrypted: SubmitComplaintRequest = { ...request, evidence: [targetDescriptor] };
    delete reencrypted.escalationEnvelope;
    const sealedRequest = await sealedRelay(network, QUERETARO, {
      operationId: 'submitComplaint',
      body: reencrypted,
      folio: targetFolio,
    });
    const transferred = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityTransfer(folio),
      {
        toAuthorityId: QUERETARO,
        relay: sealedRequest.relay,
        note: 'Los hechos son de competencia estatal: la turnamos a la Contraloría de Querétaro.',
      },
    );
    expect(transferred.status).toBe(200);
    // Sin el comprobante del destino, el origen conserva su copia.
    expect(federal.server.evidenceStore.read(descriptor.evidenceId)).not.toBeNull();
    expect((await detail(federal, 'federalInboxIntake', folio)).storedEvidenceCount).toBe(1);

    const { relay, transferId } = TransferComplaintResponseSchema.parse(await transferred.json());
    const reply = await openRoutedReply(relay, sealedRequest.replyPrivateKey, QUERETARO);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const there = SubmitComplaintResponseSchema.parse(reply.body.value);
    expect(there.folio).toBe(targetFolio);

    const confirmed = await asAccount(
      federal,
      'federalInboxIntake',
      ROUTES.authorityTransferReceipt(folio),
      { transferId, receipt: there.receipt, request: reencrypted },
    );
    expect(confirmed.status).toBe(204);
    // Una sola copia viva: la del destino.
    expect(federal.server.evidenceStore.read(descriptor.evidenceId)).toBeNull();
    expect(queretaro.server.evidenceStore.read(targetDescriptor.evidenceId)).toEqual(
      resealed.container,
    );
    const custody = federal.ctx.evidence.listCustodyEvents(folio);
    expect(custody.map((event) => event.type)).toEqual([
      'evidence.received',
      'evidence.custody_transferred',
    ]);
    expect(custody[1]).toMatchObject({ toNodeId: 'node.queretaro', toAuthorityId: QUERETARO });
    // El destino ancló la misma prueba (mismo compromiso) al recibirla.
    expect(queretaro.ctx.evidence.listCustodyItems(targetFolio)).toEqual([
      {
        evidenceId: targetDescriptor.evidenceId,
        sha256: resealed.sha256,
        commitment: sealed.commitment,
        isStored: true,
      },
    ]);
  });
});
