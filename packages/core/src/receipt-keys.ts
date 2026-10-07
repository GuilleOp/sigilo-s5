// Derivación determinista de las llaves de la persona denunciante a partir de la entropía del recibo.
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { KeyPair } from './keys.ts';
import { toBase64Url, utf8Encode } from './encoding.ts';

/** Llaves derivadas del recibo. */
export interface ReceiptKeys {
  /** Llave de autenticación ante el servidor (secreta). */
  authKey: Uint8Array;
  /** Base64URL de SHA-256(authKey); es lo único que guarda el servidor. */
  authVerifier: string;
  /** Par X25519 para recibir mensajes del buzón. */
  box: KeyPair;
  /** Par Ed25519 para firmar mensajes del buzón. */
  signing: KeyPair;
}

const RECEIPT_ENTROPY_BYTES = 11;
const DERIVED_KEY_LENGTH = 32;
const EMPTY_SALT = new Uint8Array(0);

function expand(entropy: Uint8Array, context: string): Uint8Array {
  return hkdf(sha256, entropy, EMPTY_SALT, utf8Encode(context), DERIVED_KEY_LENGTH);
}

/**
 * Deriva con HKDF-SHA256 (sal vacía) las llaves de autenticación, buzón y firma.
 * Seguridad: cada uso tiene un contexto `info` distinto, así que una llave filtrada no revela las demás.
 * Con 88 bits de entropía no hace falta un KDF lento. Lanza error si la entropía no mide 11 bytes.
 */
export function deriveReceiptKeys(entropy: Uint8Array): ReceiptKeys {
  if (entropy.length !== RECEIPT_ENTROPY_BYTES) {
    throw new Error(`La entropía del recibo debe medir ${RECEIPT_ENTROPY_BYTES} bytes.`);
  }
  const authKey = expand(entropy, 'sigilo/v1/auth');
  const boxPrivateKey = expand(entropy, 'sigilo/v1/box');
  const signingPrivateKey = expand(entropy, 'sigilo/v1/sign');
  return {
    authKey,
    authVerifier: toBase64Url(sha256(authKey)),
    box: { publicKey: x25519.getPublicKey(boxPrivateKey), privateKey: boxPrivateKey },
    signing: { publicKey: ed25519.getPublicKey(signingPrivateKey), privateKey: signingPrivateKey },
  };
}
