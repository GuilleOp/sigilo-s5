// Recorrido de la ventanilla única de la web contra la red en memoria (enrutador ciego real, nodos
// Federal y Querétaro, evaluador e índice): directorio del mismo origen verificado con la raíz
// fijada, propuesta de la autoridad, envío cifrado por el enrutador con corroboración ciega y
// seguimiento con las mismas 8 palabras, buscando el folio en todos los nodos; y el turnado entre
// nodos que vuelve a cifrar en el navegador de recepción (SEC-19). Sin autoridad competente, la
// denuncia llega al buzón general del nodo, que la turna (Bases de la PDN, arts. 56 y 58). Con el
// nodo destino caído, la denuncia queda cerrada en la cola del enrutador y llega al volver.
import { describe, expect, it } from 'vitest';
import { evaluatorKeyFromDirectory } from '@sigilo/corroboracion';
import { DEMO_OCID, demoCase } from '@sigilo/corroboracion/demo';
import {
  createTestNetwork,
  networkToken,
  submitDirect,
} from '../../../server/src/test-support/network-harness.ts';
import type { TestNetwork } from '../../../server/src/test-support/network-harness.ts';
import type { AuthorityKeys } from '../crypto/authority.ts';
import { openForAuthority, verifyEvidenceAnchor } from '../crypto/evidence.ts';
import { createReceipt } from '../crypto/submission.ts';
import { transferToOtherNode } from '../pages/authority/transfer.ts';
import { createSigiloApi } from '../services/api.ts';
import { keyIdFor, toBase64Url } from '@sigilo/core';
import type { DemoAuthorityId } from '@sigilo/red';
import { SubmitComplaintResponseSchema } from '@sigilo/contracts';
import { corroborateBlindly } from '../corroboration/blind-corroboration.ts';
import { inlinePowSolver } from '../crypto/proof-of-work.ts';
import { startTrackingSession, verifyTrackingReceipt } from '../crypto/tracking.ts';
import { resolveDestination } from '../pages/report/destination.ts';
import { submitReport } from '../pages/report/submit-report.ts';
import type { SigiloApi } from '../services/api.ts';
import { createApiClient } from '../services/api-client.ts';
import { emptyDraft } from '../state/report-draft.ts';
import type { EvidenceItem } from '../state/report-draft.ts';
import { loadNetworkState } from './directory.ts';
import { destinationFor, keysForDestination } from './network-keys.ts';
import { trackAcrossNetwork } from './network-tracking.ts';
import { createRelayApi, sameOriginQueueChallenge, sameOriginRelaySender } from './relay-api.ts';
import { routingChoiceFor } from './routing.ts';

/** La API directa no debe usarse en el envío por la red. */
const UNUSED_API = new Proxy(
  {},
  {
    get() {
      throw new Error('El envío por la red no debe usar la API directa.');
    },
  },
) as SigiloApi;

/** Llaves de una autoridad de la red de prueba, como las importa el panel. */
function authorityKeysOf(network: TestNetwork, authorityId: DemoAuthorityId): AuthorityKeys {
  const pair = network.services.network.authorities[authorityId];
  return {
    keyId: keyIdFor(pair.box.publicKey),
    boxPublicKey: pair.box.publicKey,
    boxPrivateKey: pair.box.privateKey,
    signingPublicKey: pair.signing.publicKey,
    signingPrivateKey: pair.signing.privateKey,
  };
}

/** Imagen PNG limpia sintética: firma real seguida de relleno. */
function cleanPngItem(id: string): EvidenceItem {
  const bytes = new Uint8Array(400).fill(3);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    id,
    fileName: `foto-${id}.png`,
    kind: 'image',
    original: new Blob(['original']),
    originalSha256: '0'.repeat(64),
    status: 'clean',
    clean: [{ id: `${id}-limpia`, blob: new Blob([bytes], { type: 'image/png' }), url: 'blob:x' }],
    cleanVerified: true,
  };
}

