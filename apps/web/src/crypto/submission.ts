// Armado y sellado de la denuncia en el navegador: recibo, llaves, identidad y comprobante.
import { SubmitComplaintRequestSchema } from '@sigilo/contracts';
import type {
  ComplaintFacts,
  ComplaintMode,
  EvidenceDescriptor,
  HpkeEnvelope,
  IdentityBlock,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import {
  computeSubmissionDigest,
  deriveReceiptKeys,
  generateReceiptPhrase,
  sealIdentity,
  toBase64Url,
  verifyReceipt,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import type { PinnedKeys } from '../config/pinned-keys.ts';

/** Recibo recién generado: las 8 palabras y las llaves que derivan de ellas. */
export interface FreshReceipt {
  words: string[];
  keys: ReceiptKeys;
}

/** Datos de identidad que captura el formulario (modo sellado). */
export interface IdentityInput {
  fullName: string;
  contact: string;
  witnesses: string[];
}

/**
 * Genera un recibo nuevo y deriva sus llaves.
 * Seguridad: la entropía se usa solo aquí y no se conserva; las palabras bastan para recuperarla.
 */
export function createReceipt(): FreshReceipt {
  const { words, entropy } = generateReceiptPhrase();
  const keys = deriveReceiptKeys(entropy);
  entropy.fill(0);
  return { words, keys };
}

/** Construye el bloque de identidad, sin campos vacíos. */
export function buildIdentityBlock(
  identity: IdentityInput,
  originalEvidenceSha256: readonly string[],
): IdentityBlock {
  const contact = identity.contact.trim();
  return {
    fullName: identity.fullName.trim(),
    ...(contact === '' ? {} : { contact }),
    witnesses: identity.witnesses.map((witness) => witness.trim()).filter(Boolean),
    originalEvidenceSha256: [...originalEvidenceSha256],
  };
}

/**
 * Sella la identidad hacia la llave FIJADA de la autoridad, ligada al `authVerifier` del recibo.
 * Seguridad: nunca se usa una llave descargada del servidor.
 */
export function sealReporterIdentity(
  block: IdentityBlock,
  keys: ReceiptKeys,
  pinned: PinnedKeys,
): Promise<HpkeEnvelope> {
  return sealIdentity(
    block,
    { keyId: pinned.set.authority.keyId, publicKey: pinned.authorityBoxPublicKey },
    keys.authVerifier,
  );
}

/** Datos de la denuncia que no dependen del recibo. */
export interface SubmissionInput {
  mode: ComplaintMode;
  facts: ComplaintFacts;
  evidence: EvidenceDescriptor[];
  protectionRequested: boolean;
}

/**
 * Arma `SubmitComplaintRequest` y lo valida con el esquema del contrato.
 * Seguridad: se eliminan campos sobrantes porque el comprobante firma el digesto de la solicitud
 * validada; en modo anónimo nunca viaja identidad ni solicitud de protección.
 */
export function buildSubmitRequest(
  input: SubmissionInput,
  keys: ReceiptKeys,
  sealedIdentity: HpkeEnvelope | undefined,
): SubmitComplaintRequest {
  const isSealed = input.mode === 'sealed';
  if (isSealed && sealedIdentity === undefined) {
    throw new Error('Falta la identidad sellada.');
  }
  const candidate = {
    version: 1 as const,
    mode: input.mode,
    facts: input.facts,
    evidence: input.evidence,
    ...(isSealed && sealedIdentity !== undefined ? { sealedIdentity } : {}),
    protectionRequested: isSealed ? input.protectionRequested : false,
    reporterKeys: {
      boxPublicKey: toBase64Url(keys.box.publicKey),
      signingPublicKey: toBase64Url(keys.signing.publicKey),
    },
    authVerifier: keys.authVerifier,
  };
  const parsed = SubmitComplaintRequestSchema.safeParse(candidate);
  // Seguridad: no se muestran detalles de validación porque podrían citar datos de la denuncia.
  if (!parsed.success) throw new Error('La denuncia no tiene el formato esperado.');
  return parsed.data;
}

/**
 * Comprueba que el comprobante esté firmado por la llave fijada del servidor, que corresponda al
 * folio devuelto y que su digesto sea el de la solicitud que enviamos.
 */
export function verifySubmission(
  request: SubmitComplaintRequest,
  response: SubmitComplaintResponse,
  pinned: PinnedKeys,
): boolean {
  const { receipt, folio } = response;
  return (
    receipt.folio === folio &&
    receipt.submissionDigest === computeSubmissionDigest(request) &&
    verifyReceipt(receipt, pinned.serverSigningPublicKey)
  );
}
