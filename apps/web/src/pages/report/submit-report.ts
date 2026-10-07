// Envío de la denuncia: llaves fijadas, subida de pruebas limpias, recibo, sellado y comprobante.
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { assertServedKeysMatch } from '../../crypto/key-pinning.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  sealReporterIdentity,
  verifySubmission,
} from '../../crypto/submission.ts';
import type { SigiloApi } from '../../services/api.ts';
import type { ReportDraft } from '../../state/report-draft.ts';
import { toComplaintFacts, witnessLines } from '../../state/report-validation.ts';

/** Resultado de un envío exitoso. */
export interface SubmittedReport {
  folio: string;
  words: string[];
  receivedOn: string;
}

/** Error cuando el comprobante no verifica: la denuncia pudo llegar, pero no hay prueba firmada. */
export class ReceiptVerificationError extends Error {
  readonly folio: string;
  readonly words: string[];

  constructor(folio: string, words: string[]) {
    super('El comprobante del servidor no es válido.');
    this.name = 'ReceiptVerificationError';
    this.folio = folio;
    this.words = words;
  }
}

/**
 * Ejecuta el envío completo e informa cada etapa con `onProgress`.
 * Seguridad: lo primero es comparar las llaves publicadas con las fijadas; si difieren no se
 * sube ni se cifra nada. El cifrado usa siempre las llaves fijadas.
 */
export async function submitReport(
  draft: ReportDraft,
  api: SigiloApi,
  onProgress: (message: string) => void,
): Promise<SubmittedReport> {
  const facts = toComplaintFacts(draft);
  if (facts === null || draft.mode === null) throw new Error('Faltan datos de la denuncia.');

  onProgress('Comprobando las llaves de seguridad del servidor.');
  await assertServedKeysMatch(() => api.getKeys(), PINNED_KEYS.set);

  const images = draft.evidence.flatMap((item) => item.clean);
  const evidence: EvidenceDescriptor[] = [];
  for (const [index, image] of images.entries()) {
    onProgress(`Subiendo pruebas limpias: ${index + 1} de ${images.length}.`);
    const mediaType = image.blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    evidence.push(await api.uploadEvidence(image.blob, mediaType));
  }

  onProgress('Generando tu recibo.');
  const receipt = createReceipt();

  let sealedIdentity;
  if (draft.mode === 'sealed') {
    onProgress('Cifrando tu identidad: solo la autoridad competente podrá abrirla.');
    const digests = draft.evidence.flatMap((item) =>
      item.originalSha256 === undefined ? [] : [item.originalSha256],
    );
    const block = buildIdentityBlock(
      {
        fullName: draft.identity.fullName,
        contact: draft.identity.contact,
        witnesses: witnessLines(draft.identity.witnesses),
      },
      digests,
    );
    sealedIdentity = await sealReporterIdentity(block, receipt.keys, PINNED_KEYS);
  }

  const request = buildSubmitRequest(
    { mode: draft.mode, facts, evidence, protectionRequested: draft.protectionRequested },
    receipt.keys,
    sealedIdentity,
  );

  onProgress('Enviando tu denuncia.');
  const response = await api.submitComplaint(request);

  onProgress('Verificando el comprobante firmado.');
  if (!verifySubmission(request, response, PINNED_KEYS)) {
    throw new ReceiptVerificationError(response.folio, receipt.words);
  }
  return { folio: response.folio, words: receipt.words, receivedOn: response.receipt.receivedOn };
}
