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
  /** Llave de la supervisora (segunda llave), solo si se pidió con `withSupervisor`. */
  supervisorBox?: KeyPair;
}

/** Genera un despliegue sintético con llaves nuevas; con `withSupervisor`, también la segunda llave. */
export function createTestDeployment(options: { withSupervisor?: boolean } = {}): TestDeployment {
  const server = generateSigningKeyPair();
  const authorityBox = generateBoxKeyPair();
  const authoritySigning = generateSigningKeyPair();
  const supervisorBox = options.withSupervisor === true ? generateBoxKeyPair() : undefined;
  const pinned = parsePinnedKeys(
    buildPublicKeySet({
      serverSigningPublicKey: server.publicKey,
      authorityBoxPublicKey: authorityBox.publicKey,
      authoritySigningPublicKey: authoritySigning.publicKey,
      ...(supervisorBox === undefined ? {} : { supervisorBoxPublicKey: supervisorBox.publicKey }),
    }),
  );
  return {
    pinned,
    server,
    authorityBox,
    authoritySigning,
    ...(supervisorBox === undefined ? {} : { supervisorBox }),
  };
}
