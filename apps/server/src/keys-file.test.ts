// Pruebas de validación de keys.json.
import { describe, expect, it } from 'vitest';
import { generateBoxKeyPair, generateSigningKeyPair, keyIdFor, toBase64Url } from '@sigilo/core';
import { parseKeysFile } from './keys-file.ts';
import type { KeysFile } from './keys-file.ts';

function sampleKeysFile(): KeysFile {
  const server = generateSigningKeyPair();
  const box = generateBoxKeyPair();
  const signing = generateSigningKeyPair();
  return {
    version: 1,
    publicKeys: {
      server: {
        keyId: keyIdFor(server.publicKey),
        signingPublicKey: toBase64Url(server.publicKey),
      },
      authority: {
        keyId: keyIdFor(box.publicKey),
        boxPublicKey: toBase64Url(box.publicKey),
        signingPublicKey: toBase64Url(signing.publicKey),
      },
    },
    server: { signingPrivateKey: toBase64Url(server.privateKey) },
  };
}

describe('parseKeysFile', () => {
  it('acepta un archivo coherente', () => {
    const file = sampleKeysFile();
    expect(parseKeysFile(file).publicKeySet).toEqual(file.publicKeys);
  });

  it('rechaza un keyId que no corresponde o una privada ajena', () => {
    const wrongId = sampleKeysFile();
    wrongId.publicKeys.authority.keyId = '0000000000000000';
    expect(() => parseKeysFile(wrongId)).toThrow();
    const wrongPrivate = sampleKeysFile();
    wrongPrivate.server.signingPrivateKey = sampleKeysFile().server.signingPrivateKey;
    expect(() => parseKeysFile(wrongPrivate)).toThrow();
    expect(() => parseKeysFile({ version: 2 })).toThrow();
  });
});
