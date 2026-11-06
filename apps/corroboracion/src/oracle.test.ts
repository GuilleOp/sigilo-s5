// Regresión de H3 (G03): registrar una denuncia de sondeo no revela si hay denuncias contra el
// mismo identificador ni infla las fuentes; solo cuentan las confirmadas por su nodo o
// envejecidas, y el nodo puede dar de baja el spam. La custodia se libera solo con fuentes
// confirmadas.
import { describe, expect, it } from 'vitest';
import { CORROBORATION_ROUTES, IndexNoticesPageSchema } from '@sigilo/contracts';
import type { CorroborationStatus } from '@sigilo/contracts';
import {
  advanceCustody,
  createCustody,
  deriveCustodyReleaseKeys,
  folioDigestFor,
  newCustodyId,
  signIndexConfirmation,
  signIndexWithdrawal,
  signNoticesRequest,
} from '@sigilo/corroboracion';
import { demoCase } from '@sigilo/corroboracion/demo';
import type { DemoCorroborationCase } from '@sigilo/corroboracion/demo';
import {
  confirmFromNode,
  corroborateInBrowser,
  createTestCorroboration,
  postJson,
  registerFromNode,
  requestedAtOf,
  withdrawFromNode,
} from './test-support.ts';

type Services = ReturnType<typeof createTestCorroboration>;

const PROBE_TEXT =
  'Texto de sondeo cualquiera sin relación alguna con hechos concretos de ninguna persona, solo para consultar el índice.';

/** Denuncia real de Marta, pero en el nodo Querétaro, aceptada por su autoridad. */
async function realComplaintAtQueretaro(services: Services): Promise<CorroborationStatus> {
  const marta = demoCase('case.marta');
  const item: DemoCorroborationCase = {
    ...marta,
    nodeId: 'node.queretaro',
    receivedAt: '2026-11-09T11:00Z',
  };
  const browser = await corroborateInBrowser(services, marta.identifier, marta.narrative);
  await registerFromNode(services, item, 'K7Q2-M9XP-4RT1', browser);
  const confirmed = await confirmFromNode(services, 'node.queretaro', 'K7Q2-M9XP-4RT1');
  if (confirmed.status === null) throw new Error('Sin confirmación.');
  return confirmed.status;
}

async function probe(
  services: Services,
  ocid: string,
  folio: string,
  options: { custody?: boolean } = {},
): Promise<CorroborationStatus> {
  const item: DemoCorroborationCase = {
    key: 'case.probe',
    identifier: { kind: 'ocid', ocid },
    nodeId: 'node.federal',
    entry: 'direct',
    receivedAt: '2026-11-09T11:50Z',
    narrative: PROBE_TEXT,
  };
  const browser = await corroborateInBrowser(services, item.identifier, PROBE_TEXT);
  const registered = await registerFromNode(services, item, folio, browser, options);
  if (registered.status === null)
    throw new Error(`Registro rechazado: ${registered.response.status}`);
  return registered.status;
}

async function noticesFor(services: Services, nodeId: 'node.queretaro' | 'node.federal') {
  const request = signNoticesRequest(
    { nodeId, after: 0, requestedAt: requestedAtOf(services) },
    services.network.nodes[nodeId].signing.privateKey,
  );
  const response = await postJson(services.indexApp, CORROBORATION_ROUTES.indexNotices, request);
  return IndexNoticesPageSchema.parse(await response.json()).notices;
}

/** Lo que queda de un estado al quitar lo que es propio de cada registro. */
function shape(status: CorroborationStatus) {
  return { ...status, folioDigest: '', groupId: '' };
}

