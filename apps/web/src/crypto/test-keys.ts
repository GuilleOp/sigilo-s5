// Llaves de prueba generadas al vuelo para las pruebas unitarias (nunca llaves del despliegue).
import { generateBoxKeyPair, generateSigningKeyPair, keyIdFor, toBase64Url } from '@sigilo/core';
import type { KeyPair } from '@sigilo/core';
import { parsePinnedKeys } from '../config/pinned-keys.ts';
import type { PinnedKeys } from '../config/pinned-keys.ts';

/** Despliegue sintético: llaves privadas y su conjunto público fijado. */
export interface TestDeployment {
  pinned: PinnedKeys;
  server: KeyPair;
  authorityBox: KeyPair;
  authoritySigning: KeyPair;
}

/** Genera un despliegue sintético con llaves nuevas. */
export function createTestDeployment(): TestDeployment {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const pinned = parsePinnedKeys({
    server: { keyId: keyIdFor(server.publicKey), signingPublicKey: toBase64Url(server.publicKey) },
    authority: {
      keyId: keyIdFor(authorityBox.publicKey),
      boxPublicKey: toBase64Url(authorityBox.publicKey),
      signingPublicKey: toBase64Url(authoritySigning.publicKey),
    },
  });
  return { pinned, server, authorityBox, authoritySigning };
}
