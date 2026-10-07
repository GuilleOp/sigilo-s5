// Firmas Ed25519 (RFC 8032) sobre bytes arbitrarios.
import { ed25519 } from '@noble/curves/ed25519.js';

/** Firma `message` con la semilla Ed25519 de 32 bytes. Devuelve 64 bytes. */
export function sign(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey);
}

/**
 * Verifica una firma Ed25519. Devuelve `false` ante cualquier entrada mal formada en vez de lanzar.
 * Seguridad: verificación estricta RFC 8032 (sin ZIP-215) para rechazar codificaciones no canónicas.
 */
export function verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey, { zip215: false });
  } catch {
    return false;
  }
}
