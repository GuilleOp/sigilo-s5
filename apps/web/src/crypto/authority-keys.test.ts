// Llave del panel de autoridad: con un solo nodo, la fijada del bundle; en la red, la propia de la
// autoridad de la cuenta según el directorio verificado (el buzón general sigue con la del buzón).
// Y «Crear mis llaves»: el par generado tiene el formato que importa el panel.
import { describe, expect, it } from 'vitest';
import { AuthorityDemoKeySchema } from '@sigilo/contracts';
import type { AuthorityDirectory, ComplaintDetail, OpenIdentityResponse } from '@sigilo/contracts';
import {
  buildPublicKeySet,
  fromBase64Url,
  generateBoxKeyPair,
  generateSigningKeyPair,
  keyIdFor,
  toBase64Url,
} from '@sigilo/core';
import type { KeyPair } from '@sigilo/core';
import { createNetworkFixture } from '../../../../packages/red/src/test-fixtures.ts';
import { parsePinnedKeys } from '../config/pinned-keys.ts';
import type { NetworkState } from '../network/directory.ts';
import {
  assertAuthorityKeyFor,
  importAuthorityKey,
  KEY_MISMATCH,
  openSealedIdentity,
  readAuthorityKeyFile,
  SealedForOtherKeyError,
} from './authority.ts';
import {
  generateAuthorityKeys,
  groupsOfFour,
  padlockFingerprint,
  toKeyFileText,
} from './authority-keygen.ts';

const INBOX_ACCOUNT = 'authority.buzon-federal';
const OIC = 'authority.oic-iffe';
const OIC_NAME = 'Órgano Interno de Control en el Instituto Federal Ficticio de Equipamiento';

function keyFile(box: KeyPair, signing: KeyPair): string {
  return JSON.stringify({
    version: 1,
    keyId: keyIdFor(box.publicKey),
    boxPublicKey: toBase64Url(box.publicKey),
    boxPrivateKey: toBase64Url(box.privateKey),
    signingPublicKey: toBase64Url(signing.publicKey),
    signingPrivateKey: toBase64Url(signing.privateKey),
  });
}

/** Nodo Federal sintético: directorio verificado, llave del buzón fijada y sus archivos de llave. */
function federalNode() {
  const { keys, signed } = createNetworkFixture();
  const inbox = { box: generateBoxKeyPair(), signing: generateSigningKeyPair() };
  const pinned = parsePinnedKeys(
    buildPublicKeySet({
      serverSigningPublicKey: keys.nodes['node.federal'].signing.publicKey,
      authorityBoxPublicKey: inbox.box.publicKey,
      authoritySigningPublicKey: inbox.signing.publicKey,
    }),
  );
  const network: NetworkState = { kind: 'verified', directory: signed.directory };
  const authorityFile = (id: keyof typeof keys.authorities) =>
    keyFile(keys.authorities[id].box, keys.authorities[id].signing);
  return { keys, pinned, network, inboxFile: keyFile(inbox.box, inbox.signing), authorityFile };
}

