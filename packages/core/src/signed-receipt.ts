// Comprobante de recepción firmado por el servidor sobre el digesto de la solicitud.
import { ed25519 } from '@noble/curves/ed25519.js';
import { SignedReceiptSchema } from '@sigilo/contracts';
import type { SignedReceipt, SubmitComplaintRequest } from '@sigilo/contracts';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { fromBase64Url, toBase64Url, utf8Encode } from './encoding.ts';
import { keyIdFor } from './keys.ts';
import { sign, verify } from './signing.ts';

const UnsignedReceiptSchema = SignedReceiptSchema.omit({ signature: true });

/** Comprobante sin la firma. */
export type UnsignedReceipt = Omit<SignedReceipt, 'signature'>;

function receiptMessage(receipt: UnsignedReceipt): Uint8Array {
  // Se reconstruye campo por campo para firmar exactamente los campos del contrato.
  const { folio, submissionDigest, receivedOn, ledgerSeq, serverKeyId } = receipt;
  return utf8Encode(canonicalize({ folio, submissionDigest, receivedOn, ledgerSeq, serverKeyId }));
}

/** SHA-256 en hexadecimal de la forma canónica de la solicitud de denuncia. */
export function computeSubmissionDigest(request: SubmitComplaintRequest): string {
  return sha256Hex(canonicalize(request));
}

/**
 * Firma el comprobante con la llave Ed25519 del servidor.
 * Lanza error si el comprobante es inválido o `serverKeyId` no corresponde a la llave.
 */
export function signReceipt(
  unsigned: UnsignedReceipt,
  serverPrivateKey: Uint8Array,
): SignedReceipt {
  const parsed = UnsignedReceiptSchema.parse(unsigned);
  if (parsed.serverKeyId !== keyIdFor(ed25519.getPublicKey(serverPrivateKey))) {
    throw new Error('El identificador de llave no corresponde a la llave del servidor.');
  }
  return { ...parsed, signature: toBase64Url(sign(receiptMessage(parsed), serverPrivateKey)) };
}

/** Indica si el comprobante es válido y está firmado por la llave pública dada (con su `keyId`). */
export function verifyReceipt(receipt: SignedReceipt, serverPublicKey: Uint8Array): boolean {
  const parsed = SignedReceiptSchema.safeParse(receipt);
  if (!parsed.success || parsed.data.serverKeyId !== keyIdFor(serverPublicKey)) return false;
  try {
    return verify(
      fromBase64Url(parsed.data.signature),
      receiptMessage(parsed.data),
      serverPublicKey,
    );
  } catch {
    return false;
  }
}
