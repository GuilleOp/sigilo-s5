// Envío de la denuncia: llaves fijadas, subida de pruebas limpias, recibo, sellado y comprobante.
import { IDENTITY_PADDED_SIZE } from '@sigilo/core';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import type { PinnedKeys } from '../../config/pinned-keys.ts';
import { assertServedKeysMatch } from '../../crypto/key-pinning.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  identityBlockSize,
  normalizeSubmissionInput,
  sealReporterIdentity,
  verifySubmission,
} from '../../crypto/submission.ts';
import type { SigiloApi } from '../../services/api.ts';
import type { ReportDraft } from '../../state/report-draft.ts';
import { identityInputOf, toComplaintFacts } from '../../state/report-validation.ts';

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

/** Error previo a subir nada: el borrador todavía no se puede enviar. El mensaje es para mostrarse. */
export class SubmissionBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionBlockedError';
  }
}

/** Descriptores de las pruebas ya subidas, por copia limpia, para no volver a subirlas. */
export type UploadCache = WeakMap<Blob, EvidenceDescriptor>;

/** Opciones del envío; por omisión, las llaves fijadas del bundle y la caché del módulo. */
export interface SubmitOptions {
  pinned?: PinnedKeys;
  uploads?: UploadCache;
}

/**
 * Caché de subidas de esta pestaña. Las llaves son las copias limpias del borrador: al vaciarse
 * el borrador (envío exitoso o salida rápida) dejan de existir y sus entradas también.
 */
const DEFAULT_UPLOADS: UploadCache = new WeakMap();

/**
 * Ejecuta el envío completo e informa cada etapa con `onProgress`.
 * Seguridad: lo primero es comparar las llaves publicadas con las fijadas; si difieren no se
 * sube ni se cifra nada. El cifrado usa siempre las llaves fijadas. Solo se suben copias limpias
 * ya verificadas, y en un reintento se reutilizan los descriptores de las que ya se subieron.
 */
export async function submitReport(
  draft: ReportDraft,
  api: SigiloApi,
  onProgress: (message: string) => void,
  options: SubmitOptions = {},
): Promise<SubmittedReport> {
  const pinned = options.pinned ?? PINNED_KEYS;
  const uploads = options.uploads ?? DEFAULT_UPLOADS;
  const facts = toComplaintFacts(draft);
  if (facts === null || draft.mode === null) {
    throw new SubmissionBlockedError('Faltan datos de la denuncia. Revisa los pasos anteriores.');
  }
  // Seguridad: nada sin limpiar y comprobar puede subirse (falla cerrado).
  if (draft.evidence.some((item) => item.status !== 'clean' || item.cleanVerified !== true)) {
    throw new SubmissionBlockedError(
      'Hay pruebas sin limpiar. Regresa al paso de pruebas y límpialas o quítalas.',
    );
  }

  onProgress('Comprobando que la conexión es segura.');
  await assertServedKeysMatch(() => api.getKeys(), pinned.set);

  const block =
    draft.mode === 'sealed'
      ? buildIdentityBlock(
          identityInputOf(draft),
          draft.evidence.flatMap((item) =>
            item.originalSha256 === undefined ? [] : [item.originalSha256],
          ),
        )
      : undefined;
  if (block !== undefined && identityBlockSize(block) > IDENTITY_PADDED_SIZE) {
    throw new SubmissionBlockedError(
      'Tus datos son demasiado largos para guardarlos bajo llave. Regresa al primer paso y acorta los testigos.',
    );
  }

  const images = draft.evidence.flatMap((item) => item.clean);
  const evidence: EvidenceDescriptor[] = [];
  for (const [index, image] of images.entries()) {
    const known = uploads.get(image.blob);
    if (known !== undefined) {
      evidence.push(known);
      continue;
    }
    onProgress(`Enviando tus pruebas limpias: ${index + 1} de ${images.length}.`);
    const mediaType = image.blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const descriptor = await api.uploadEvidence(image.blob, mediaType);
    uploads.set(image.blob, descriptor);
    evidence.push(descriptor);
  }

  onProgress('Preparando tus 8 palabras.');
  const receipt = createReceipt();
  // Mismos hechos y descriptores, ya validados, para el sello de la identidad y la solicitud.
  const input = normalizeSubmissionInput({
    mode: draft.mode,
    facts,
    evidence,
    protectionRequested: draft.protectionRequested,
  });

  let sealedIdentity;
  if (block !== undefined) {
    onProgress('Guardando tu nombre bajo llave: solo la autoridad podrá abrirlo.');
    sealedIdentity = await sealReporterIdentity(block, input, receipt.keys, pinned);
  }

  const request = buildSubmitRequest(input, receipt.keys, sealedIdentity);

  onProgress('Enviando tu denuncia.');
  const response = await api.submitComplaint(request);

  onProgress('Comprobando que tu denuncia llegó completa.');
  if (!verifySubmission(request, response, pinned)) {
    throw new ReceiptVerificationError(response.folio, receipt.words);
  }
  return { folio: response.folio, words: receipt.words, receivedOn: response.receipt.receivedOn };
}
