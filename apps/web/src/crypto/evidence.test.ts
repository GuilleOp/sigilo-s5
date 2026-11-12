// Pruebas de las pruebas cifradas en el panel: apertura con la llave propia, con la del nodo o con
// una llave re-cifrada, prueba anterior en claro, digesto alterado y anclaje en la bitácora.
import { describe, expect, it } from 'vitest';
import { NODE_KEY_AUTHORITY_ID } from '@sigilo/contracts';
import type { ComplaintDetail, EvidenceCustody, EvidenceDescriptor } from '@sigilo/contracts';
import {
  evidenceReceivedPayloadDigest,
  generateBoxKeyPair,
  generateSigningKeyPair,
  grantEvidenceKey,
  keyIdFor,
  sealEvidence,
  sha256Hex,
} from '@sigilo/core';
import type { AuthorityKeys } from './authority.ts';
import { createTestDeployment } from './test-keys.ts';
import {
  EvidenceUnreadableError,
  grantEvidenceKeysTo,
  openForAuthority,
  verifyEvidenceAnchor,
} from './evidence.ts';

const FOLIO = 'ABCD-EFGH-JKMN';
const OWN = 'authority.oic-prueba';
const OTHER = 'authority.oic-destino';

function authorityKeys(): AuthorityKeys {
  const box = generateBoxKeyPair();
  const signing = generateSigningKeyPair();
  return {
    keyId: keyIdFor(box.publicKey),
    boxPublicKey: box.publicKey,
    boxPrivateKey: box.privateKey,
    signingPublicKey: signing.publicKey,
    signingPrivateKey: signing.privateKey,
  };
}

function png(): Uint8Array {
  const bytes = new Uint8Array(200).fill(4);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

async function scenario(authorityId: string = NODE_KEY_AUTHORITY_ID) {
  const keys = authorityKeys();
  const sealed = await sealEvidence(
    png(),
    { keyId: keys.keyId, publicKey: keys.boxPublicKey },
    { folio: FOLIO, authorityId, mediaType: 'image/png' },
  );
  const descriptor: EvidenceDescriptor = {
    evidenceId: 'a'.repeat(32),
    mediaType: 'image/png',
    sha256: sealed.sha256,
    sizeBytes: sealed.container.length,
  };
  const items = [
    {
      evidenceId: descriptor.evidenceId,
      sha256: sealed.sha256,
      commitment: sealed.commitment,
      isStored: true,
    },
  ];
  const custody: EvidenceCustody = {
    items,
    events: [
      {
        type: 'evidence.received',
        on: '2026-11-09',
        payloadDigest: evidenceReceivedPayloadDigest(FOLIO, items),
      },
    ],
    keyGrants: [],
  };
  const detail = {
    summary: { folio: FOLIO },
    evidence: [descriptor],
    evidenceCustody: custody,
  } as unknown as ComplaintDetail;
  return { keys, sealed, descriptor, detail, custody };
}

describe('openForAuthority', () => {
  it('abre con la llave del nodo y comprueba el anclaje', async () => {
    const { keys, sealed, descriptor, detail } = await scenario();
    const opened = await openForAuthority(sealed.container, descriptor, detail, keys, OWN);
    expect(opened.plaintext).toEqual(png());
    expect(opened.matchesAnchor).toBe(true);
    expect(opened.blob.type).toBe('image/png');
  });

  it('abre con una llave re-cifrada hacia la autoridad de la sesión', async () => {
    const { keys, sealed, descriptor, detail } = await scenario(OWN);
    const target = authorityKeys();
    const grants = await grantEvidenceKeysTo(
      detail,
      keys,
      OWN,
      { authorityId: OTHER, recipient: { keyId: target.keyId, publicKey: target.boxPublicKey } },
      () => Promise.resolve(sealed.container),
    );
    expect(grants).toHaveLength(1);
    // Sin la llave re-cifrada, la autoridad destino no puede abrirla.
    await expect(
      openForAuthority(sealed.container, descriptor, detail, target, OTHER),
    ).rejects.toBeInstanceOf(EvidenceUnreadableError);
    const withGrant = {
      ...detail,
      evidenceCustody: { ...detail.evidenceCustody, keyGrants: grants },
    } as ComplaintDetail;
    const opened = await openForAuthority(sealed.container, descriptor, withGrant, target, OTHER);
    expect(opened.plaintext).toEqual(png());
  });

  it('no abre una llave re-cifrada hacia otra autoridad', async () => {
    const { keys, sealed, descriptor, detail } = await scenario(OWN);
    const target = authorityKeys();
    const envelope = await grantEvidenceKey(
      sealed.fileKey,
      { keyId: target.keyId, publicKey: target.boxPublicKey },
      { folio: FOLIO, authorityId: 'authority.tercera' },
      sealed.commitment,
    );
    const forged = {
      ...detail,
      evidenceCustody: {
        ...detail.evidenceCustody,
        keyGrants: [{ evidenceId: descriptor.evidenceId, authorityId: OTHER, envelope }],
      },
    } as ComplaintDetail;
    await expect(
      openForAuthority(sealed.container, descriptor, forged, target, OTHER),
    ).rejects.toThrow();
    expect(keys.keyId).not.toBe(target.keyId);
  });

  it('rechaza un contenedor alterado y muestra marcada una prueba anterior en claro', async () => {
    const { keys, sealed, descriptor, detail } = await scenario();
    const altered = sealed.container.slice();
    altered[altered.length - 1] = (altered[altered.length - 1] ?? 0) ^ 1;
    await expect(openForAuthority(altered, descriptor, detail, keys, OWN)).rejects.toBeInstanceOf(
      EvidenceUnreadableError,
    );
    const legacy = png();
    const legacyDescriptor = { ...descriptor, sha256: sha256Hex(legacy), sizeBytes: legacy.length };
    const opened = await openForAuthority(legacy, legacyDescriptor, detail, keys, OWN);
    expect(opened.isLegacy).toBe(true);
    expect(opened.matchesAnchor).toBeNull();
  });
});

describe('verifyEvidenceAnchor', () => {
  const unused = () => Promise.reject(new Error('No debe consultar la bitácora.'));

  it('queda pendiente mientras el evento no se publica y detecta lo que no coincide', async () => {
    const { detail, custody } = await scenario();
    const { pinned } = createTestDeployment();
    expect(await verifyEvidenceAnchor(detail, unused, pinned)).toBe('pending');
    const otherItems = custody.items.map((item) => ({ ...item, commitment: 'f'.repeat(64) }));
    const tampered = {
      ...detail,
      evidenceCustody: { ...custody, items: otherItems },
    } as ComplaintDetail;
    expect(await verifyEvidenceAnchor(tampered, unused, pinned)).toBe('mismatch');
    const swapped = {
      ...detail,
      evidence: [{ ...detail.evidence[0], sha256: 'e'.repeat(64) }],
    } as ComplaintDetail;
    expect(await verifyEvidenceAnchor(swapped, unused, pinned)).toBe('mismatch');
  });
});
