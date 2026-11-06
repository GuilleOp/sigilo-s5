// Recorrido de la ventanilla única de la web contra la red en memoria (enrutador ciego real, nodos
// Federal y Querétaro, evaluador e índice): directorio del mismo origen verificado con la raíz
// fijada, propuesta de la autoridad, envío cifrado por el enrutador con corroboración ciega y
// seguimiento con las mismas 8 palabras, buscando el folio en todos los nodos; y el turnado entre
// nodos que vuelve a cifrar en el navegador de recepción (SEC-19).
import { describe, expect, it } from 'vitest';
import { evaluatorKeyFromDirectory } from '@sigilo/corroboracion';
import { DEMO_OCID, demoCase } from '@sigilo/corroboracion/demo';
import {
  createTestNetwork,
  networkToken,
  submitDirect,
} from '../../../server/src/test-support/network-harness.ts';
import { createReceipt } from '../crypto/submission.ts';
import { transferToOtherNode } from '../pages/authority/transfer.ts';
import { createSigiloApi } from '../services/api.ts';
import { toBase64Url } from '@sigilo/core';
import { SubmitComplaintResponseSchema } from '@sigilo/contracts';
import { corroborateBlindly } from '../corroboration/blind-corroboration.ts';
import { inlinePowSolver } from '../crypto/proof-of-work.ts';
import { startTrackingSession, verifyTrackingReceipt } from '../crypto/tracking.ts';
import { submitReport } from '../pages/report/submit-report.ts';
import type { SigiloApi } from '../services/api.ts';
import { createApiClient } from '../services/api-client.ts';
import { emptyDraft } from '../state/report-draft.ts';
import { loadNetworkState } from './directory.ts';
import { destinationFor, keysForDestination } from './network-keys.ts';
import { trackAcrossNetwork } from './network-tracking.ts';
import { createRelayApi, sameOriginRelaySender } from './relay-api.ts';
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
});
