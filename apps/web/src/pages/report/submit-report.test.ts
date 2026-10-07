// Pruebas del envío: bloqueo por llaves sustituidas, prueba de trabajo, reintentos sin volver a
// subir pruebas (salvo si el servidor las rechaza), descriptores comprobados contra la copia local,
// identidad ligada al contenido y fallo cerrado ante pruebas sin verificar.
import { describe, expect, it, vi } from 'vitest';
import type {
  EvidenceDescriptor,
  PublicKeySet,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import {
  computeSubmissionDigest,
  isPowSolution,
  parsePowHeader,
  receivedPayloadDigest,
  signReceipt,
} from '@sigilo/core';
import { digestBlob } from '@sigilo/huella';
import { KeyMismatchError } from '../../crypto/key-pinning.ts';
import { inlinePowSolver } from '../../crypto/proof-of-work.ts';
import { createTestDeployment } from '../../crypto/test-keys.ts';
import type { TestDeployment } from '../../crypto/test-keys.ts';
import type { SigiloApi } from '../../services/api.ts';
import { ApiRequestError } from '../../services/api-client.ts';
import { emptyDraft } from '../../state/report-draft.ts';
import type { EvidenceItem, ReportDraft } from '../../state/report-draft.ts';
import {
  EvidenceMismatchError,
  ReceiptVerificationError,
  SubmissionBlockedError,
  submitReport,
} from './submit-report.ts';
import type { UploadCache } from './submit-report.ts';

function cleanItem(id: string, isVerified = true): EvidenceItem {
  return {
    id,
    fileName: `foto-${id}.jpg`,
    kind: 'image',
    original: new Blob(['original']),
    originalSha256: id.repeat(64).slice(0, 64),
    status: 'clean',
    clean: [{ id: `${id}-limpia`, blob: new Blob([id], { type: 'image/jpeg' }), url: 'blob:x' }],
    cleanVerified: isVerified,
  };
}

function filledDraft(mode: 'anonymous' | 'sealed' = 'anonymous'): ReportDraft {
  const draft = emptyDraft();
  draft.mode = mode;
  draft.identity.fullName = 'Persona Denunciante Ficticia';
  draft.facts = {
    stateCode: '22',
    municipalityCode: '',
    entityId: 'VE-OBRAS',
    offenseCode: 'LGRA-52',
    periodMonth: '03',
    periodYear: '2026',
    accused: 'Servidor\u200b Ficticio Dos',
    description: 'Adjudicación directa irregular de un contrato\u2060 sintético de obra.',
  };
  draft.evidence = [cleanItem('a'), cleanItem('b')];
  return draft;
}

const POW_BITS = 4;

/**
 * API falsa: emite retos de prueba de trabajo, devuelve descriptores fieles a la copia subida y
 * firma el comprobante con la llave sintética del servidor.
 */
function fakeApi(deployment: TestDeployment, served: PublicKeySet = deployment.pinned.set) {
  let uploads = 0;
  let challenges = 0;
  const submitted: SubmitComplaintRequest[] = [];
  const proofs: string[] = [];
  const api = {
    getKeys: vi.fn(async () => served),
    getPowChallenge: vi.fn(async (purpose: string) => {
      challenges += 1;
      return { token: `reto-${purpose}-${challenges}.firma`, bits: POW_BITS };
    }),
    uploadEvidence: vi.fn(
      async (blob: Blob, mediaType: string, proof: string): Promise<EvidenceDescriptor> => {
        proofs.push(proof);
        uploads += 1;
        return {
          evidenceId: String(uploads).padStart(32, '0'),
          mediaType: mediaType === 'image/png' ? 'image/png' : 'image/jpeg',
          sha256: await digestBlob(blob),
          sizeBytes: blob.size,
        };
      },
    ),
    submitComplaint: vi.fn(async (request: SubmitComplaintRequest, proof: string) => {
      proofs.push(proof);
      submitted.push(request);
      const submissionDigest = computeSubmissionDigest(request);
      const response: SubmitComplaintResponse = {
        folio: 'ABCD-EFGH-JKMN',
        receipt: signReceipt(
          {
            folio: 'ABCD-EFGH-JKMN',
            submissionDigest,
            receivedOn: '2026-10-07',
            payloadDigest: receivedPayloadDigest('ABCD-EFGH-JKMN', submissionDigest),
            serverKeyId: deployment.pinned.set.server.keyId,
          },
          deployment.server.privateKey,
        ),
      };
      return response;
    }),
  };
  return { api, submitted, proofs, sigilo: api as unknown as SigiloApi };
}

const noProgress = (): void => undefined;

describe('submitReport', () => {
  it('no sube ni envía nada si las llaves publicadas no coinciden con las fijadas', async () => {
    const deployment = createTestDeployment();
    const impostor = createTestDeployment().pinned.set;
    const { api, sigilo } = fakeApi(deployment, {
      ...deployment.pinned.set,
      authority: impostor.authority,
    });
    await expect(
      submitReport(filledDraft('sealed'), sigilo, noProgress, {
        pinned: deployment.pinned,
        solver: inlinePowSolver,
        uploads: new WeakMap(),
      }),
    ).rejects.toBeInstanceOf(KeyMismatchError);
    expect(api.uploadEvidence).not.toHaveBeenCalled();
    expect(api.submitComplaint).not.toHaveBeenCalled();
  });

  it('en un reintento reutiliza los descriptores de las pruebas ya subidas', async () => {
    const deployment = createTestDeployment();
    const { api, submitted, sigilo } = fakeApi(deployment);
    api.submitComplaint.mockRejectedValueOnce(new ApiRequestError('network', 0));
    const draft = filledDraft();
    const uploads: UploadCache = new WeakMap();
    const options = { pinned: deployment.pinned, solver: inlinePowSolver, uploads };

    await expect(submitReport(draft, sigilo, noProgress, options)).rejects.toMatchObject({
      code: 'network',
    });
    expect(api.uploadEvidence).toHaveBeenCalledTimes(2);

    const result = await submitReport(draft, sigilo, noProgress, options);
    expect(api.uploadEvidence).toHaveBeenCalledTimes(2);
    expect(result.folio).toBe('ABCD-EFGH-JKMN');
    expect(submitted.at(-1)?.evidence.map((item) => item.evidenceId)).toEqual([
      '0'.repeat(31) + '1',
      '0'.repeat(31) + '2',
    ]);
  });

  it('resuelve una prueba de trabajo distinta para cada subida y para el envío', async () => {
    const deployment = createTestDeployment();
    const { api, proofs, sigilo } = fakeApi(deployment);
    const progress: string[] = [];
    await submitReport(filledDraft(), sigilo, (message) => progress.push(message), {
      pinned: deployment.pinned,
      solver: inlinePowSolver,
      uploads: new WeakMap(),
    });
    expect(api.getPowChallenge.mock.calls.map(([purpose]) => purpose)).toEqual([
      'evidence',
      'evidence',
      'complaint',
    ]);
    expect(new Set(proofs).size).toBe(3);
    for (const proof of proofs) {
      const parsed = parsePowHeader(proof);
      expect(parsed !== null && isPowSolution(parsed.token, parsed.counter, POW_BITS)).toBe(true);
    }
    expect(progress).toContain(
      'Protegiendo tu envío contra envíos automáticos. Puede tardar unos segundos.',
    );
  });

  it('aborta si el descriptor devuelto no corresponde a la copia limpia', async () => {
    for (const forge of [
      (descriptor: EvidenceDescriptor) => ({ ...descriptor, sha256: 'f'.repeat(64) }),
      (descriptor: EvidenceDescriptor) => ({ ...descriptor, sizeBytes: descriptor.sizeBytes + 1 }),
      (descriptor: EvidenceDescriptor): EvidenceDescriptor => ({
        ...descriptor,
        mediaType: 'image/png',
      }),
    ]) {
      const deployment = createTestDeployment();
      const { api, sigilo } = fakeApi(deployment);
      const honest = api.uploadEvidence.getMockImplementation();
      api.uploadEvidence.mockImplementationOnce(async (blob, mediaType, proof) => {
        if (honest === undefined) throw new Error('Falta la implementación.');
        return forge(await honest(blob, mediaType, proof));
      });
      const uploads: UploadCache = new WeakMap();
      const draft = filledDraft();
      await expect(
        submitReport(draft, sigilo, noProgress, {
          pinned: deployment.pinned,
          solver: inlinePowSolver,
          uploads,
        }),
      ).rejects.toBeInstanceOf(EvidenceMismatchError);
      expect(api.submitComplaint).not.toHaveBeenCalled();
      // La prueba alterada no queda en la caché de reintentos.
      expect(uploads.has(draft.evidence[0]?.clean[0]?.blob ?? new Blob())).toBe(false);
    }
  });

  it('vacía la caché de reintentos si el servidor rechaza los descriptores', async () => {
    for (const code of ['bad_request', 'not_found'] as const) {
      const deployment = createTestDeployment();
      const { api, sigilo } = fakeApi(deployment);
      api.submitComplaint.mockRejectedValueOnce(new ApiRequestError(code, 400));
      const draft = filledDraft();
      const options = {
        pinned: deployment.pinned,
        solver: inlinePowSolver,
        uploads: new WeakMap() as UploadCache,
      };
      await expect(submitReport(draft, sigilo, noProgress, options)).rejects.toMatchObject({
        code,
      });
      await submitReport(draft, sigilo, noProgress, options);
      expect(api.uploadEvidence).toHaveBeenCalledTimes(4);
    }
  });

  it('envía los hechos sin caracteres invisibles y verifica el comprobante', async () => {
    const deployment = createTestDeployment();
    const { submitted, sigilo } = fakeApi(deployment);
    const result = await submitReport(filledDraft('sealed'), sigilo, noProgress, {
      pinned: deployment.pinned,
      solver: inlinePowSolver,
      uploads: new WeakMap(),
    });
    expect(result.words).toHaveLength(8);
    const request = submitted[0];
    expect(request?.facts.accused).toBe('Servidor Ficticio Dos');
    expect(request?.facts.description).not.toMatch(/[\u200b\u2060]/u);
    expect(request?.sealedIdentity?.keyId).toBe(deployment.pinned.set.authority.keyId);
    expect(request?.protectionRequested).toBe(false);
  });

  it('marca el comprobante como no verificado si no lo firmó la llave fijada', async () => {
    const deployment = createTestDeployment();
    const { sigilo } = fakeApi(createTestDeployment(), deployment.pinned.set);
    await expect(
      submitReport(filledDraft(), sigilo, noProgress, {
        pinned: deployment.pinned,
        solver: inlinePowSolver,
        uploads: new WeakMap(),
      }),
    ).rejects.toBeInstanceOf(ReceiptVerificationError);
  });

  it('no sube nada si alguna prueba no está limpia y verificada', async () => {
    const deployment = createTestDeployment();
    const { api, sigilo } = fakeApi(deployment);
    const draft = filledDraft();
    draft.evidence = [cleanItem('a'), cleanItem('b', false)];
    await expect(
      submitReport(draft, sigilo, noProgress, {
        pinned: deployment.pinned,
        solver: inlinePowSolver,
      }),
    ).rejects.toBeInstanceOf(SubmissionBlockedError);
    expect(api.getKeys).not.toHaveBeenCalled();
    expect(api.uploadEvidence).not.toHaveBeenCalled();
  });

  it('no sube nada si la identidad no cabe en el sobre', async () => {
    const deployment = createTestDeployment();
    const { api, sigilo } = fakeApi(deployment);
    const draft = filledDraft('sealed');
    draft.identity.witnesses = Array.from({ length: 10 }, () => 'á'.repeat(500)).join('\n');
    await expect(
      submitReport(draft, sigilo, noProgress, {
        pinned: deployment.pinned,
        solver: inlinePowSolver,
      }),
    ).rejects.toBeInstanceOf(SubmissionBlockedError);
    expect(api.uploadEvidence).not.toHaveBeenCalled();
    expect(api.submitComplaint).not.toHaveBeenCalled();
  });
});
