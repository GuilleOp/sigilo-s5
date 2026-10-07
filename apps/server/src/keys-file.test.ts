// Pruebas de validación de keys.json y authority-demo-key.json.
import { describe, expect, it } from 'vitest';
import type { AuthorityDemoKey, KeysFile } from '@sigilo/contracts';
import {
  buildPublicKeySet,
  generateBoxKeyPair,
  generateSigningKeyPair,
  toBase64Url,
} from '@sigilo/core';
import { parseAuthorityDemoKey, parseKeysFile } from './keys-file.ts';

function sampleFiles(): { keysFile: KeysFile; authority: AuthorityDemoKey } {
  const server = generateSigningKeyPair();
  const box = generateBoxKeyPair();
  const signing = generateSigningKeyPair();
  const publicKeys = buildPublicKeySet({
    serverSigningPublicKey: server.publicKey,
    authorityBoxPublicKey: box.publicKey,
    authoritySigningPublicKey: signing.publicKey,
  });
  return {
    keysFile: {
      version: 1,
      publicKeys,
      server: { signingPrivateKey: toBase64Url(server.privateKey) },
    },
    authority: {
      version: 1,
      keyId: publicKeys.authority.keyId,
      boxPublicKey: toBase64Url(box.publicKey),
      boxPrivateKey: toBase64Url(box.privateKey),
      signingPublicKey: toBase64Url(signing.publicKey),
      signingPrivateKey: toBase64Url(signing.privateKey),
    },
  };
}

describe('parseKeysFile', () => {
  it('acepta un archivo coherente', () => {
    const { keysFile } = sampleFiles();
    expect(parseKeysFile(keysFile).publicKeySet).toEqual(keysFile.publicKeys);
  });

  it('rechaza un keyId que no corresponde o una privada ajena', () => {
    const wrongId = sampleFiles().keysFile;
    wrongId.publicKeys.authority.keyId = '0000000000000000';
    expect(() => parseKeysFile(wrongId)).toThrow('identificador');
    const wrongPrivate = sampleFiles().keysFile;
    wrongPrivate.server.signingPrivateKey = sampleFiles().keysFile.server.signingPrivateKey;
    expect(() => parseKeysFile(wrongPrivate)).toThrow('no corresponde');
    expect(() => parseKeysFile({ version: 2 })).toThrow('formato');
  });
});

describe('parseAuthorityDemoKey', () => {
  it('acepta la llave que corresponde a las públicas del despliegue', () => {
    const { keysFile, authority } = sampleFiles();
    expect(parseAuthorityDemoKey(authority, keysFile.publicKeys)).toEqual(authority);
  });

  it('rechaza privadas ajenas, otra autoridad o formato inválido', () => {
    const { keysFile, authority } = sampleFiles();
    const other = sampleFiles().authority;
    expect(() =>
      parseAuthorityDemoKey(
        { ...authority, boxPrivateKey: other.boxPrivateKey },
        keysFile.publicKeys,
      ),
    ).toThrow('no corresponde');
    expect(() =>
      parseAuthorityDemoKey(
        { ...authority, signingPrivateKey: other.signingPrivateKey },
        keysFile.publicKeys,
      ),
    ).toThrow('no corresponde');
    expect(() => parseAuthorityDemoKey(other, keysFile.publicKeys)).toThrow('públicas');
    expect(() => parseAuthorityDemoKey({ version: 1 }, keysFile.publicKeys)).toThrow('formato');
  });
});
