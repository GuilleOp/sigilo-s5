// Llaves públicas fijadas. Las trae `/config/sigilo.json` del mismo origen (ADR 0011, ver
// `runtime-config.ts`); si no está, las del bundle (`pinned-keys.json`, que genera
// `npm run keys:generate` o `red:demo`). La imagen genérica trae `null` en el bundle.
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
  /** Llave de la supervisora (segunda llave), si el despliegue la tiene. */
  supervisorBoxPublicKey?: Uint8Array;
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
  const supervisor = set.supervisor;
  const supervisorBoxPublicKey =
    supervisor === undefined ? undefined : fromBase64Url(supervisor.boxPublicKey);
  if (supervisor !== undefined && supervisorBoxPublicKey !== undefined) {
    if (keyIdFor(supervisorBoxPublicKey) !== supervisor.keyId) {
      throw new Error('La llave fijada de la supervisora no corresponde a su identificador.');
    }
  }
  return {
    set,
    serverSigningPublicKey,
    authorityBoxPublicKey,
    authoritySigningPublicKey,
    ...(supervisorBoxPublicKey === undefined ? {} : { supervisorBoxPublicKey }),
  };
}

/**
 * Marcador de una web sin llaves (imagen genérica sin `/config/sigilo.json`): cualquier lectura
 * lanza error. Seguridad: así la web nunca cifra hacia una llave inventada; `main.tsx` muestra el
 * aviso de configuración en lugar de montar la aplicación.
 */
const UNCONFIGURED_KEYS = new Proxy({} as PinnedKeys, {
  get() {
    throw new Error('Esta web no tiene llaves configuradas.');
  },
});

/** Llaves públicas del despliegue (enlace vivo: `setPinnedKeys` lo cambia antes de montar). */
export let PINNED_KEYS: PinnedKeys =
  rawPinnedKeys === null ? UNCONFIGURED_KEYS : parsePinnedKeys(rawPinnedKeys);

/** Indica si hay llaves fijadas (del bundle o de la configuración en tiempo de ejecución). */
export let hasPinnedKeys: boolean = rawPinnedKeys !== null;

/** Fija las llaves de la configuración en tiempo de ejecución. Lanza error si no son válidas. */
export function setPinnedKeys(raw: unknown): void {
  PINNED_KEYS = parsePinnedKeys(raw);
  hasPinnedKeys = true;
}