describe('assertAuthorityKeyFor', () => {
  it('con un solo nodo acepta solo la llave fijada del bundle', () => {
    const { pinned, inboxFile, authorityFile } = federalNode();
    const single: NetworkState = { kind: 'single-node' };
    expect(() =>
      assertAuthorityKeyFor(readAuthorityKeyFile(inboxFile), OIC, single, pinned),
    ).not.toThrow();
    expect(() =>
      assertAuthorityKeyFor(readAuthorityKeyFile(authorityFile(OIC)), OIC, single, pinned),
    ).toThrow(KEY_MISMATCH.deployment);
    // Compatibilidad: `importAuthorityKey` sigue siendo el perfil de un solo nodo.
    expect(importAuthorityKey(inboxFile, pinned).keyId).toBe(pinned.set.authority.keyId);
    expect(() => importAuthorityKey(authorityFile(OIC), pinned)).toThrow(KEY_MISMATCH.deployment);
  });

  it('en la red acepta la llave propia de la autoridad de la cuenta según el directorio', () => {
    const { pinned, network, authorityFile } = federalNode();
    const keys = readAuthorityKeyFile(authorityFile(OIC));
    expect(() => assertAuthorityKeyFor(keys, OIC, network, pinned)).not.toThrow();
  });

  it('rechaza la llave del buzón del nodo en una cuenta de una autoridad del directorio', () => {
    const { pinned, network, inboxFile } = federalNode();
    const keys = readAuthorityKeyFile(inboxFile);
    expect(() => assertAuthorityKeyFor(keys, OIC, network, pinned)).toThrow(
      /llave del buzón general del nodo.*importa la llave propia/,
    );
  });

  it('rechaza la llave de otra autoridad y dice de quién es', () => {
    const { pinned, network, authorityFile } = federalNode();
    const keys = readAuthorityKeyFile(authorityFile('authority.oic-dfps'));
    expect(() => assertAuthorityKeyFor(keys, OIC, network, pinned)).toThrow(
      `Esta llave es de «Órgano Interno de Control en la Delegación Federal Ficticia de Programas Sociales», no de «${OIC_NAME}», la autoridad de tu cuenta.`,
    );
  });

  it('rechaza una llave que no está en el directorio', () => {
    const { pinned, network } = federalNode();
    const stray = readAuthorityKeyFile(keyFile(generateBoxKeyPair(), generateSigningKeyPair()));
    expect(() => assertAuthorityKeyFor(stray, OIC, network, pinned)).toThrow(
      `Esta llave no corresponde a «${OIC_NAME}» en el directorio firmado de la red.`,
    );
  });

  it('rechaza una llave con la de cifrado del directorio pero otra de firma', () => {
    const { keys, pinned, network } = federalNode();
    const mixed = readAuthorityKeyFile(
      keyFile(keys.authorities[OIC].box, generateSigningKeyPair()),
    );
    expect(() => assertAuthorityKeyFor(mixed, OIC, network, pinned)).toThrow(/no corresponde/);
  });

  it('la cuenta del buzón general (fuera del directorio) sigue con la llave del buzón', () => {
    const { pinned, network, inboxFile, authorityFile } = federalNode();
    expect(() =>
      assertAuthorityKeyFor(readAuthorityKeyFile(inboxFile), INBOX_ACCOUNT, network, pinned),
    ).not.toThrow();
    expect(() =>
      assertAuthorityKeyFor(
        readAuthorityKeyFile(authorityFile(OIC)),
        INBOX_ACCOUNT,
        network,
        pinned,
      ),
    ).toThrow(
      `Esta llave es de «${OIC_NAME}». La cuenta del buzón general usa la llave del buzón del nodo.`,
    );
  });

  it('sin directorio verificado solo acepta la llave fijada del buzón', () => {
    const { pinned, inboxFile, authorityFile } = federalNode();
    for (const state of [
      { kind: 'unavailable' },
      { kind: 'invalid', reason: 'rollback' },
    ] as NetworkState[]) {
      expect(() =>
        assertAuthorityKeyFor(readAuthorityKeyFile(inboxFile), OIC, state, pinned),
      ).not.toThrow();
      expect(() =>
        assertAuthorityKeyFor(readAuthorityKeyFile(authorityFile(OIC)), OIC, state, pinned),
      ).toThrow(KEY_MISMATCH.unverified);
    }
  });
});

describe('openSealedIdentity', () => {
  it('avisa con claridad si la identidad se selló hacia otra llave', async () => {
    const { authorityFile } = federalNode();
    const keys = readAuthorityKeyFile(authorityFile(OIC));
    const response = {
      openingId: 'a'.repeat(32),
      sealedIdentity: { v: 1, suite: 'x', keyId: '0'.repeat(16), enc: 'AA', ct: 'AA' },
    } as unknown as OpenIdentityResponse;
    await expect(openSealedIdentity(response, {} as ComplaintDetail, keys)).rejects.toBeInstanceOf(
      SealedForOtherKeyError,
    );
  });
});

describe('generateAuthorityKeys', () => {
  it('genera un archivo que el panel importa y un candado con sus llaves públicas', () => {
    const generated = generateAuthorityKeys();
    const file = AuthorityDemoKeySchema.parse(JSON.parse(toKeyFileText(generated.privateFile)));
    const keys = readAuthorityKeyFile(toKeyFileText(file));
    expect(keys.keyId).toBe(keyIdFor(keys.boxPublicKey));
    expect(generated.padlock).toEqual({
      keyId: file.keyId,
      boxPublicKey: file.boxPublicKey,
      signingPublicKey: file.signingPublicKey,
    });
    // El candado no lleva nada privado.
    expect(toKeyFileText(generated.padlock)).not.toMatch(/Private/);
  });

  it('cada par es nuevo y su huella son 16 caracteres en grupos de 4', () => {
    const first = generateAuthorityKeys();
    const second = generateAuthorityKeys();
    expect(first.padlock.keyId).not.toBe(second.padlock.keyId);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
    expect(first.fingerprint).not.toBe(second.fingerprint);
  });

  it('la huella cambia si cambia la llave de firma, aunque el keyId sea el mismo', () => {
    const { padlock, fingerprint } = generateAuthorityKeys();
    const box = fromBase64Url(padlock.boxPublicKey);
    expect(padlockFingerprint(box, fromBase64Url(padlock.signingPublicKey))).toBe(fingerprint);
    expect(padlockFingerprint(box, generateSigningKeyPair().publicKey)).not.toBe(fingerprint);
    expect(groupsOfFour('0123456789abcdef')).toBe('0123 4567 89ab cdef');
  });

  it('con su candado en el directorio, el panel acepta la llave generada', () => {
    const { pinned, network } = federalNode();
    if (network.kind !== 'verified') throw new Error('Se esperaba un directorio verificado.');
    const generated = generateAuthorityKeys();
    const directory: AuthorityDirectory = {
      ...network.directory,
      authorities: network.directory.authorities.map((item) =>
        item.id === OIC ? { ...item, ...generated.padlock } : item,
      ),
    };
    const keys = readAuthorityKeyFile(toKeyFileText(generated.privateFile));
    expect(() =>
      assertAuthorityKeyFor(keys, OIC, { kind: 'verified', directory }, pinned),
    ).not.toThrow();
  });
});
