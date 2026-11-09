// «Crear mis llaves»: la autoridad genera en su navegador su par de llaves (cifrado X25519 y firma
// Ed25519) con las mismas primitivas de @sigilo/core que el resto del proyecto. La privada se
// descarga como archivo; la pública («candado») se entrega por oficio para el directorio firmado.
import type { AuthorityDemoKey } from '@sigilo/contracts';
import {
  generateBoxKeyPair,
  generateSigningKeyPair,
  keyIdFor,
  padlockFingerprint,
  toBase64Url,
} from '@sigilo/core';

// La huella vive en @sigilo/core porque el servidor y la bandeja de operación la recalculan.
export { groupsOfFour, padlockFingerprint } from '@sigilo/core';

/** Parte pública que se agrega a la entrada de la autoridad en el directorio firmado. */
export interface AuthorityPadlock {
  keyId: string;
  boxPublicKey: string;
  signingPublicKey: string;
}

/** Par recién generado: el archivo privado (formato `AuthorityDemoKeySchema`) y su candado. */
export interface GeneratedAuthorityKeys {
  privateFile: AuthorityDemoKey;
  padlock: AuthorityPadlock;
  /** Huella corta legible del candado, para confirmarlo por teléfono. */
  fingerprint: string;
}

/**
 * Genera un par de llaves de autoridad nuevo.
 * Seguridad: todo ocurre en este navegador y nada se envía. Las privadas en bytes se borran al
 * terminar; solo quedan en el texto del archivo que la persona descarga.
 */
export function generateAuthorityKeys(): GeneratedAuthorityKeys {
  const box = generateBoxKeyPair();
  const signing = generateSigningKeyPair();
  try {
    const padlock: AuthorityPadlock = {
      keyId: keyIdFor(box.publicKey),
      boxPublicKey: toBase64Url(box.publicKey),
      signingPublicKey: toBase64Url(signing.publicKey),
    };
    const privateFile: AuthorityDemoKey = {
      version: 1,
      keyId: padlock.keyId,
      boxPublicKey: padlock.boxPublicKey,
      boxPrivateKey: toBase64Url(box.privateKey),
      signingPublicKey: padlock.signingPublicKey,
      signingPrivateKey: toBase64Url(signing.privateKey),
    };
    return {
      privateFile,
      padlock,
      fingerprint: padlockFingerprint(box.publicKey, signing.publicKey),
    };
  } finally {
    box.privateKey.fill(0);
    signing.privateKey.fill(0);
  }
}

/** Texto JSON de un archivo de llave o de un candado, con el formato de `.red-demo/`. */
export function toKeyFileText(value: AuthorityDemoKey | AuthorityPadlock): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
