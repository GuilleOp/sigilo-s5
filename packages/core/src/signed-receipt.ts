// Comprobante de recepción firmado por el servidor sobre el digesto de la solicitud y el
// identificador de su evento en la bitácora.
import { ed25519 } from '@noble/curves/ed25519.js';
import { SignedReceiptSchema } from '@sigilo/contracts';
import type {
  ComplaintDetail,
  HpkeEnvelope,
  SignedReceipt,
  SubmitComplaintRequest,
} from '@sigilo/contracts';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { fromBase64Url, toBase64Url, utf8Encode } from './encoding.ts';
import { keyIdFor } from './keys.ts';
import { receivedPayloadDigest } from './ledger.ts';
import { sign, verify } from './signing.ts';

const UnsignedReceiptSchema = SignedReceiptSchema.omit({ signature: true });

/** Comprobante sin la firma. */
export type UnsignedReceipt = Omit<SignedReceipt, 'signature'>;

/**
 * Solicitud tal como entra al digesto: igual a la enviada, pero con `sealedIdentity` sustituido
 * por `sha256Hex(canonicalize(sealedIdentity))`.
 */
export type SubmissionDigestInput = Omit<SubmitComplaintRequest, 'sealedIdentity'> & {
  sealedIdentity?: string;
};

function receiptMessage(receipt: UnsignedReceipt): Uint8Array {
  // Se reconstruye campo por campo para firmar exactamente los campos del contrato.
  const { folio, submissionDigest, receivedOn, payloadDigest, serverKeyId } = receipt;
  return utf8Encode(
    canonicalize({ folio, submissionDigest, receivedOn, payloadDigest, serverKeyId }),
  );
}

/** `sha256Hex(canonicalize(envelope))`: digesto del sobre de identidad que entra al envío. */
export function sealedIdentityDigest(envelope: HpkeEnvelope): string {
  return sha256Hex(canonicalize(envelope));
}

/**
 * Forma única de la solicitud para su digesto, usada por el cliente, el servidor y la autoridad.
 * Seguridad: con el sobre resumido, la autoridad puede recalcular el digesto desde
 * `ComplaintDetail` sin recibir el sobre (que solo se entrega al abrir la identidad).
 */
export function submissionDigestInput(request: SubmitComplaintRequest): SubmissionDigestInput {
  const { sealedIdentity, ...rest } = request;
  return {
    ...rest,
    ...(sealedIdentity === undefined
      ? {}
      : { sealedIdentity: sealedIdentityDigest(sealedIdentity) }),
  };
}

/**
 * `sha256Hex(canonicalize(submissionDigestInput(request)))`: SHA-256 de la forma canónica de la
 * solicitud con el sobre de identidad sustituido por su digesto.
 */
export function computeSubmissionDigest(request: SubmitComplaintRequest): string {
  return sha256Hex(canonicalize(submissionDigestInput(request)));
}

/**
 * Recalcula `submissionDigest` desde el detalle que ve la autoridad (`version`, modo, hechos tal
 * como se enviaron, pruebas en orden, protección, llaves, verificador y digesto del sobre).
 * Seguridad: si coincide con el `payloadDigest` del evento `complaint.received` publicado, el
 * servidor no cambió nada de eso, en particular las llaves del buzón, ni siquiera en modo anónimo.
 */
export function submissionDigestFromDetail(detail: ComplaintDetail): string {
  const input: SubmissionDigestInput = {
    version: detail.version,
    mode: detail.summary.mode,
    facts: detail.facts,
    evidence: detail.evidence,
    ...(detail.sealedIdentityDigest === undefined
      ? {}
      : { sealedIdentity: detail.sealedIdentityDigest }),
    protectionRequested: detail.summary.protectionRequested,
    reporterKeys: {
      boxPublicKey: detail.reporterKeys.boxPublicKey,
      signingPublicKey: detail.reporterKeys.signingPublicKey,
    },
    authVerifier: detail.authVerifier,
  };
  return sha256Hex(canonicalize(input));
}

/**
 * Firma el comprobante con la llave Ed25519 del servidor.
 * Lanza error si el comprobante es inválido, si `payloadDigest` no es el de
 * `receivedPayloadDigest(folio, submissionDigest)` o si `serverKeyId` no corresponde a la llave.
 */
export function signReceipt(
  unsigned: UnsignedReceipt,
  serverPrivateKey: Uint8Array,
): SignedReceipt {
  const parsed = UnsignedReceiptSchema.parse(unsigned);
  if (parsed.payloadDigest !== receivedPayloadDigest(parsed.folio, parsed.submissionDigest)) {
    throw new Error('El identificador del evento no corresponde al comprobante.');
  }
  if (parsed.serverKeyId !== keyIdFor(ed25519.getPublicKey(serverPrivateKey))) {
    throw new Error('El identificador de llave no corresponde a la llave del servidor.');
  }
  return { ...parsed, signature: toBase64Url(sign(receiptMessage(parsed), serverPrivateKey)) };
}

/**
 * Indica si el comprobante es válido, coherente (`payloadDigest` del folio y del digesto de la
 * solicitud) y está firmado por la llave pública dada (con su `keyId`).
 */
export function verifyReceipt(receipt: SignedReceipt, serverPublicKey: Uint8Array): boolean {
  const parsed = SignedReceiptSchema.safeParse(receipt);
  if (!parsed.success || parsed.data.serverKeyId !== keyIdFor(serverPublicKey)) return false;
  try {
    const { folio, submissionDigest, payloadDigest } = parsed.data;
    if (payloadDigest !== receivedPayloadDigest(folio, submissionDigest)) return false;
    return verify(
      fromBase64Url(parsed.data.signature),
      receiptMessage(parsed.data),
      serverPublicKey,
    );
  } catch {
    return false;
  }
}
