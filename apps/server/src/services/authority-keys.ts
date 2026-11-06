// Llaves de cada autoridad que aloja el nodo: las del directorio firmado de la red cuando el nodo
// está en una, y las de `keys.json` para el buzón general y en el perfil de nodo único.
import { fromBase64Url } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import {
  directoryAuthority,
  hostedAuthorities,
  keysOfDirectoryAuthority,
} from '../network/network-context.ts';
import type { AuthorityKeys } from '../network/network-context.ts';

/** Llaves de `keys.json`: las de la autoridad del perfil de nodo único (y del buzón general). */
export function defaultAuthorityKeys(ctx: AppContext): AuthorityKeys {
  const authority = ctx.deps.keys.publicKeySet.authority;
  return {
    keyId: authority.keyId,
    boxPublicKey: fromBase64Url(authority.boxPublicKey),
    signingPublicKey: ctx.deps.keys.authoritySigningPublicKey,
  };
}

/**
 * Llaves de la autoridad: las del directorio si el nodo la aloja en la red; si no, las de
 * `keys.json`. Así un nodo con varias autoridades cifra, firma y verifica con la llave de cada una.
 */
export function authorityKeysFor(ctx: AppContext, authorityId: string): AuthorityKeys {
  const network = ctx.deps.network;
  if (network !== undefined) {
    const authority = directoryAuthority(network, authorityId);
    if (authority !== undefined && authority.nodeId === network.nodeId) {
      return keysOfDirectoryAuthority(authority);
    }
  }
  return defaultAuthorityKeys(ctx);
}

/**
 * Autoridad del nodo hacia cuya llave se cifró un sobre de identidad, o `null` si es la llave de
 * `keys.json` (llega al buzón general) o una llave que el nodo no aloja.
 */
export function authorityOfKeyId(ctx: AppContext, keyId: string): string | null {
  const network = ctx.deps.network;
  if (network === undefined) return null;
  const match = hostedAuthorities(network).find((item) => item.keyId === keyId);
  return match !== undefined && ctx.authorities.authority(match.id) !== null ? match.id : null;
}

/** Indica si el nodo puede recibir un sobre de identidad con ese `keyId`. */
export function isAcceptedIdentityKey(ctx: AppContext, keyId: string): boolean {
  return (
    keyId === ctx.deps.keys.publicKeySet.authority.keyId || authorityOfKeyId(ctx, keyId) !== null
  );
}
