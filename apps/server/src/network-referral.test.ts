// Vista al Ministerio Público hacia una fiscalía de otro nodo, con la red completa en memoria: la
// Contraloría de Querétaro da vista a la fiscalía federal; el navegador re-cifra las pruebas hacia
// la llave de la fiscalía y el nodo de origen firma y entrega el paquete por el enrutador ciego.
// La fiscalía la ve como copia de lectura y avanza la vía penal; la denuncia sigue en Querétaro.
import { describe, expect, it } from 'vitest';
import {
  ComplaintDetailSchema,
  EvidenceUploadResponseSchema,
  NETWORK_ROUTES,
  ProcedureStateSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type {
  ComplaintSummary,
  NetworkReferralPackage,
  SubmitComplaintRequest,
} from '@sigilo/contracts';
import {
  deriveReceiptKeys,
  fromBase64Url,
  generateFolio,
  generateReceiptPhrase,
  identityContextFor,
  openEvidenceBody,
  openEvidenceKey,
  sealEvidence,
  sealIdentity,
  sign,
  toBase64Url,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import { openRoutedReply } from '@sigilo/red';
import { networkReferralMessage } from './services/network-referral-service.ts';
import {
  createTestNetwork,
  networkToken,
  sealedRelay,
  sendThroughRouter,
} from './test-support/network-harness.ts';
import type { NetworkAccountName, TestNetwork, TestNode } from './test-support/network-harness.ts';
import { SYNTHETIC_IDENTITY } from './test-support/harness.ts';

const ROUTER_URL = 'http://enrutador.invalid';
const QUERETARO = 'authority.comptroller-queretaro';
const FISCALIA = 'authority.prosecutor-anticorruption';
const FISCALIA_QRO = 'authority.prosecutor-queretaro';
const IFFE = 'authority.oic-iffe';
const DESCRIPTION =
  'El jefe de compras de la Contraloría pidió un pago en efectivo para adjudicar un contrato (hechos sintéticos de prueba).';

function cleanPng(): Uint8Array {
  const bytes = new Uint8Array(600).fill(7);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function directoryKey(network: TestNetwork, authorityId: string) {
  const authority = network.services.directory.authorities.find((item) => item.id === authorityId);
  if (authority === undefined) throw new Error(`Sin autoridad ${authorityId}.`);
  return { keyId: authority.keyId, publicKey: fromBase64Url(authority.boxPublicKey) };
}

function asAccount(node: TestNode, name: NetworkAccountName, path: string, body?: unknown) {
  const headers: Record<string, string> = { Authorization: `Bearer ${networkToken(name)}` };
  if (body === undefined) return node.app.request(path, { headers });
  headers['Content-Type'] = 'application/json';
  return node.app.request(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function ok(node: TestNode, name: NetworkAccountName, folio: string, body: unknown) {
  const response = await asAccount(node, name, ROUTES.authorityProcedure(folio), body);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
  return ProcedureStateSchema.parse(await response.json());
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

async function listed(node: TestNode, name: NetworkAccountName): Promise<string[]> {
  const response = await asAccount(node, name, ROUTES.authorityComplaints);
  expect(response.status).toBe(200);
  return ((await response.json()) as ComplaintSummary[]).map((item) => item.folio);
}

/**
 * Denuncia sellada por la ventanilla única hacia la Contraloría de Querétaro, con una prueba cifrada
 * hacia su llave; la acepta y la pasa a investigación.
 */
async function investigatedComplaint(network: TestNetwork) {
  const { queretaro } = network;
  const keys: ReceiptKeys = deriveReceiptKeys(generateReceiptPhrase().entropy);
  const folio = generateFolio();
  const plaintext = cleanPng();
  const sealed = await sealEvidence(plaintext, directoryKey(network, QUERETARO), {
    folio,
    authorityId: QUERETARO,
    mediaType: 'image/png',
  });
  const descriptor = await upload(queretaro, sealed.container);
  const request: SubmitComplaintRequest = {
    version: 1,
    mode: 'sealed',
    facts: {
      stateCode: '22',
      entityId: 'VE-OBRAS',
      offenseCode: 'LGRA-52',
      occurredPeriod: '2026-09',
      accused: 'Servidor Ficticio Tres, jefe de compras',
      description: DESCRIPTION,
    },
    evidence: [descriptor],
    protectionRequested: true,
    reporterKeys: {
      boxPublicKey: toBase64Url(keys.box.publicKey),
      signingPublicKey: toBase64Url(keys.signing.publicKey),
    },
    authVerifier: keys.authVerifier,
  };
  request.sealedIdentity = await sealIdentity(
    SYNTHETIC_IDENTITY,
    directoryKey(network, QUERETARO),
    identityContextFor(request),
  );
  const relay = await sealedRelay(network, QUERETARO, {
    operationId: 'submitComplaint',
    body: request,
    folio,
  });
  const response = await network.routerApp.request(`${ROUTER_URL}${NETWORK_ROUTES.relay}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(relay.relay),
  });
  const reply = await openRoutedReply(await response.json(), relay.replyPrivateKey, QUERETARO);
  expect(reply.status).toBe(201);
  if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
  expect(SubmitComplaintResponseSchema.parse(reply.body.value).folio).toBe(folio);
  await ok(queretaro, 'queretaroIntake', folio, { action: 'accept' });
  await ok(queretaro, 'queretaroInvestigator', folio, {
    action: 'advance_stage',
    stage: 'investigation',
  });
  return { folio, keys, plaintext, sealed, descriptor };
}

/** Lo que hace el navegador de quien investiga: re-cifra la prueba hacia la fiscalía y la sube. */
async function resealForProsecutor(
  network: TestNetwork,
  input: Awaited<ReturnType<typeof investigatedComplaint>>,
  target = FISCALIA,
) {
  const own = network.services.network.authorities[QUERETARO].box;
  const fileKey = await openEvidenceKey(
    input.sealed.container,
    own.privateKey,
    directoryKey(network, QUERETARO).keyId,
    { folio: input.folio, authorityId: QUERETARO },
  );
  const opened = await openEvidenceBody(input.sealed.container, fileKey, input.folio, 'image/png');
  const referralFolio = generateFolio();
  const resealed = await sealEvidence(
    opened.plaintext,
    directoryKey(network, target),
    { folio: referralFolio, authorityId: target, mediaType: 'image/png' },
    opened.salt,
  );
  expect(resealed.commitment).toBe(input.sealed.commitment);
  const node = target === FISCALIA ? network.federal : network.queretaro;
  const descriptor = await upload(node, resealed.container);
  return { referralFolio, resealed, descriptor };
}

describe('vista al Ministerio Público hacia una fiscalía de otro nodo', () => {
  it('la fiscalía federal recibe una copia de lectura y avanza la vía penal; la denuncia sigue en el origen', async () => {
    const network = createTestNetwork();
    const { federal, queretaro } = network;
    await federal.tasks.run();
    await queretaro.tasks.run();
    const complaint = await investigatedComplaint(network);
    const { folio } = complaint;
    const { referralFolio, resealed, descriptor } = await resealForProsecutor(network, complaint);
    const body = {
      toAuthorityId: FISCALIA,
      basis: 'internal_control',
      referralFolio,
      evidence: [descriptor],
    };
    const path = ROUTES.authorityNetworkReferral(folio);

    // Solo investigación o substanciación; ni a una autoridad que no es fiscalía, ni a la fiscalía
    // del mismo nodo (esa va por la vista dentro del nodo), ni sin una prueba por cada guardada.
    expect((await asAccount(queretaro, 'queretaroIntake', path, body)).status).toBe(403);
    for (const wrong of [
      { ...body, toAuthorityId: IFFE },
      { ...body, toAuthorityId: FISCALIA_QRO },
      { ...body, evidence: [] },
    ]) {
      expect((await asAccount(queretaro, 'queretaroInvestigator', path, wrong)).status).toBe(400);
    }

    network.forwarded.length = 0;
    const response = await asAccount(queretaro, 'queretaroInvestigator', path, body);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    const state = ProcedureStateSchema.parse(await response.json());
    // La denuncia no se turna: la vía administrativa sigue con la Contraloría.
    expect(state).toMatchObject({
      assignedAuthorityId: QUERETARO,
      managementState: 'accepted',
      legalStage: 'investigation',
      criminalStage: 'criminal_complaint_filed',
    });
    // El enrutador es ciego: no ve los hechos ni los folios.
    const forwarded = network.forwarded.join('');
    expect(forwarded).not.toContain('Servidor Ficticio Tres');
    expect(forwarded).not.toContain(referralFolio);
    expect(forwarded).not.toContain(folio);

    // El origen registra «Vista enviada al nodo …» con el folio de la vista; la persona lo ve.
    const tracking = await queretaro.app.request(ROUTES.tracking, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folio, authKey: toBase64Url(complaint.keys.authKey) }),
    });
    const seen = TrackingViewSchema.parse(await tracking.json());
    const notes = seen.procedure?.steps.map((step) => step.note ?? '').join(' ') ?? '';
    expect(notes).toContain('Vista enviada al nodo');
    expect(notes).toContain(referralFolio);
    expect(notes).toContain('la identidad sellada de la persona denunciante no se comparte');
    // Una segunda vista no procede.
    const again = await resealForProsecutor(network, complaint);
    expect(
      (
        await asAccount(queretaro, 'queretaroInvestigator', path, {
          ...body,
          referralFolio: again.referralFolio,
          evidence: [again.descriptor],
        })
      ).status,
    ).toBe(409);

    // La fiscalía la ve en su bandeja como copia de lectura, con el origen y sin la identidad.
    expect(await listed(federal, 'federalProsecutor')).toContain(referralFolio);
    expect(await listed(federal, 'iffeIntake')).not.toContain(referralFolio);
    const detailResponse = await asAccount(
      federal,
      'federalProsecutor',
      ROUTES.authorityComplaint(referralFolio),
    );
    expect(detailResponse.status).toBe(200);
    const copy = ComplaintDetailSchema.parse(await detailResponse.json());
    expect(copy.summary).toMatchObject({ mode: 'anonymous', assignedAuthorityId: QUERETARO });
    expect(copy.facts.description).toBe(DESCRIPTION);
    expect(copy.sealedIdentityDigest).toBeUndefined();
    expect(copy.messages).toEqual([]);
    expect(copy.identityRequests).toEqual([]);
    expect(copy.networkReferral).toMatchObject({
      fromNodeId: 'node.queretaro',
      fromAuthorityId: QUERETARO,
      originMode: 'sealed',
    });
    expect(copy.procedure?.criminalStage).toBe('criminal_complaint_filed');
    // El folio y la identidad de la persona no viajan.
    expect(JSON.stringify(copy)).not.toContain(folio);
    expect(JSON.stringify(copy)).not.toContain(SYNTHETIC_IDENTITY.fullName);
    // Otra autoridad del nodo no la alcanza.
    expect(
      (await asAccount(federal, 'iffeIntake', ROUTES.authorityComplaint(referralFolio))).status,
    ).toBe(404);

    // La fiscalía abre la prueba con su propia llave; el compromiso es el anclado en el origen.
    const download = await asAccount(
      federal,
      'federalProsecutor',
      ROUTES.authorityEvidence(descriptor.evidenceId),
    );
    expect(download.status).toBe(200);
    const container = new Uint8Array(await download.arrayBuffer());
    expect(container).toEqual(resealed.container);
    const fiscalia = network.services.network.authorities[FISCALIA].box;
    const fileKey = await openEvidenceKey(
      container,
      fiscalia.privateKey,
      directoryKey(network, FISCALIA).keyId,
      { folio: referralFolio, authorityId: FISCALIA },
    );
    const opened = await openEvidenceBody(container, fileKey, referralFolio, 'image/png');
    expect(opened.plaintext).toEqual(complaint.plaintext);
    expect(copy.evidenceCustody?.items[0]?.commitment).toBe(complaint.sealed.commitment);

    // Solo avanza la vía penal; nada del trámite administrativo.
    expect(
      (
        await asAccount(federal, 'federalProsecutor', ROUTES.authorityProcedure(referralFolio), {
          action: 'accept',
        })
      ).status,
    ).toBe(403);
    const advanced = await ok(federal, 'federalProsecutor', referralFolio, {
      action: 'advance_stage',
      stage: 'criminal_investigation',
    });
    expect(advanced).toMatchObject({
      assignedAuthorityId: QUERETARO,
      criminalStage: 'criminal_investigation',
    });
    // Limitación documentada: las etapas penales no regresan al origen.
    const origin = await asAccount(
      queretaro,
      'queretaroInvestigator',
      ROUTES.authorityComplaint(folio),
    );
    expect(ComplaintDetailSchema.parse(await origin.json()).procedure?.criminalStage).toBe(
      'criminal_complaint_filed',
    );

    // La copia no es una denuncia del nodo Federal: no cuenta en datos abiertos ni en reglas.
    const month = copy.summary.receivedOn.slice(0, 7);
    expect(federal.ctx.complaints.countCellsOfMonth(month)).toEqual([]);
    expect(federal.ctx.complaints.listFoliosForRules()).not.toContain(referralFolio);
  });

  it('el nodo destino rechaza una vista sin la firma del nodo de origen o repetida', async () => {
    const network = createTestNetwork();
    const { federal, queretaro } = network;
    await federal.tasks.run();
    await queretaro.tasks.run();
    const complaint = await investigatedComplaint(network);
    const { referralFolio, descriptor } = await resealForProsecutor(network, complaint);
    const pkg: NetworkReferralPackage = {
      v: 1,
      referralId: '0f1e2d3c4b5a69788796a5b4c3d2e1f0',
      referralFolio,
      fromNodeId: 'node.queretaro',
      fromAuthorityId: QUERETARO,
      toAuthorityId: FISCALIA,
      sentOn: copyDay(federal),
      basis: 'internal_control',
      originMode: 'anonymous',
      facts: {
        stateCode: '22',
        entityId: 'VE-OBRAS',
        offenseCode: 'LGRA-52',
        occurredPeriod: '2026-09',
        accused: 'Servidor Ficticio Tres',
        description: DESCRIPTION,
      },
      evidence: [descriptor],
    };
    const deliver = (signature: Uint8Array, to = FISCALIA) =>
      sendThroughRouter(network, to, {
        operationId: 'receiveReferral',
        body: { package: { ...pkg, toAuthorityId: to }, signature: toBase64Url(signature) },
      });
    // Firmada por otra llave (aquí, la de una autoridad): no es del nodo de origen.
    const forged = sign(
      networkReferralMessage(pkg),
      network.services.network.authorities[QUERETARO].signing.privateKey,
    );
    expect((await deliver(forged)).status).toBe(400);
    const queretaroNode = network.services.network.nodes['node.queretaro'].signing.privateKey;
    // Firmada por el nodo, pero hacia una autoridad que no es fiscalía.
    const toIffe = sign(networkReferralMessage({ ...pkg, toAuthorityId: IFFE }), queretaroNode);
    expect((await deliver(toIffe, IFFE)).status).toBe(400);
    const valid = sign(networkReferralMessage(pkg), queretaroNode);
    expect((await deliver(valid)).status).toBe(201);
    // La misma vista otra vez (repetida por quien la interceptó) no crea otra copia.
    expect((await deliver(valid)).status).toBe(400);
    expect(await listed(federal, 'federalProsecutor')).toEqual([referralFolio]);
  });
});

function copyDay(node: TestNode): string {
  return node.ctx.deps.now().toISOString().slice(0, 10);
}
