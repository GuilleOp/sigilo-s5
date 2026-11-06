// Llaves de una autoridad de la red, tomadas del directorio verificado, con la misma forma que las
// llaves fijadas del bundle: así el sellado y la verificación del comprobante no cambian.
import { buildPublicKeySet, fromBase64Url } from '@sigilo/core';
import type { AuthorityDirectory, DirectoryAuthority, DirectoryNode } from '@sigilo/contracts';
import { findAuthority, findNode } from '@sigilo/red';
import type { PinnedKeys } from '../config/pinned-keys.ts';

/** Autoridad del directorio con su nodo. */
export interface NetworkDestination {
  authority: DirectoryAuthority;
  node: DirectoryNode;
  /** Autoridad supervisora que recibe la segunda llave, si tiene. */
  supervisor: DirectoryAuthority | undefined;
}

/** Busca la autoridad y su nodo; lanza si no están en el directorio. */
export function destinationFor(
  directory: AuthorityDirectory,
  authorityId: string,
): NetworkDestination {
  const authority = findAuthority(directory, authorityId);
  const node = authority === undefined ? undefined : findNode(directory, authority.nodeId);
  if (authority === undefined || node === undefined) {
    throw new Error('La autoridad elegida no está en el directorio de la red.');
  }
  const supervisor =
    authority.supervisorId === null ? undefined : findAuthority(directory, authority.supervisorId);
  return { authority, node, supervisor };
}

/**
 * Llaves para cifrar hacia una autoridad de la red: identidad y mensajes hacia su llave, segunda
 * llave hacia su supervisora y comprobante firmado por la llave de su nodo.
 * Seguridad: todas salen del directorio verificado con la raíz fijada; ninguna se descarga suelta.
 */
export function keysForDestination(destination: NetworkDestination): PinnedKeys {
  const { authority, node, supervisor } = destination;
  const serverSigningPublicKey = fromBase64Url(node.signingPublicKey);
  const authorityBoxPublicKey = fromBase64Url(authority.boxPublicKey);
  const authoritySigningPublicKey = fromBase64Url(authority.signingPublicKey);
  const supervisorBoxPublicKey =
    supervisor === undefined ? undefined : fromBase64Url(supervisor.boxPublicKey);
  return {
    set: buildPublicKeySet({
      serverSigningPublicKey,
      authorityBoxPublicKey,
      authoritySigningPublicKey,
      ...(supervisorBoxPublicKey === undefined ? {} : { supervisorBoxPublicKey }),
    }),
    serverSigningPublicKey,
    authorityBoxPublicKey,
    authoritySigningPublicKey,
    ...(supervisorBoxPublicKey === undefined ? {} : { supervisorBoxPublicKey }),
  };
}

/** Autoridades que reciben denuncias en cada nodo (para buscar un folio en toda la red). */
export function receivingAuthorityPerNode(directory: AuthorityDirectory): DirectoryAuthority[] {
  const seen = new Set<string>();
  const result: DirectoryAuthority[] = [];
  for (const authority of directory.authorities) {
    if (authority.role === 'supervisory' || seen.has(authority.nodeId)) continue;
    seen.add(authority.nodeId);
    result.push(authority);
  }
  return result;
}