async function setup() {
  const network = createTestNetwork();
  await network.federal.tasks.run();
  await network.queretaro.tasks.run();
  // La web se sirve desde el nodo Querétaro: todo lo pide a su mismo origen.
  const client = createApiClient((input, init) =>
    Promise.resolve(network.queretaro.app.request(`http://nodo-queretaro.invalid${input}`, init)),
  );
  const state = await loadNetworkState(network.trust, client);
  if (state.kind !== 'verified') throw new Error(`Directorio no verificado: ${state.kind}`);
  return { network, client, directory: state.directory };
}

describe('ventanilla única por la red', () => {
  it('rechaza un directorio que no firma la raíz fijada', async () => {
    const { client } = await setup();
    const other = createTestNetwork();
    expect((await loadNetworkState(other.trust, client)).kind).toBe('invalid');
  });

  it('propone la autoridad con su razonamiento y deja elegir otra', async () => {
    const { directory } = await setup();
    const choice = routingChoiceFor(
      directory,
      { stateCode: '22', entityId: 'VE-INSTITUTO', offenseCode: 'LGRA-59' },
      '2026-11-09',
    );
    expect(choice.proposal.proposed?.authority.id).toBe('authority.oic-iffe');
    expect(choice.proposal.reasons.join(' ')).toContain('enrutador solo ve');
    expect(choice.options[0]?.kind).toBe('proposed');
    expect(
      choice.options.some((option) => option.authorityId === 'authority.oversight-federal'),
    ).toBe(false);
  });

  it('sin autoridad competente envía al buzón general del nodo y se sigue con las mismas palabras', async () => {
    const { network, client, directory } = await setup();
    const draft = emptyDraft();
    draft.mode = 'anonymous';
    draft.facts = {
      stateCode: '09',
      municipalityCode: '',
      entityId: 'VE-ADUANA',
      offenseCode: 'LGRA-54',
      periodMonth: '04',
      periodYear: '2026',
      accused: 'Servidor Ficticio Tres',
      description: 'Hechos sintéticos sin autoridad competente en el directorio de la red.',
    };
    const resolved = resolveDestination(draft, { kind: 'verified', directory });
    if (resolved.kind !== 'network') throw new Error(`Destino inesperado: ${resolved.kind}`);
    expect(resolved.selected).toMatchObject({
      authorityId: 'authority.buzon-federal',
      kind: 'inbox',
    });
    expect(resolved.selected.reason).toContain('donde una persona la turna a quien corresponda');
    const destination = destinationFor(directory, resolved.selected.authorityId);
    const relayApi = createRelayApi(
      { authorityId: destination.authority.id, node: destination.node },
      sameOriginRelaySender(client),
    );
    const result = await submitReport(draft, UNUSED_API, () => undefined, {
      solver: inlinePowSolver,
      network: {
        api: relayApi,
        keys: keysForDestination(destination),
        authorityId: destination.authority.id,
        authorityName: destination.authority.name,
        nodeName: destination.node.name,
      },
    });
    expect(result.destination?.authorityName).toBe('Buzón general ficticio del nodo Federal');
    const stored = network.federal.ctx.complaints.find(result.folio);
    expect(stored?.assignedAuthorityId).toBe('authority.buzon-federal');
    expect(stored?.managementState).toBe('received_in_inbox');
    const session = startTrackingSession(result.folio, result.words);
    const found = await trackAcrossNetwork(
      directory,
      session.credentials,
      sameOriginRelaySender(client),
    );
    expect(found?.node.id).toBe('node.federal');
    if (found === null) return;
    expect(verifyTrackingReceipt(found.view, found.keys).isReceiptValid).toBe(true);
  });

  it('envía cifrado por el enrutador con corroboración y se sigue con las mismas palabras', async () => {
    const { network, client, directory } = await setup();
    const narrative = demoCase('case.luis').narrative;
    const draft = emptyDraft();
    draft.mode = 'anonymous';
    draft.facts = {
      stateCode: '22',
      municipalityCode: '',
      entityId: 'VE-INSTITUTO',
      offenseCode: 'LGRA-59',
      periodMonth: '03',
      periodYear: '2026',
      accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
      description: narrative,
    };
    const destination = destinationFor(directory, 'authority.oic-iffe');
    const keys = keysForDestination(destination);
    const relayApi = createRelayApi(
      { authorityId: destination.authority.id, node: destination.node },
      sameOriginRelaySender(client),
    );
    const key = evaluatorKeyFromDirectory(directory);
    if (key === null) throw new Error('El directorio no publica el evaluador.');
    const result = await submitReport(draft, UNUSED_API, () => undefined, {
      solver: inlinePowSolver,
      network: {
        api: relayApi,
        keys,
        authorityId: destination.authority.id,
        authorityName: destination.authority.name,
        nodeName: destination.node.name,
        corroborate: (text) =>
          corroborateBlindly({ kind: 'ocid', ocid: DEMO_OCID }, key, text, client),
      },
    });
    expect(result.destination?.nodeName).toBe(destination.node.name);
    expect(result.corroboration).toBe('sent');
    // El enrutador nunca vio el relato ni el contrato en claro.
    expect(network.forwarded.some((body) => body.includes('bodega'))).toBe(false);
    expect(network.forwarded.some((body) => body.includes(DEMO_OCID))).toBe(false);

    const session = startTrackingSession(result.folio, result.words);
    const found = await trackAcrossNetwork(
      directory,
      session.credentials,
      sameOriginRelaySender(client),
    );
    expect(found?.view.folio).toBe(result.folio);
    expect(found?.node.id).toBe('node.federal');
    if (found === null) return;
    expect(verifyTrackingReceipt(found.view, found.keys).isReceiptValid).toBe(true);

    // Un folio o un recibo equivocados no se encuentran en ningún nodo.
    const wrong = startTrackingSession(result.folio, [...result.words].reverse());
    expect(
      await trackAcrossNetwork(directory, wrong.credentials, sameOriginRelaySender(client)),
    ).toBe(null);
  });

  it('turna a otro nodo volviendo a cifrar en el navegador y la persona sigue con sus palabras', async () => {
    const { network, directory } = await setup();
    const receipt = createReceipt();
    const submitted = SubmitComplaintResponseSchema.parse(
      await (
        await submitDirect(network.federal, {
          version: 1,
          mode: 'anonymous',
          facts: {
            stateCode: '22',
            entityId: 'VE-FINANZAS',
            offenseCode: 'LGRA-54',
            occurredPeriod: '2026-04',
            accused: 'La persona titular de Finanzas',
            description: 'Se pagaron viáticos de un viaje que no ocurrió, con facturas repetidas.',
          },
          evidence: [],
          protectionRequested: false,
          reporterKeys: {
            boxPublicKey: toBase64Url(receipt.keys.box.publicKey),
            signingPublicKey: toBase64Url(receipt.keys.signing.publicKey),
          },
          authVerifier: receipt.keys.authVerifier,
        })
      ).json(),
    );
    // El panel de recepción del nodo Federal, en su mismo origen.
    const federalClient = createApiClient((input, init) =>
      Promise.resolve(network.federal.app.request(`http://nodo-federal.invalid${input}`, init)),
    );
    const panelApi = createSigiloApi(federalClient);
    const token = networkToken('federalInboxIntake');
    const detail = await panelApi.getComplaint(token, submitted.folio);
    const result = await transferToOtherNode({
      token,
      keys: authorityKeysOf(network, 'authority.buzon-federal'),
      authorityId: 'authority.buzon-federal',
      detail,
      directory,
      targetAuthorityId: 'authority.comptroller-queretaro',
      note: 'Los hechos son de competencia estatal: la turnamos a la Contraloría de Querétaro.',
      api: panelApi,
      send: sameOriginRelaySender(federalClient),
      solver: inlinePowSolver,
    });
    expect(result.nodeName).toContain('Querétaro');
    // La persona ve el folio nuevo en el nodo de origen y lo sigue con las mismas palabras.
    const session = startTrackingSession(result.folio, receipt.words);
    const found = await trackAcrossNetwork(
      directory,
      session.credentials,
      sameOriginRelaySender(federalClient),
    );
    expect(found?.node.id).toBe('node.queretaro');
    const before = startTrackingSession(submitted.folio, receipt.words);
    const origin = await trackAcrossNetwork(
      directory,
      before.credentials,
      sameOriginRelaySender(federalClient),
    );
    const notes = origin?.view.procedure?.steps.map((step) => step.note ?? '').join(' ') ?? '';
    expect(notes).toContain(result.folio);
  });

  it('pruebas cifradas: el buzón las abre, las re-cifra al turnar, el destino las abre y el origen las borra', async () => {
    const { network, client, directory } = await setup();
    const inboxId = 'authority.buzon-federal';
    const draft = emptyDraft();
    draft.mode = 'anonymous';
    draft.facts = {
      stateCode: '09',
      municipalityCode: '',
      entityId: 'VE-ADUANA',
      offenseCode: 'LGRA-54',
      periodMonth: '04',
      periodYear: '2026',
      accused: 'Servidor Ficticio Cinco',
      description: 'Hechos sintéticos con una foto de prueba cifrada hacia la autoridad.',
    };
    draft.evidence = [cleanPngItem('a')];
    const destination = destinationFor(directory, inboxId);
    const submitted = await submitReport(draft, UNUSED_API, () => undefined, {
      solver: inlinePowSolver,
      network: {
        api: createRelayApi(
          { authorityId: destination.authority.id, node: destination.node },
          sameOriginRelaySender(client),
        ),
        keys: keysForDestination(destination),
        authorityId: destination.authority.id,
        authorityName: destination.authority.name,
        nodeName: destination.node.name,
      },
    });
    // El enrutador y el nodo solo vieron el contenedor cifrado.
    const plain = toBase64Url(new Uint8Array(400).fill(3).subarray(0, 300));
    expect(network.forwarded.some((body) => body.includes(plain.slice(20, 80)))).toBe(false);

    const federalClient = createApiClient((input, init) =>
      Promise.resolve(network.federal.app.request(`http://nodo-federal.invalid${input}`, init)),
    );
    const panelApi = createSigiloApi(federalClient);
    const token = networkToken('federalInboxIntake');
    const inboxKeys = authorityKeysOf(network, inboxId);
    const detail = await panelApi.getComplaint(token, submitted.folio);
    const [descriptor] = detail.evidence;
    if (descriptor === undefined) throw new Error('Sin prueba.');
    const container = new Uint8Array(
      await (await panelApi.getEvidence(token, descriptor.evidenceId)).arrayBuffer(),
    );
    const opened = await openForAuthority(container, descriptor, detail, inboxKeys, inboxId);
    expect(opened.matchesAnchor).toBe(true);
    expect(opened.plaintext.subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(
      await verifyEvidenceAnchor(
        detail,
        (from, limit) => panelApi.getLedgerEvents(from, limit),
        keysForDestination(destination),
      ),
    ).toBe('pending');

    const result = await transferToOtherNode({
      token,
      keys: inboxKeys,
      authorityId: inboxId,
      detail,
      directory,
      targetAuthorityId: 'authority.comptroller-queretaro',
      note: 'Los hechos son de competencia estatal: la turnamos a la Contraloría de Querétaro.',
      api: panelApi,
      send: sameOriginRelaySender(federalClient),
      solver: inlinePowSolver,
    });
    // Custodia entregada: el origen ya no guarda la prueba.
    expect(network.federal.server.evidenceStore.read(descriptor.evidenceId)).toBeNull();
    expect(
      network.federal.ctx.evidence.listCustodyEvents(submitted.folio).map((event) => event.type),
    ).toEqual(['evidence.received', 'evidence.custody_transferred']);

    // La Contraloría de Querétaro abre la copia re-cifrada con su llave; el compromiso es el mismo.
    const queretaroApi = createSigiloApi(
      createApiClient((input, init) =>
        Promise.resolve(
          network.queretaro.app.request(`http://nodo-queretaro.invalid${input}`, init),
        ),
      ),
    );
    const there = await queretaroApi.getComplaint(networkToken('queretaroIntake'), result.folio);
    const [copy] = there.evidence;
    if (copy === undefined) throw new Error('Sin prueba en el destino.');
    const copyContainer = new Uint8Array(
      await (
        await queretaroApi.getEvidence(networkToken('queretaroIntake'), copy.evidenceId)
      ).arrayBuffer(),
    );
    const reopened = await openForAuthority(
      copyContainer,
      copy,
      there,
      authorityKeysOf(network, 'authority.comptroller-queretaro'),
      'authority.comptroller-queretaro',
    );
    expect(reopened.plaintext).toEqual(opened.plaintext);
    expect(reopened.commitment).toBe(opened.commitment);
    expect(reopened.matchesAnchor).toBe(true);
  });

  it('nodo caído: la denuncia queda en la cola, se entrega al volver y se sigue con folio y palabras', async () => {
    const { network, client, directory } = await setup();
    network.setNodeDown('node.federal', true);
    const draft = emptyDraft();
    draft.mode = 'anonymous';
    draft.facts = {
      stateCode: '22',
      municipalityCode: '',
      entityId: 'VE-INSTITUTO',
      offenseCode: 'LGRA-59',
      periodMonth: '05',
      periodYear: '2026',
      accused: 'Servidor Ficticio Cuatro',
      description: 'Hechos sintéticos enviados mientras el nodo de destino no respondía.',
    };
    const destination = destinationFor(directory, 'authority.oic-iffe');
    const relayApi = createRelayApi(
      { authorityId: destination.authority.id, node: destination.node },
      sameOriginRelaySender(client),
      {
        getChallenge: sameOriginQueueChallenge(client),
        operator: {
          keyId: directory.operator.signingKeyId,
          signingPublicKey: directory.operator.signingPublicKey,
        },
      },
    );
    const messages: string[] = [];
    const result = await submitReport(draft, UNUSED_API, (message) => messages.push(message), {
      solver: inlinePowSolver,
      network: {
        api: relayApi,
        keys: keysForDestination(destination),
        authorityId: destination.authority.id,
        authorityName: destination.authority.name,
        nodeName: destination.node.name,
      },
    });
    expect(result.queued?.expiresOn).toBe('2026-11-16');
    expect(messages.join(' ')).toContain('cola de entrega');
    expect(network.federal.ctx.complaints.find(result.folio)).toBeNull();
    // Lo que guardó el enrutador va cerrado: ni los hechos ni la autoridad.
    expect(network.forwarded.some((body) => body.includes('Servidor Ficticio Cuatro'))).toBe(false);

    // El nodo vuelve; en la siguiente vuelta de la cola se entrega con el folio que eligió la web.
    network.setNodeDown('node.federal', false);
    network.setNow(new Date(network.federal.ctx.deps.now().getTime() + 60_000));
    expect(await network.queue.deliverDue()).toMatchObject({ delivered: 1 });
    const stored = network.federal.ctx.complaints.find(result.folio);
    expect(stored?.assignedAuthorityId).toBe('authority.oic-iffe');

    const session = startTrackingSession(result.folio, result.words);
    const found = await trackAcrossNetwork(
      directory,
      session.credentials,
      sameOriginRelaySender(client),
    );
    expect(found?.node.id).toBe('node.federal');
    if (found === null) return;
    expect(verifyTrackingReceipt(found.view, found.keys).isReceiptValid).toBe(true);
  });
});
