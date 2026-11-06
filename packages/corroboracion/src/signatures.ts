// Firmas Ed25519 con separación de dominio de los mensajes de la corroboración: registro y avisos
// del nodo ante el índice, conteo diario del evaluador; y el digesto opaco del folio.
import { ed25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  CORROBORATION_OPRF_SUITE,
  EvaluationDailyCountSchema,
  IndexConfirmationSchema,
  IndexNoticesRequestSchema,
  IndexWithdrawalSchema,
  IndexRegistrationSchema,
} from '@sigilo/contracts';
import type {
  CorroborationEvaluatorKey,
  EvaluationDailyCount,
  IndexConfirmation,
  IndexNoticesRequest,
  IndexWithdrawal,
  IndexRegistration,
} from '@sigilo/contracts';
import {
  canonicalize,
  fromBase64Url,
  keyIdFor,
  sign,
  toBase64Url,
  toHex,
  utf8Encode,
  verify,
} from '@sigilo/core';
import type { EvaluatorKeyPair } from './oprf.ts';

export const INDEX_REGISTRATION_DOMAIN = 'sigilo/corroboracion/index-registration/v1:';
export const INDEX_NOTICES_DOMAIN = 'sigilo/corroboracion/index-notices/v1:';
export const INDEX_CONFIRMATION_DOMAIN = 'sigilo/corroboracion/index-confirmation/v1:';
export const INDEX_WITHDRAWAL_DOMAIN = 'sigilo/corroboracion/index-withdrawal/v1:';
export const EVALUATION_COUNT_DOMAIN = 'sigilo/corroboracion/evaluation-count/v1:';
const FOLIO_DOMAIN = 'sigilo/v1/corroboration/folio:';

function signText(domain: string, value: object, privateKey: Uint8Array): string {
  return toBase64Url(sign(utf8Encode(`${domain}${canonicalize(value)}`), privateKey));
}

function verifyText(domain: string, value: object, signature: string, publicKey: string): boolean {
  try {
    return verify(
      fromBase64Url(signature),
      utf8Encode(`${domain}${canonicalize(value)}`),
      fromBase64Url(publicKey),
    );
  } catch {
    return false;
  }
}

/**
 * Digesto opaco del folio para el índice: HMAC-SHA256 con un secreto del nodo.
 * Seguridad: sin el secreto, el índice no puede ligar el digesto con el folio público aunque
 * alguien lo conozca. Lanza error si el secreto mide menos de 32 bytes.
 */
export function folioDigestFor(folio: string, nodeSecret: Uint8Array): string {
  if (nodeSecret.length < 32) throw new Error('El secreto del nodo debe medir al menos 32 bytes.');
  return toHex(hmac(sha256, nodeSecret, utf8Encode(`${FOLIO_DOMAIN}${folio}`)));
}

/** Firma el registro de una denuncia con la llave Ed25519 del nodo en el directorio. */
export function signIndexRegistration(
  unsigned: Omit<IndexRegistration, 'signature' | 'v'>,
  nodeSigningPrivateKey: Uint8Array,
): IndexRegistration {
  const value = { v: 1 as const, ...unsigned };
  return IndexRegistrationSchema.parse({
    ...value,
    signature: signText(INDEX_REGISTRATION_DOMAIN, value, nodeSigningPrivateKey),
  });
}

/** Indica si el registro está firmado por la llave del nodo. Nunca lanza. */
export function verifyIndexRegistration(
  registration: IndexRegistration,
  nodeSigningPublicKey: string,
): boolean {
  const { signature, ...value } = registration;
  return verifyText(INDEX_REGISTRATION_DOMAIN, value, signature, nodeSigningPublicKey);
}

/** Firma la petición de avisos del nodo. */
export function signNoticesRequest(
  unsigned: Omit<IndexNoticesRequest, 'signature' | 'v'>,
  nodeSigningPrivateKey: Uint8Array,
): IndexNoticesRequest {
  const value = { v: 1 as const, ...unsigned };
  return IndexNoticesRequestSchema.parse({
    ...value,
    signature: signText(INDEX_NOTICES_DOMAIN, value, nodeSigningPrivateKey),
  });
}

