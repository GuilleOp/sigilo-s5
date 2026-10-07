// Llaves de prueba generadas al vuelo para las pruebas unitarias (nunca llaves del despliegue).
import { buildPublicKeySet, generateBoxKeyPair, generateSigningKeyPair } from '@sigilo/core';
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
  const pinned = parsePinnedKeys(
    buildPublicKeySet({
      serverSigningPublicKey: server.publicKey,
      authorityBoxPublicKey: authorityBox.publicKey,
      authoritySigningPublicKey: authoritySigning.publicKey,
    }),
  );
  return { pinned, server, authorityBox, authoritySigning };
}
