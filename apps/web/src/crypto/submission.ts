// Armado y sellado de la denuncia en el navegador: recibo, llaves, identidad y comprobante.
import {
  ComplaintFactsSchema,
  EvidenceDescriptorSchema,
  MAX_EVIDENCE_ITEMS,
  primaryOffenseCode,
  SubmitComplaintRequestSchema,
} from '@sigilo/contracts';
import type {
  ComplaintFacts,
  ComplaintMode,
  EvidenceDescriptor,
  HpkeEnvelope,
  IdentityBlock,
  ReporterKeys,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import {
  canonicalize,
  computeSubmissionDigest,
  deriveReceiptKeys,
  generateReceiptPhrase,
  IDENTITY_PADDED_SIZE,
  identityContextFor,
  sealIdentity,
  toBase64Url,
  utf8Encode,
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

/** Datos de la denuncia que no dependen del recibo. */
export interface SubmissionInput {
  mode: ComplaintMode;
  facts: ComplaintFacts;
  evidence: readonly EvidenceDescriptor[];
  protectionRequested: boolean;
}

/** Bytes del prefijo de longitud que `padToBlock` antepone al bloque de identidad. */
const LENGTH_PREFIX_BYTES = 4;
const INVALID_REQUEST = 'La denuncia no tiene el formato esperado.';

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
 * Bytes que ocupa el bloque dentro del sobre: forma canónica en UTF-8 más el prefijo de longitud.
 * Debe ser a lo más `IDENTITY_PADDED_SIZE` para que `sealIdentity` lo acepte.
 */
export function identityBlockSize(block: IdentityBlock): number {
  return utf8Encode(canonicalize(block)).length + LENGTH_PREFIX_BYTES;
}

/**
 * Indica si la identidad cabe en el sobre de tamaño fijo, reservando lugar para el máximo de
 * digestos de pruebas originales (en el paso del modo todavía no se conocen las pruebas).
 */
export function identityFitsEnvelope(identity: IdentityInput): boolean {
  const reserved = Array.from({ length: MAX_EVIDENCE_ITEMS }, () => '0'.repeat(64));
  return identityBlockSize(buildIdentityBlock(identity, reserved)) <= IDENTITY_PADDED_SIZE;
}

/**
 * Deja la entrada exactamente como viajará: hechos y descriptores validados por sus esquemas
 * (zod quita campos sobrantes), la conducta con su clave principal y, en modo anónimo, sin
 * solicitud de protección.
 * Seguridad: el digesto del contenido que liga la identidad se calcula sobre estos valores, así
 * que deben ser idénticos a los de la solicitud final.
 */
export function normalizeSubmissionInput(input: SubmissionInput): SubmissionInput {
  const facts = ComplaintFactsSchema.safeParse(input.facts);
  const evidence = EvidenceDescriptorSchema.array()
    .max(MAX_EVIDENCE_ITEMS)
    .safeParse(input.evidence);
  // Seguridad: no se muestran detalles de validación porque podrían citar datos de la denuncia.
  if (!facts.success || !evidence.success) throw new Error(INVALID_REQUEST);
  const offenseCode = primaryOffenseCode(facts.data.offenseCode) ?? facts.data.offenseCode;
  return {
    mode: input.mode,
    facts: { ...facts.data, offenseCode },
    evidence: evidence.data,
    protectionRequested: input.mode === 'sealed' ? input.protectionRequested : false,
  };
}

function reporterKeysOf(keys: ReceiptKeys): ReporterKeys {
  return {
    boxPublicKey: toBase64Url(keys.box.publicKey),
    signingPublicKey: toBase64Url(keys.signing.publicKey),
  };
}

/**
 * Sella la identidad hacia la llave FIJADA de la autoridad, ligada por el AAD al recibo
 * (`authVerifier`), a las llaves del buzón y al contenido exacto de la denuncia.
 * Seguridad: nunca se usa una llave descargada del servidor. Lanza error si el bloque excede
 * `IDENTITY_PADDED_SIZE`.
 */
export function sealReporterIdentity(
  block: IdentityBlock,
  input: SubmissionInput,
  keys: ReceiptKeys,
  pinned: PinnedKeys,
): Promise<HpkeEnvelope> {
  const content = normalizeSubmissionInput(input);
  return sealIdentity(
    block,
    { keyId: pinned.set.authority.keyId, publicKey: pinned.authorityBoxPublicKey },
    identityContextFor({
      version: 1,
      ...content,
      authVerifier: keys.authVerifier,
      reporterKeys: reporterKeysOf(keys),
    }),
  );
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
  const content = normalizeSubmissionInput(input);
  const isSealed = content.mode === 'sealed';
  if (isSealed && sealedIdentity === undefined) {
    throw new Error('Falta la identidad sellada.');
  }
  const candidate = {
    version: 1 as const,
    mode: content.mode,
    facts: content.facts,
    evidence: content.evidence,
    ...(isSealed && sealedIdentity !== undefined ? { sealedIdentity } : {}),
    protectionRequested: content.protectionRequested,
    reporterKeys: reporterKeysOf(keys),
    authVerifier: keys.authVerifier,
  };
  const parsed = SubmitComplaintRequestSchema.safeParse(candidate);
  if (!parsed.success) throw new Error(INVALID_REQUEST);
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
