// Validación de los archivos de llaves del despliegue (`keys.json` y `authority-demo-key.json`),
// cuyos esquemas están en @sigilo/contracts. La comparten el servidor y `scripts/generate-keys.ts`.
import { AuthorityDemoKeySchema, KeysFileSchema, SupervisorDemoKeySchema } from '@sigilo/contracts';
import type { AuthorityDemoKey, PublicKeySet, SupervisorDemoKey } from '@sigilo/contracts';
import {
  assertBoxKeyPair,
  assertSigningKeyPair,
  buildPublicKeySet,
  fromBase64Url,
} from '@sigilo/core';

/** Llaves que usa el servidor en memoria, ya decodificadas. */
export interface ServerKeys {
  publicKeySet: PublicKeySet;
  serverSigningPrivateKey: Uint8Array;
  authoritySigningPublicKey: Uint8Array;
}

const KEY_LENGTH = 32;

function decodeKey(value: string): Uint8Array {
  const bytes = fromBase64Url(value);
  if (bytes.length !== KEY_LENGTH) throw new Error('Llave con longitud inválida.');
  return bytes;
}

function samePublicKeySet(left: PublicKeySet, right: PublicKeySet): boolean {
  return (
    left.server.keyId === right.server.keyId &&
    left.server.signingPublicKey === right.server.signingPublicKey &&
    left.authority.keyId === right.authority.keyId &&
    left.authority.boxPublicKey === right.authority.boxPublicKey &&
    left.authority.signingPublicKey === right.authority.signingPublicKey &&
    left.supervisor?.keyId === right.supervisor?.keyId &&
    left.supervisor?.boxPublicKey === right.supervisor?.boxPublicKey
  );
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
  const serverSigningPublicKey = decodeKey(publicKeys.server.signingPublicKey);
  const authoritySigningPublicKey = decodeKey(publicKeys.authority.signingPublicKey);
  const supervisor = publicKeys.supervisor;
  const expected = buildPublicKeySet({
    serverSigningPublicKey,
    authorityBoxPublicKey: decodeKey(publicKeys.authority.boxPublicKey),
    authoritySigningPublicKey,
    ...(supervisor === undefined
      ? {}
      : { supervisorBoxPublicKey: decodeKey(supervisor.boxPublicKey) }),
  });
  // El keyId de la autoridad identifica su llave de buzón, que es la destinataria de los sobres.
  if (!samePublicKeySet(publicKeys, expected)) {
    throw new Error('Un identificador de llave no corresponde a su llave pública.');
  }
  const serverSigningPrivateKey = decodeKey(server.signingPrivateKey);
  try {
    assertSigningKeyPair({
      publicKey: serverSigningPublicKey,
      privateKey: serverSigningPrivateKey,
    });
  } catch {
    throw new Error('La llave privada del servidor no corresponde a su llave pública.');
  }
  return { publicKeySet: publicKeys, serverSigningPrivateKey, authoritySigningPublicKey };
}

/**
 * Valida `authority-demo-key.json` contra las llaves públicas del despliegue.
 * Lanza error si el formato es inválido, si alguna privada no corresponde a su pública o si las
 * públicas no son las de `publicKeys`.
 */
export function parseAuthorityDemoKey(raw: unknown, publicKeys: PublicKeySet): AuthorityDemoKey {
  const parsed = AuthorityDemoKeySchema.safeParse(raw);
  if (!parsed.success) throw new Error('La llave de la autoridad no tiene el formato esperado.');
  const key = parsed.data;
  assertBoxKeyPair({
    publicKey: decodeKey(key.boxPublicKey),
    privateKey: decodeKey(key.boxPrivateKey),
  });
  assertSigningKeyPair({
    publicKey: decodeKey(key.signingPublicKey),
    privateKey: decodeKey(key.signingPrivateKey),
  });
  const { authority } = publicKeys;
  const isSameAuthority =
    key.keyId === authority.keyId &&
    key.boxPublicKey === authority.boxPublicKey &&
    key.signingPublicKey === authority.signingPublicKey;
  if (!isSameAuthority) {
    throw new Error('La llave de la autoridad no corresponde a las llaves públicas.');
  }
  return key;
}

/**
 * Valida `supervisor-demo-key.json` contra la llave de la supervisora del despliegue.
 * Lanza error si el formato es inválido, si la privada no corresponde a la pública o si no es la
 * de `publicKeys.supervisor`.
 */
export function parseSupervisorDemoKey(raw: unknown, publicKeys: PublicKeySet): SupervisorDemoKey {
  const parsed = SupervisorDemoKeySchema.safeParse(raw);
  if (!parsed.success) throw new Error('La llave de la supervisora no tiene el formato esperado.');
  const key = parsed.data;
  assertBoxKeyPair({
    publicKey: decodeKey(key.boxPublicKey),
    privateKey: decodeKey(key.boxPrivateKey),
  });
  const isSame =
    key.keyId === publicKeys.supervisor?.keyId &&
    key.boxPublicKey === publicKeys.supervisor.boxPublicKey;
  if (!isSame) throw new Error('La llave de la supervisora no corresponde a las llaves públicas.');
  return key;
}
