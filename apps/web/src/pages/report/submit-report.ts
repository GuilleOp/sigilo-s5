// Envío de la denuncia: llaves fijadas, prueba de trabajo, subida de pruebas limpias comprobadas,
// recibo, sellado y comprobante.
import { IDENTITY_PADDED_SIZE } from '@sigilo/core';
import type { EvidenceDescriptor, EvidenceMediaType } from '@sigilo/contracts';
import { digestBlob } from '@sigilo/huella';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import type { PinnedKeys } from '../../config/pinned-keys.ts';
import { assertServedKeysMatch } from '../../crypto/key-pinning.ts';
import { createProofProvider, sendWithProof, workerPowSolver } from '../../crypto/proof-of-work.ts';
import type { PowSolver } from '../../crypto/proof-of-work.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  identityBlockSize,
  normalizeSubmissionInput,
  sealReporterEscalation,
  sealReporterIdentity,
  verifySubmission,
} from '../../crypto/submission.ts';
import type { CorroborationPayload } from '../../corroboration/blind-corroboration.ts';
import type { ReporterApi } from '../../network/relay-api.ts';
import type { SigiloApi } from '../../services/api.ts';
import { ApiRequestError } from '../../services/api-client.ts';
import type { ReportDraft } from '../../state/report-draft.ts';
import { identityInputOf, toComplaintFacts } from '../../state/report-validation.ts';

/** Resultado de un envío exitoso. */
export interface SubmittedReport {
  folio: string;
  words: string[];
  receivedOn: string;
  /** Autoridad y nodo de la red a los que llegó, si se envió por la red. */
  destination?: { authorityName: string; nodeName: string };
  /** Resultado de la corroboración ciega: `sent`, `failed` (se envió sin ella) o sin pedirla. */
  corroboration?: 'sent' | 'failed';
}

/**
 * Envío por la red: operaciones a través del enrutador ciego y llaves de la autoridad destino
 * tomadas del directorio verificado.
 */
