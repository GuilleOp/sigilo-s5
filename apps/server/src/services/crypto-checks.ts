// Comprobaciones estructurales de llaves, firmas y sobres que el servidor puede hacer sin descifrar.
import type { HpkeEnvelope } from '@sigilo/contracts';
import { canonicalize, fromBase64Url, utf8Encode, verify } from '@sigilo/core';

const KEY_LENGTH = 32;
const SIGNATURE_LENGTH = 64;
const AEAD_TAG_LENGTH = 16;
const IDENTITY_PADDED_SIZE = 4096;
const MAILBOX_BLOCK_SIZE = 512;
const MAX_MAILBOX_PADDED_SIZE = 32 * 1024;

function decodedLength(value: string): number | null {
  try {
    return fromBase64Url(value).length;
  } catch {
    return null;
  }
}

/** Indica si el valor es Base64URL canónico de exactamente 32 bytes (llave o digesto). */
export function isKey32(value: string): boolean {
  return decodedLength(value) === KEY_LENGTH;
}

function plaintextLength(envelope: HpkeEnvelope): number | null {
  if (decodedLength(envelope.enc) !== KEY_LENGTH) return null;
  const ctLength = decodedLength(envelope.ct);
  return ctLength === null ? null : ctLength - AEAD_TAG_LENGTH;
}

/**
 * Indica si el sobre tiene el tamaño de una identidad rellenada a 4096 bytes.
 * Seguridad: rechazar otros tamaños garantiza que el texto cifrado no filtre la longitud real.
 */
export function hasIdentityShape(envelope: HpkeEnvelope): boolean {
  return plaintextLength(envelope) === IDENTITY_PADDED_SIZE;
}

/** Indica si el sobre tiene el tamaño de un mensaje del buzón rellenado a bloques de 512 bytes. */
export function hasMailboxShape(envelope: HpkeEnvelope): boolean {
  const length = plaintextLength(envelope);
  return (
    length !== null &&
    length > 0 &&
    length <= MAX_MAILBOX_PADDED_SIZE &&
    length % MAILBOX_BLOCK_SIZE === 0
  );
}

/** Verifica la firma Ed25519 (Base64URL) sobre la forma canónica del sobre. */
export function isEnvelopeSignatureValid(
  envelope: HpkeEnvelope,
  signature: string,
  signerPublicKey: Uint8Array,
): boolean {
  try {
    const signatureBytes = fromBase64Url(signature);
    if (signatureBytes.length !== SIGNATURE_LENGTH) return false;
    return verify(signatureBytes, utf8Encode(canonicalize(envelope)), signerPublicKey);
  } catch {
    return false;
  }
}
