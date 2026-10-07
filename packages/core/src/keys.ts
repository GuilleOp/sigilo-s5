// Generación de pares de llaves X25519 (cifrado) y Ed25519 (firma) e identificadores de llave.
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import { sha256Hex } from './canonical-json.ts';
import { randomBytes } from './random.ts';

/** Par de llaves en bytes crudos de 32 bytes. */
export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

const KEY_LENGTH = 32;

/** Genera un par X25519 para recibir sobres HPKE. */
export function generateBoxKeyPair(): KeyPair {
  const privateKey = randomBytes(KEY_LENGTH);
  return { publicKey: x25519.getPublicKey(privateKey), privateKey };
}

/** Genera un par Ed25519; la privada es la semilla de 32 bytes. */
export function generateSigningKeyPair(): KeyPair {
  const privateKey = randomBytes(KEY_LENGTH);
  return { publicKey: ed25519.getPublicKey(privateKey), privateKey };
}

/** Identificador de llave: primeros 16 caracteres hexadecimales del SHA-256 de la llave pública. */
export function keyIdFor(publicKey: Uint8Array): string {
  return sha256Hex(publicKey).slice(0, 16);
}
