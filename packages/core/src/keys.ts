// Generación y validación de pares de llaves X25519 (cifrado) y Ed25519 (firma), identificadores
// de llave y armado del conjunto de llaves públicas del despliegue.
import { x25519, ed25519 } from '@noble/curves/ed25519.js';
import type { PublicKeySet } from '@sigilo/contracts';
import { sha256Hex } from './canonical-json.ts';
import { equalBytes, toBase64Url } from './encoding.ts';
import { randomBytes } from './random.ts';

/** Par de llaves en bytes crudos de 32 bytes. */
export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/** Llaves públicas con las que se arma el `PublicKeySet` del despliegue. */
export interface DeploymentPublicKeys {
  /** Ed25519 con la que el servidor firma comprobantes y la cabeza de la bitácora. */
  serverSigningPublicKey: Uint8Array;
  /** X25519 de la autoridad: destinataria de identidades y mensajes. */
  authorityBoxPublicKey: Uint8Array;
  /** Ed25519 con la que la autoridad firma sus mensajes. */
  authoritySigningPublicKey: Uint8Array;
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

function assertKeyLengths(keys: readonly Uint8Array[]): void {
  if (keys.some((key) => key.length !== KEY_LENGTH)) {
    throw new Error(`Las llaves deben medir ${KEY_LENGTH} bytes.`);
  }
}

/**
 * Comprueba que la privada X25519 corresponda a la pública. Lanza error si no corresponde o si
 * alguna llave no mide 32 bytes.
 */
export function assertBoxKeyPair(pair: KeyPair): void {
  assertKeyLengths([pair.publicKey, pair.privateKey]);
  if (!equalBytes(x25519.getPublicKey(pair.privateKey), pair.publicKey)) {
    throw new Error('La llave privada de cifrado no corresponde a su llave pública.');
  }
}

/**
 * Comprueba que la semilla Ed25519 corresponda a la pública. Lanza error si no corresponde o si
 * alguna llave no mide 32 bytes.
 */
export function assertSigningKeyPair(pair: KeyPair): void {
  assertKeyLengths([pair.publicKey, pair.privateKey]);
  if (!equalBytes(ed25519.getPublicKey(pair.privateKey), pair.publicKey)) {
    throw new Error('La llave privada de firma no corresponde a su llave pública.');
  }
}

/**
 * Arma el conjunto de llaves públicas que publica el servidor y fija el cliente.
 * El `keyId` de la autoridad identifica su llave X25519, que es la destinataria de los sobres.
 * Lanza error si alguna llave no mide 32 bytes.
 */
export function buildPublicKeySet(keys: DeploymentPublicKeys): PublicKeySet {
  assertKeyLengths([
    keys.serverSigningPublicKey,
    keys.authorityBoxPublicKey,
    keys.authoritySigningPublicKey,
  ]);
  return {
    server: {
      keyId: keyIdFor(keys.serverSigningPublicKey),
      signingPublicKey: toBase64Url(keys.serverSigningPublicKey),
    },
    authority: {
      keyId: keyIdFor(keys.authorityBoxPublicKey),
      boxPublicKey: toBase64Url(keys.authorityBoxPublicKey),
      signingPublicKey: toBase64Url(keys.authoritySigningPublicKey),
    },
  };
}
