// Firmas Ed25519 con separación de dominio y conteo de cofirmas m de n de testigos fijados.
import { ed25519 } from '@noble/curves/ed25519.js';
import type { NetworkTrustAnchor, WitnessSignature } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor, sign, toBase64Url, utf8Encode, verify } from '@sigilo/core';

/** Llave pública Ed25519 de una semilla de 32 bytes. */
export function signingPublicKeyOf(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey);
}

/** Firma `domain + text` y devuelve la firma en Base64URL. */
export function signWithDomain(domain: string, text: string, privateKey: Uint8Array): string {
  return toBase64Url(sign(utf8Encode(`${domain}${text}`), privateKey));
}

/**
 * Verifica una firma de `domain + text`. Devuelve `false` ante cualquier entrada mal formada.
 * Seguridad: cada uso tiene su propio dominio, para que una firma de un tipo de documento no
 * valga como firma de otro.
 */
export function verifyWithDomain(
  domain: string,
  text: string,
  signature: string,
  publicKey: string,
): boolean {
  try {
    return verify(
      fromBase64Url(signature),
      utf8Encode(`${domain}${text}`),
      fromBase64Url(publicKey),
    );
  } catch {
    return false;
  }
}

/**
 * Testigos distintos de la raíz de confianza con una cofirma válida de `domain + text`.
 * Seguridad: se cuentan solo testigos fijados, una vez cada uno, con su `keyId` correcto; las
 * firmas de desconocidos o repetidas no suman.
 */
export function validWitnesses(
  domain: string,
  text: string,
  signatures: readonly WitnessSignature[],
  trust: NetworkTrustAnchor,
): string[] {
  const valid = new Set<string>();
  for (const signature of signatures) {
    if (valid.has(signature.witnessId)) continue;
    const witness = trust.witnesses.find((candidate) => candidate.id === signature.witnessId);
    if (witness === undefined || witness.keyId !== signature.keyId) continue;
    if (verifyWithDomain(domain, text, signature.signature, witness.signingPublicKey)) {
      valid.add(signature.witnessId);
    }
  }
  return [...valid].sort();
}

/** Indica si `keyId` corresponde a la llave pública en Base64URL. */
export function keyIdMatches(keyId: string, publicKey: string): boolean {
  try {
    const bytes = fromBase64Url(publicKey);
    return bytes.length === 32 && keyIdFor(bytes) === keyId;
  } catch {
    return false;
  }
}
