// Llaves públicas fijadas en el bundle. El archivo JSON lo genera `npm run keys:generate`.
import { PublicKeySetSchema } from '@sigilo/contracts';
import type { PublicKeySet } from '@sigilo/contracts';
import { fromBase64Url, keyIdFor } from '@sigilo/core';
import rawPinnedKeys from './pinned-keys.json';

/** Llaves públicas fijadas, ya decodificadas a bytes. */
export interface PinnedKeys {
  set: PublicKeySet;
  serverSigningPublicKey: Uint8Array;
  authorityBoxPublicKey: Uint8Array;
  authoritySigningPublicKey: Uint8Array;
}

/**
 * Valida el conjunto de llaves fijadas y comprueba que cada `keyId` corresponda a su llave.
 * Seguridad: si el bundle trae llaves mal formadas, la aplicación no debe cifrar hacia ellas.
 */
export function parsePinnedKeys(raw: unknown): PinnedKeys {
  const set = PublicKeySetSchema.parse(raw);
  const serverSigningPublicKey = fromBase64Url(set.server.signingPublicKey);
  const authorityBoxPublicKey = fromBase64Url(set.authority.boxPublicKey);
  const authoritySigningPublicKey = fromBase64Url(set.authority.signingPublicKey);
  if (keyIdFor(serverSigningPublicKey) !== set.server.keyId) {
    throw new Error('La llave fijada del servidor no corresponde a su identificador.');
  }
  // El keyId de la autoridad identifica su llave de buzón (destinataria de los sobres).
  if (keyIdFor(authorityBoxPublicKey) !== set.authority.keyId) {
    throw new Error('La llave fijada de la autoridad no corresponde a su identificador.');
  }
  return { set, serverSigningPublicKey, authorityBoxPublicKey, authoritySigningPublicKey };
}

/** Llaves públicas del despliegue, fijadas al compilar. */
export const PINNED_KEYS: PinnedKeys = parsePinnedKeys(rawPinnedKeys);
