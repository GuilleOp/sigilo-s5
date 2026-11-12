// Concurrencia del turnado a otro nodo: dos turnados simultáneos de la misma denuncia, un segundo
// turnado mientras el primero espera su comprobante y un comprobante entregado dos veces.
import { describe, expect, it } from 'vitest';
import {
  ROUTES,
  SubmitComplaintResponseSchema,
  TransferComplaintResponseSchema,
} from '@sigilo/contracts';
import type { SubmitComplaintRequest } from '@sigilo/contracts';
import { deriveReceiptKeys, generateReceiptPhrase, toBase64Url } from '@sigilo/core';
import { openRoutedReply } from '@sigilo/red';
import {
  createTestNetwork,
  networkToken,
  sealedRelay,
  submitDirect,
} from './test-support/network-harness.ts';
import type { TestNetwork, TestNode } from './test-support/network-harness.ts';

const QUERETARO = 'authority.comptroller-queretaro';
const QUERETARO_INBOX = 'authority.buzon-queretaro';

function postAs(node: TestNode, path: string, body: unknown) {
  return node.app.request(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${networkToken('federalInboxIntake')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/** Denuncia anónima directa al nodo Federal, que llega a su buzón general. */
async function submitted(network: TestNetwork) {
  const keys = deriveReceiptKeys(generateReceiptPhrase().entropy);
  const request: SubmitComplaintRequest = {
    version: 1,
    mode: 'anonymous',
    facts: {
      stateCode: '22',
      entityId: 'VE-INSTITUTO',
      offenseCode: 'LGRA-59',
      occurredPeriod: '2026-03',
      accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
      description:
        'Narrativa sintética de prueba: se describen hechos ficticios con detalle suficiente.',
    },
    evidence: [],
    protectionRequested: false,
    reporterKeys: {
      boxPublicKey: toBase64Url(keys.box.publicKey),
      signingPublicKey: toBase64Url(keys.signing.publicKey),
    },
    authVerifier: keys.authVerifier,
  };
  const response = await submitDirect(network.federal, request);
  const { folio } = SubmitComplaintResponseSchema.parse(await response.json());
  return { folio, request };
}

async function transferTo(network: TestNetwork, folio: string, request: unknown, to: string) {
  const sealed = await sealedRelay(network, to, { operationId: 'submitComplaint', body: request });
  const response = await postAs(network.federal, ROUTES.authorityTransfer(folio), {
    toAuthorityId: to,
    relay: sealed.relay,
    note: 'Turnado sintético de prueba por competencia estatal.',
  });
  return { response, sealed, to };
}

async function setup() {
  const network = createTestNetwork();
  await network.federal.tasks.run();
  await network.queretaro.tasks.run();
  return { network, ...(await submitted(network)) };
}

describe('turnado a otro nodo con peticiones concurrentes', () => {
  it('dos turnados simultáneos de la misma denuncia: solo uno sale al enrutador', async () => {
    const { network, folio, request } = await setup();
    const relayed = network.forwarded.length;
    const results = await Promise.all([
      transferTo(network, folio, request, QUERETARO),
      transferTo(network, folio, request, QUERETARO_INBOX),
    ]);
    const statuses = results.map((result) => result.response.status).sort();
    expect(statuses).toEqual([200, 409]);
    // Solo un sobre llegó al nodo destino y solo un turnado quedó registrado.
    expect(network.forwarded.length - relayed).toBe(1);
    expect(network.federal.ctx.integration.listTransfers(folio)).toHaveLength(1);
  });

  it('mientras un turnado espera su comprobante no se manda otro', async () => {
    const { network, folio, request } = await setup();
    const first = await transferTo(network, folio, request, QUERETARO);
    expect(first.response.status).toBe(200);
    const second = await transferTo(network, folio, request, QUERETARO_INBOX);
    expect(second.response.status).toBe(409);
    expect(network.federal.ctx.integration.listTransfers(folio)).toHaveLength(1);
  });

  it('el comprobante se acepta una sola vez, aunque lleguen dos a la vez', async () => {
    const { network, folio, request } = await setup();
    const { response, sealed } = await transferTo(network, folio, request, QUERETARO);
    const { relay, transferId } = TransferComplaintResponseSchema.parse(await response.json());
    const reply = await openRoutedReply(relay, sealed.replyPrivateKey, QUERETARO);
    if (reply.body.kind !== 'json') throw new Error('Respuesta sin cuerpo.');
    const there = SubmitComplaintResponseSchema.parse(reply.body.value);
    const body = { transferId, receipt: there.receipt, request };
    const confirmations = await Promise.all([
      postAs(network.federal, ROUTES.authorityTransferReceipt(folio), body),
      postAs(network.federal, ROUTES.authorityTransferReceipt(folio), body),
    ]);
    // La segunda ya no encuentra la denuncia como propia (la competencia se cedió) o choca.
    const statuses = confirmations.map((item) => item.status).sort();
    expect(statuses[0]).toBe(204);
    expect([404, 409]).toContain(statuses[1]);
    const steps = network.federal.ctx.procedure.listSteps(folio);
    expect(steps.filter((step) => step.action === 'transferred')).toHaveLength(1);
  });
});
