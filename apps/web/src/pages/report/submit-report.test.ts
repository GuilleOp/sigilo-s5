// Pruebas del envío: bloqueo por llaves sustituidas, reintentos sin volver a subir pruebas,
// identidad ligada al contenido y fallo cerrado ante pruebas sin verificar.
import { describe, expect, it, vi } from 'vitest';
import type {
  EvidenceDescriptor,
  PublicKeySet,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import { computeSubmissionDigest, signReceipt } from '@sigilo/core';
import { KeyMismatchError } from '../../crypto/key-pinning.ts';
import { createTestDeployment } from '../../crypto/test-keys.ts';
import type { TestDeployment } from '../../crypto/test-keys.ts';
import type { SigiloApi } from '../../services/api.ts';
import { ApiRequestError } from '../../services/api-client.ts';
import { emptyDraft } from '../../state/report-draft.ts';
import type { EvidenceItem, ReportDraft } from '../../state/report-draft.ts';
import { ReceiptVerificationError, SubmissionBlockedError, submitReport } from './submit-report.ts';
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

/** API falsa: firma el comprobante con la llave sintética del servidor. */
function fakeApi(deployment: TestDeployment, served: PublicKeySet = deployment.pinned.set) {
  let uploads = 0;
  const submitted: SubmitComplaintRequest[] = [];
  const api = {
    getKeys: vi.fn(async () => served),
    uploadEvidence: vi.fn(async (blob: Blob): Promise<EvidenceDescriptor> => {
      uploads += 1;
      return {
        evidenceId: String(uploads).padStart(32, '0'),
        mediaType: 'image/jpeg',
        sha256: 'c'.repeat(64),
        sizeBytes: blob.size,
      };
    }),
    submitComplaint: vi.fn(async (request: SubmitComplaintRequest) => {
      submitted.push(request);
      const response: SubmitComplaintResponse = {
        folio: 'ABCD-EFGH-JKMN',
        receipt: signReceipt(
          {
            folio: 'ABCD-EFGH-JKMN',
            submissionDigest: computeSubmissionDigest(request),
            receivedOn: '2026-10-07',
            ledgerSeq: 3,
            serverKeyId: deployment.pinned.set.server.keyId,
          },
          deployment.server.privateKey,
        ),
      };
      return response;
    }),
  };
  return { api, submitted, sigilo: api as unknown as SigiloApi };
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
    const options = { pinned: deployment.pinned, uploads };

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

  it('envía los hechos sin caracteres invisibles y verifica el comprobante', async () => {
    const deployment = createTestDeployment();
    const { submitted, sigilo } = fakeApi(deployment);
    const result = await submitReport(filledDraft('sealed'), sigilo, noProgress, {
      pinned: deployment.pinned,
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
      submitReport(draft, sigilo, noProgress, { pinned: deployment.pinned }),
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
      submitReport(draft, sigilo, noProgress, { pinned: deployment.pinned }),
    ).rejects.toBeInstanceOf(SubmissionBlockedError);
    expect(api.uploadEvidence).not.toHaveBeenCalled();
    expect(api.submitComplaint).not.toHaveBeenCalled();
  });
});
