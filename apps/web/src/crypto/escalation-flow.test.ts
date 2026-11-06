// Pruebas de la segunda llave en la web: el sobre de escalamiento se cifra hacia la supervisora
// fijada, sin la identidad, entra al digesto del envío y su llave se compara con la publicada.
import { describe, expect, it } from 'vitest';
import {
  buildPublicKeySet,
  computeSubmissionDigest,
  generateBoxKeyPair,
  generateSigningKeyPair,
  openEscalation,
  submissionDigestFromEscalation,
  toBase64Url,
} from '@sigilo/core';
import { parsePinnedKeys } from '../config/pinned-keys.ts';
import { diffPublicKeys } from './key-pinning.ts';
import { buildSubmitRequest, createReceipt, sealReporterEscalation } from './submission.ts';
import type { SubmissionInput } from './submission.ts';
import { createTestDeployment } from './test-keys.ts';

const INPUT: SubmissionInput = {
  mode: 'anonymous',
  facts: {
    stateCode: '22',
    entityId: 'VE-OBRAS',
    offenseCode: 'LGRA-59',
    occurredPeriod: '2026-03',
    accused: 'Titular ficticio del área de compras',
    description: 'Hechos sintéticos: una adjudicación directa justificada como urgente.',
  },
  evidence: [],
  protectionRequested: false,
};

function deploymentWithSupervisor() {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const supervisor = generateBoxKeyPair();
  const pinned = parsePinnedKeys(
    buildPublicKeySet({
      serverSigningPublicKey: server.publicKey,
      authorityBoxPublicKey: authorityBox.publicKey,
      authoritySigningPublicKey: authoritySigning.publicKey,
      supervisorBoxPublicKey: supervisor.publicKey,
    }),
  );
  return { pinned, supervisor };
}

describe('segunda llave', () => {
  it('se cifra hacia la supervisora fijada y entra al digesto del envío', async () => {
    const { pinned, supervisor } = deploymentWithSupervisor();
    const receipt = createReceipt();
    const envelope = await sealReporterEscalation(INPUT, receipt.keys, pinned);
    if (envelope === undefined) throw new Error('Falta el sobre.');
    expect(envelope.keyId).toBe(pinned.set.supervisor?.keyId);
    const request = buildSubmitRequest(INPUT, receipt.keys, undefined, envelope);
    const context = {
      authVerifier: request.authVerifier,
      reporterKeys: request.reporterKeys,
    };
    const content = await openEscalation(envelope, supervisor.privateKey, context);
    expect(content.facts).toEqual(request.facts);
    expect(
      submissionDigestFromEscalation(content, { ...context, escalationEnvelope: envelope }),
    ).toBe(computeSubmissionDigest(request));
  });

  it('sin supervisora fijada no se envía sobre de escalamiento', () => {
    const { pinned } = createTestDeployment();
    expect(sealReporterEscalation(INPUT, createReceipt().keys, pinned)).toBeUndefined();
  });

  it('una llave de supervisora sustituida por el servidor detiene el envío', () => {
    const { pinned } = deploymentWithSupervisor();
    const served = {
      ...pinned.set,
      supervisor: {
        keyId: pinned.set.supervisor?.keyId ?? '',
        boxPublicKey: toBase64Url(generateBoxKeyPair().publicKey),
      },
    };
    expect(diffPublicKeys(pinned.set, served)).toEqual(['supervisor.boxPublicKey']);
  });
});