describe('la corroboración no es un oráculo (H3, G03)', () => {
  it('un sondeo sin confirmar recibe el mismo estado haya o no denuncias contra el identificador', async () => {
    const services = createTestCorroboration({ requireConfirmation: true });
    const real = await realComplaintAtQueretaro(services);
    const withComplaints = await probe(services, 'ocds-fict00-IFFE-AD-2026-0042', 'A7Q2-M9XP-4RT2');
    const control = await probe(services, 'ocds-fict00-IFFE-AD-2026-9999', 'B7Q2-M9XP-4RT3');
    expect(withComplaints.isRevealed).toBe(false);
    expect(withComplaints.independentSources).toBe(1);
    expect(withComplaints.confirmedOtherSources).toBe(0);
    expect(withComplaints.groupId).not.toBe(real.groupId);
    expect(shape(withComplaints)).toEqual(shape(control));
    // Tampoco infla la denuncia real ni le manda aviso al otro nodo.
    expect(await noticesFor(services, 'node.queretaro')).toEqual([]);
    expect(await noticesFor(services, 'node.federal')).toEqual([]);
  });

  it('al confirmarse como aceptada, la coincidencia cuenta y ambos nodos lo ven', async () => {
    const services = createTestCorroboration({ requireConfirmation: true });
    await realComplaintAtQueretaro(services);
    await probe(services, 'ocds-fict00-IFFE-AD-2026-0042', 'A7Q2-M9XP-4RT2');
    const confirmed = await confirmFromNode(services, 'node.federal', 'A7Q2-M9XP-4RT2');
    expect(confirmed.status?.isRevealed).toBe(true);
    expect(confirmed.status?.independentSources).toBe(2);
    expect(confirmed.status?.confirmation).toBe('confirmed');
    const notices = await noticesFor(services, 'node.queretaro');
    expect(notices.at(-1)?.status.independentSources).toBe(2);
  });

  it('la baja retira el sondeo, no se puede volver a registrar y nunca envejece', async () => {
    const services = createTestCorroboration({ requireConfirmation: true });
    await realComplaintAtQueretaro(services);
    await probe(services, 'ocds-fict00-IFFE-AD-2026-0042', 'A7Q2-M9XP-4RT2');
    const withdrawn = await withdrawFromNode(services, 'node.federal', 'A7Q2-M9XP-4RT2');
    expect(withdrawn.status).toBe(200);
    expect(await withdrawn.json()).toEqual({
      folioDigest: folioDigestFor('A7Q2-M9XP-4RT2', services.nodeSecrets['node.federal']),
      withdrawn: true,
    });
    await expect(
      probe(services, 'ocds-fict00-IFFE-AD-2026-0042', 'A7Q2-M9XP-4RT2'),
    ).rejects.toThrow('400');
    const rows = services.indexDb.prepare('SELECT COUNT(*) AS total FROM registrations').get() as {
      total: number;
    };
    expect(rows.total).toBe(1);
    services.clock.set('2026-12-20T12:00:00Z');
    expect(await noticesFor(services, 'node.queretaro')).toEqual([]);
  });

  it('pasados los días de gracia sin baja ni confirmación, cuenta (según el reloj del índice)', async () => {
    const services = createTestCorroboration({ requireConfirmation: true });
    await realComplaintAtQueretaro(services);
    await probe(services, 'ocds-fict00-IFFE-AD-2026-0042', 'A7Q2-M9XP-4RT2');
    services.clock.set('2026-12-08T12:00:00Z');
    expect(await noticesFor(services, 'node.queretaro')).toEqual([]);
    services.clock.set('2026-12-09T12:00:00Z');
    const notices = await noticesFor(services, 'node.queretaro');
    expect(notices.at(-1)?.status.independentSources).toBe(2);
    const federal = await noticesFor(services, 'node.federal');
    expect(federal.at(-1)?.status.confirmation).toBe('aged');
    expect(federal.at(-1)?.status.isRevealed).toBe(true);
  });

  it('confirmación y baja exigen la firma del nodo dueño del folio y hora vigente', async () => {
    const services = createTestCorroboration({ requireConfirmation: true });
    await probe(services, 'ocds-fict00-IFFE-AD-2026-0042', 'A7Q2-M9XP-4RT2');
    const digest = folioDigestFor('A7Q2-M9XP-4RT2', services.nodeSecrets['node.federal']);
    const foreign = signIndexConfirmation(
      { nodeId: 'node.federal', folioDigest: digest, requestedAt: requestedAtOf(services) },
      services.network.nodes['node.queretaro'].signing.privateKey,
    );
    expect(
      (await postJson(services.indexApp, CORROBORATION_ROUTES.indexConfirmations, foreign)).status,
    ).toBe(401);
    const otherNode = signIndexConfirmation(
      { nodeId: 'node.queretaro', folioDigest: digest, requestedAt: requestedAtOf(services) },
      services.network.nodes['node.queretaro'].signing.privateKey,
    );
    expect(
      (await postJson(services.indexApp, CORROBORATION_ROUTES.indexConfirmations, otherNode))
        .status,
    ).toBe(404);
    const stale = signIndexWithdrawal(
      {
        nodeId: 'node.federal',
        folioDigest: digest,
        reason: 'spam',
        requestedAt: '2026-11-09T09:00Z',
      },
      services.network.nodes['node.federal'].signing.privateKey,
    );
    expect(
      (await postJson(services.indexApp, CORROBORATION_ROUTES.indexWithdrawals, stale)).status,
    ).toBe(400);
    const otherWithdrawal = signIndexWithdrawal(
      {
        nodeId: 'node.queretaro',
        folioDigest: digest,
        reason: 'spam',
        requestedAt: requestedAtOf(services),
      },
      services.network.nodes['node.queretaro'].signing.privateKey,
    );
    expect(
      (await postJson(services.indexApp, CORROBORATION_ROUTES.indexWithdrawals, otherWithdrawal))
        .status,
    ).toBe(200);
    // La baja de otro nodo no toca el registro del nodo Federal.
    const rows = services.indexDb.prepare('SELECT COUNT(*) AS total FROM registrations').get() as {
      total: number;
    };
    expect(rows.total).toBe(1);
  });

  it('la custodia ve solo fuentes confirmadas y se libera solo con ellas', async () => {
    const services = createTestCorroboration({ requireConfirmation: true });
    const custodyStatus = await probe(services, 'ocds-fict00-IFFE-AD-2026-0042', 'A7Q2-M9XP-4RT2', {
      custody: true,
    });
    expect(custodyStatus.isRevealed).toBe(true);
    expect(custodyStatus.confirmedOtherSources).toBe(0);
    const record = createCustody({
      custodyId: newCustodyId(),
      epoch: 1,
      tag: 'a'.repeat(64),
      createdOn: '2026-11-09',
      occurredPeriod: '2026-03',
      chosenDeadline: '2027-06-30',
      releasePublicKey: deriveCustodyReleaseKeys(new Uint8Array(11)).publicKey,
      sealed: {
        v: 1,
        suite: 'DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305',
        keyId: '0123456789abcdef',
        enc: 'AA',
        ct: 'AA',
      },
    });
    // Llega otra denuncia sin confirmar (podría ser un sondeo): no libera.
    const marta = demoCase('case.marta');
    const browser = await corroborateInBrowser(services, marta.identifier, marta.narrative);
    await registerFromNode(
      services,
      { ...marta, nodeId: 'node.queretaro', receivedAt: '2026-11-09T11:00Z' },
      'K7Q2-M9XP-4RT1',
      browser,
    );
    let notices = await noticesFor(services, 'node.federal');
    const pendingOther = notices.at(-1)?.status.confirmedOtherSources ?? 0;
    expect(pendingOther).toBe(0);
    expect(
      advanceCustody(record, {
        type: 'match_reported',
        confirmedOtherSources: pendingOther,
        on: '2026-11-09',
      }).state,
    ).toBe('held');
    // Su autoridad la acepta: ahora sí libera.
    await confirmFromNode(services, 'node.queretaro', 'K7Q2-M9XP-4RT1');
    notices = await noticesFor(services, 'node.federal');
    const confirmedOther = notices.at(-1)?.status.confirmedOtherSources ?? 0;
    expect(confirmedOther).toBe(1);
    expect(
      advanceCustody(record, {
        type: 'match_reported',
        confirmedOtherSources: confirmedOther,
        on: '2026-11-10',
      }).release?.reason,
    ).toBe('corroborated');
  });
});
