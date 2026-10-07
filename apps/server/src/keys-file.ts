// Formato de los archivos de llaves del despliegue (`keys.json` y `authority-demo-key.json`) y su
// validación. Lo comparten el servidor y el script `scripts/generate-keys.ts`.
import { z } from 'zod';
import { Base64UrlSchema, KeyIdSchema, PublicKeySetSchema } from '@sigilo/contracts';
import type { PublicKeySet } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor, sign, utf8Encode, verify } from '@sigilo/core';

/** Contenido de `keys.json`: privada del servidor y públicas de todo el despliegue. */
export const KeysFileSchema = z.object({
  version: z.literal(1),
  publicKeys: PublicKeySetSchema,
  server: z.object({ signingPrivateKey: Base64UrlSchema }),
});
export type KeysFile = z.infer<typeof KeysFileSchema>;

/** Contenido de `authority-demo-key.json`: llaves de la autoridad de demostración. */
export const AuthorityDemoKeySchema = z.object({
  version: z.literal(1),
  keyId: KeyIdSchema,
  boxPublicKey: Base64UrlSchema,
  boxPrivateKey: Base64UrlSchema,
  signingPublicKey: Base64UrlSchema,
  signingPrivateKey: Base64UrlSchema,
});
export type AuthorityDemoKey = z.infer<typeof AuthorityDemoKeySchema>;

/** Llaves que usa el servidor en memoria, ya decodificadas. */
export interface ServerKeys {
  publicKeySet: PublicKeySet;
  serverSigningPrivateKey: Uint8Array;
  authoritySigningPublicKey: Uint8Array;
}

const KEY_LENGTH = 32;
const KEY_CHECK_MESSAGE = utf8Encode('sigilo/v1/key-check');

function decodeKey(value: string): Uint8Array {
  const bytes = fromBase64Url(value);
  if (bytes.length !== KEY_LENGTH) throw new Error('Llave con longitud inválida.');
  return bytes;
}

function assertSigningPair(privateKey: Uint8Array, publicKey: Uint8Array): void {
  if (!verify(sign(KEY_CHECK_MESSAGE, privateKey), KEY_CHECK_MESSAGE, publicKey)) {
    throw new Error('La llave privada del servidor no corresponde a su llave pública.');
  }
}

/**
 * Valida `keys.json` y devuelve las llaves decodificadas.
 * Lanza error si el formato es inválido, si un `keyId` no corresponde a su llave o si la privada
 * del servidor no corresponde a su pública.
 */
export function parseKeysFile(raw: unknown): ServerKeys {
  const parsed = KeysFileSchema.safeParse(raw);
  if (!parsed.success) throw new Error('El archivo de llaves no tiene el formato esperado.');
  const { publicKeys, server } = parsed.data;
  const serverPublicKey = decodeKey(publicKeys.server.signingPublicKey);
  const authorityBoxPublicKey = decodeKey(publicKeys.authority.boxPublicKey);
  const authoritySigningPublicKey = decodeKey(publicKeys.authority.signingPublicKey);
  if (publicKeys.server.keyId !== keyIdFor(serverPublicKey)) {
    throw new Error('El identificador de la llave del servidor no corresponde.');
  }
  // El keyId de la autoridad identifica su llave de buzón, que es la destinataria de los sobres.
  if (publicKeys.authority.keyId !== keyIdFor(authorityBoxPublicKey)) {
    throw new Error('El identificador de la llave de la autoridad no corresponde.');
  }
  const serverSigningPrivateKey = decodeKey(server.signingPrivateKey);
  assertSigningPair(serverSigningPrivateKey, serverPublicKey);
  return { publicKeySet: publicKeys, serverSigningPrivateKey, authoritySigningPublicKey };
}
