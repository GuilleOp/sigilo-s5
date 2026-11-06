// El nodo dentro de la red federada: su identificador, su llave X25519 para abrir sobres de red, el
// directorio firmado ya verificado con la raíz fijada y las llaves de cada autoridad que aloja.
import { readFileSync } from 'node:fs';
import { NetworkTrustAnchorSchema } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryAuthority,
  DirectoryNode,
  NetworkTrustAnchor,
} from '@sigilo/contracts';
import { fromBase64Url } from '@sigilo/core';
import { verifySignedDirectory } from '@sigilo/red';
import type { FetchLike } from '@sigilo/red';
import { z } from 'zod';

/** Archivo `red-node-key.json` que genera `npm run red:demo`. */
const NodeBoxKeySchema = z.object({
  version: z.literal(1),
  nodeId: z.string(),
  boxKeyId: z.string(),
  boxPrivateKey: z.string(),
});

/** Archivo `relay-secret.json`: secreto compartido con el enrutador para el buzón de red. */
const RelaySecretSchema = z.object({
  version: z.literal(1),
  nodeId: z.string(),
  secret: z.string(),
});

/** Nodo en la red. */
export interface NodeNetwork {
  nodeId: string;
  /**
   * Secreto compartido con el enrutador: el buzón solo acepta sobres con su etiqueta HMAC, así
   * nadie le entrega sobres sin pasar por el enrutador.
   */
  relaySecret: Uint8Array;
  /** Llave privada X25519 del nodo (su pública es `boxPublicKey` en el directorio). */
  nodeBoxPrivateKey: Uint8Array;
  /** Directorio verificado contra la raíz fijada al arrancar. */
  directory: AuthorityDirectory;
  /** Raíz de confianza fijada con que se verificó el directorio (y verifica el testigo). */
  trust: NetworkTrustAnchor;
  /** Directorio firmado tal como se descargó, para servir una copia en el mismo origen. */
  signedDirectory: unknown;
  /** Origen del enrutador (registro, cabezas, turnados y testigo), o `null` sin enrutador. */
  routerUrl: string | null;
  fetch: FetchLike;
}

/** Llaves públicas de una autoridad, ya decodificadas. */
export interface AuthorityKeys {
  keyId: string;
  boxPublicKey: Uint8Array;
  signingPublicKey: Uint8Array;
}

/** Nodo del directorio que corresponde a este servidor. */
export function ownNode(network: NodeNetwork): DirectoryNode {
  const node = network.directory.nodes.find((item) => item.id === network.nodeId);
  if (node === undefined) throw new Error('El nodo no está en el directorio.');
  return node;
}

/** Autoridad del directorio, o `undefined`. */
export function directoryAuthority(
  network: NodeNetwork,
  authorityId: string,
): DirectoryAuthority | undefined {
  return network.directory.authorities.find((item) => item.id === authorityId);
}

/** Autoridades que el directorio aloja en este nodo. */
export function hostedAuthorities(network: NodeNetwork): DirectoryAuthority[] {
  return network.directory.authorities.filter((item) => item.nodeId === network.nodeId);
}

/** Llaves de una autoridad del directorio. */
export function keysOfDirectoryAuthority(authority: DirectoryAuthority): AuthorityKeys {
  return {
    keyId: authority.keyId,
    boxPublicKey: fromBase64Url(authority.boxPublicKey),
    signingPublicKey: fromBase64Url(authority.signingPublicKey),
  };
}

/** Archivos y origen con los que el nodo entra a la red. */
export interface NetworkFiles {
  nodeId: string;
  nodeBoxKeyFile: string;
  directoryFile: string;
  trustFile: string;
  relaySecretFile: string;
  routerUrl: string | null;
}

function readJson(path: string, what: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`No se pudo leer ${what}.`);
  }
}

/**
 * Carga la red del nodo: verifica el directorio con la raíz fijada (si no verifica, no arranca),
 * comprueba que el nodo está en él y que su llave X25519 es la publicada.
 * Seguridad: las llaves de las autoridades se toman solo de un directorio que verificó; un archivo
 * alterado o con otros testigos hace fallar el arranque.
 */
export function loadNodeNetwork(files: NetworkFiles, fetchImpl: FetchLike): NodeNetwork {
  const trust = NetworkTrustAnchorSchema.parse(readJson(files.trustFile, 'la raíz de la red'));
  const signedDirectory = readJson(files.directoryFile, 'el directorio de la red');
  const verification = verifySignedDirectory(signedDirectory, trust);
  if (!verification.valid) {
    throw new Error(`El directorio de la red no verifica (${verification.reason}).`);
  }
  const key = NodeBoxKeySchema.parse(readJson(files.nodeBoxKeyFile, 'la llave de red del nodo'));
  if (key.nodeId !== files.nodeId) throw new Error('La llave de red es de otro nodo.');
  const relay = RelaySecretSchema.parse(readJson(files.relaySecretFile, 'el secreto del buzón'));
  const relaySecret = fromBase64Url(relay.secret);
  if (relay.nodeId !== files.nodeId || relaySecret.length < 32) {
    throw new Error('El secreto del buzón no es de este nodo o es demasiado corto.');
  }
  const network: NodeNetwork = {
    nodeId: files.nodeId,
    nodeBoxPrivateKey: fromBase64Url(key.boxPrivateKey),
    relaySecret,
    directory: verification.directory,
    trust,
    signedDirectory,
    routerUrl: files.routerUrl,
    fetch: fetchImpl,
  };
  if (ownNode(network).boxKeyId !== key.boxKeyId) {
    throw new Error('La llave de red del nodo no es la del directorio.');
  }
  return network;
}