export interface NetworkSubmission {
  api: ReporterApi;
  keys: PinnedKeys;
  authorityName: string;
  nodeName: string;
  /** Corroboración ciega opcional: se calcula con el relato final, justo antes de cifrar. */
  corroborate?: (narrative: string) => Promise<CorroborationPayload | null>;
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

/**
 * Error cuando el servidor devuelve un descriptor que no corresponde a la copia limpia enviada:
 * otro digesto, tamaño o tipo. El mensaje es para mostrarse.
 */
export class EvidenceMismatchError extends Error {
  constructor() {
    super(
      'El sistema no guardó una de tus pruebas tal como la enviamos. Por seguridad nos detuvimos; inténtalo de nuevo.',
    );
    this.name = 'EvidenceMismatchError';
  }
}

/** Descriptores de las pruebas ya subidas, por copia limpia, para no volver a subirlas. */
export type UploadCache = WeakMap<Blob, EvidenceDescriptor>;

/**
 * Opciones del envío; por omisión, las llaves fijadas del bundle, la caché del módulo y la prueba
 * de trabajo en un Web Worker.
 */
export interface SubmitOptions {
  pinned?: PinnedKeys;
  uploads?: UploadCache;
  solver?: PowSolver;
  /** Envío por la red; sin él, la denuncia va al nodo de este mismo origen. */
  network?: NetworkSubmission;
}

function mediaTypeOf(blob: Blob): EvidenceMediaType {
  return blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
}

/**
 * Comprueba que el descriptor devuelto describa exactamente la copia limpia que se subió.
 * Seguridad: el digesto del descriptor entra en el contenido firmado de la denuncia; si el
 * servidor guardara otra imagen (o la cambiara) y se aceptara su descriptor, la autoridad
 * recibiría una prueba distinta con un comprobante válido.
 */
async function assertDescriptorMatches(
  descriptor: EvidenceDescriptor,
  blob: Blob,
  mediaType: EvidenceMediaType,
): Promise<void> {
  const isMatch =
    descriptor.mediaType === mediaType &&
    descriptor.sizeBytes === blob.size &&
    descriptor.sha256 === (await digestBlob(blob));
  if (!isMatch) throw new EvidenceMismatchError();
}

/** Indica si el rechazo del envío invalida los descriptores ya subidos (pruebas inexistentes). */
function invalidatesUploads(error: unknown): boolean {
  return (
    error instanceof ApiRequestError && (error.code === 'bad_request' || error.code === 'not_found')
  );
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
 * ya verificadas, cada descriptor devuelto se compara con la copia local, y en un reintento se
 * reutilizan los descriptores de las que ya se subieron (salvo que el servidor los haya rechazado).
 * Lanza `EvidenceMismatchError` si un descriptor no corresponde a la copia enviada.
 */
export async function submitReport(
  draft: ReportDraft,
  api: SigiloApi,
  onProgress: (message: string) => void,
  options: SubmitOptions = {},
): Promise<SubmittedReport> {
  const network = options.network;
  const pinned = network?.keys ?? options.pinned ?? PINNED_KEYS;
  const uploads = options.uploads ?? DEFAULT_UPLOADS;
  const solver = options.solver ?? workerPowSolver;
  const transport: ReporterApi = network?.api ?? api;
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
  // Por la red, las llaves salen del directorio ya verificado con la raíz fijada; con un solo
  // nodo, se comparan las publicadas con las fijadas en el bundle.
  if (network === undefined) await assertServedKeysMatch(() => api.getKeys(), pinned.set);

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

  // Un solo reto cubre las pruebas y la denuncia; se resuelve al primer uso y se renueva una vez
  // si el servidor lo rechaza (por ejemplo, porque venció).
  const proofs = createProofProvider(transport, 'complaint', solver, onProgress);
  const images = draft.evidence.flatMap((item) => item.clean);
  const evidence: EvidenceDescriptor[] = [];
  for (const [index, image] of images.entries()) {
    const known = uploads.get(image.blob);
    if (known !== undefined) {
      evidence.push(known);
      continue;
    }
    const mediaType = mediaTypeOf(image.blob);
    const descriptor = await sendWithProof(proofs, (proof) => {
      onProgress(`Enviando tus pruebas limpias: ${index + 1} de ${images.length}.`);
      return transport.uploadEvidence(image.blob, mediaType, proof);
    });
    await assertDescriptorMatches(descriptor, image.blob, mediaType);
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
    onProgress(
      'Guardando tu nombre bajo llave: solo se abre con dos aprobaciones y siempre queda registrado.',
    );
    sealedIdentity = await sealReporterIdentity(block, input, receipt.keys, pinned);
  }

  // Segunda llave: si la autoridad no actúa a tiempo, la supervisora recibe los hechos.
  const escalationEnvelope = await sealReporterEscalation(input, receipt.keys, pinned);
  // Corroboración ciega opcional: si falla, la denuncia sale igual (solo suma prioridad).
  let corroboration: CorroborationPayload | null = null;
  let corroborationResult: SubmittedReport['corroboration'];
  if (network?.corroborate !== undefined) {
    onProgress('Buscando, sin revelar el dato, si otras personas denunciaron lo mismo.');
    corroboration = await network.corroborate(input.facts.description).catch(() => null);
    corroborationResult = corroboration === null ? 'failed' : 'sent';
  }
  const request = buildSubmitRequest(
    input,
    receipt.keys,
    sealedIdentity,
    escalationEnvelope,
    corroboration ?? undefined,
  );

  let response;
  try {
    response = await sendWithProof(proofs, (proof) => {
      onProgress('Enviando tu denuncia.');
      return transport.submitComplaint(request, proof);
    });
  } catch (error) {
    // Una prueba ya asociada, purgada o inexistente hace fallar el envío: en el reintento se
    // vuelven a subir todas en lugar de repetir los mismos descriptores.
    if (invalidatesUploads(error)) for (const image of images) uploads.delete(image.blob);
    throw error;
  }

  onProgress('Comprobando que tu denuncia llegó completa.');
  if (!verifySubmission(request, response, pinned)) {
    throw new ReceiptVerificationError(response.folio, receipt.words);
  }
  return {
    folio: response.folio,
    words: receipt.words,
    receivedOn: response.receipt.receivedOn,
    ...(network === undefined
      ? {}
      : { destination: { authorityName: network.authorityName, nodeName: network.nodeName } }),
    ...(corroborationResult === undefined ? {} : { corroboration: corroborationResult }),
  };
}