/** Indica si la petición de avisos está firmada por la llave del nodo. Nunca lanza. */
export function verifyNoticesRequest(
  request: IndexNoticesRequest,
  nodeSigningPublicKey: string,
): boolean {
  const { signature, ...value } = request;
  return verifyText(INDEX_NOTICES_DOMAIN, value, signature, nodeSigningPublicKey);
}

/** Firma la confirmación de que la autoridad aceptó la denuncia. */
export function signIndexConfirmation(
  unsigned: Omit<IndexConfirmation, 'signature' | 'v'>,
  nodeSigningPrivateKey: Uint8Array,
): IndexConfirmation {
  const value = { v: 1 as const, ...unsigned };
  return IndexConfirmationSchema.parse({
    ...value,
    signature: signText(INDEX_CONFIRMATION_DOMAIN, value, nodeSigningPrivateKey),
  });
}

/** Indica si la confirmación está firmada por la llave del nodo. Nunca lanza. */
export function verifyIndexConfirmation(
  confirmation: IndexConfirmation,
  nodeSigningPublicKey: string,
): boolean {
  const { signature, ...value } = confirmation;
  return verifyText(INDEX_CONFIRMATION_DOMAIN, value, signature, nodeSigningPublicKey);
}

/** Firma la baja de una denuncia del índice. */
export function signIndexWithdrawal(
  unsigned: Omit<IndexWithdrawal, 'signature' | 'v'>,
  nodeSigningPrivateKey: Uint8Array,
): IndexWithdrawal {
  const value = { v: 1 as const, ...unsigned };
  return IndexWithdrawalSchema.parse({
    ...value,
    signature: signText(INDEX_WITHDRAWAL_DOMAIN, value, nodeSigningPrivateKey),
  });
}

/** Indica si la baja está firmada por la llave del nodo. Nunca lanza. */
export function verifyIndexWithdrawal(
  withdrawal: IndexWithdrawal,
  nodeSigningPublicKey: string,
): boolean {
  const { signature, ...value } = withdrawal;
  return verifyText(INDEX_WITHDRAWAL_DOMAIN, value, signature, nodeSigningPublicKey);
}

/** Firma el conteo de evaluaciones de un día cerrado con la llave Ed25519 del evaluador. */
export function signEvaluationCount(
  unsigned: Omit<EvaluationDailyCount, 'signature' | 'v' | 'signingKeyId'>,
  signingPrivateKey: Uint8Array,
): EvaluationDailyCount {
  const value = {
    v: 1 as const,
    ...unsigned,
    signingKeyId: keyIdFor(ed25519.getPublicKey(signingPrivateKey)),
  };
  return EvaluationDailyCountSchema.parse({
    ...value,
    signature: signText(EVALUATION_COUNT_DOMAIN, value, signingPrivateKey),
  });
}

/** Indica si el conteo está firmado por la llave de firma del evaluador publicada. Nunca lanza. */
export function verifyEvaluationCount(
  count: EvaluationDailyCount,
  key: CorroborationEvaluatorKey,
): boolean {
  if (count.signingKeyId !== key.signingKeyId) return false;
  const { signature, ...value } = count;
  return verifyText(EVALUATION_COUNT_DOMAIN, value, signature, key.signingPublicKey);
}

/** Arma la llave pública del evaluador que se publica en el directorio. */
export function buildEvaluatorKey(input: {
  keyPair: EvaluatorKeyPair;
  epoch: number;
  signingPrivateKey: Uint8Array;
  validFrom: string;
}): CorroborationEvaluatorKey {
  const signingPublicKey = ed25519.getPublicKey(input.signingPrivateKey);
  return {
    suite: CORROBORATION_OPRF_SUITE,
    epoch: input.epoch,
    keyId: keyIdFor(input.keyPair.publicKey),
    publicKey: toBase64Url(input.keyPair.publicKey),
    signingKeyId: keyIdFor(signingPublicKey),
    signingPublicKey: toBase64Url(signingPublicKey),
    validFrom: input.validFrom,
  };
}
