// Pruebas de las pruebas cifradas en el panel: apertura con la llave propia, con la del nodo o con
// una llave re-cifrada, prueba anterior en claro, digesto alterado y anclaje en la bitácora.
import { describe, expect, it } from 'vitest';
import { NODE_KEY_AUTHORITY_ID } from '@sigilo/contracts';
import type {
  ComplaintDetail,
  EvidenceCustody,
  EvidenceDescriptor,
  LedgerEvent,
  LedgerPage,
} from '@sigilo/contracts';
import {
  buildEvent,
  computeEventHash,
  evidenceReceivedPayload,
  evidenceReceivedPayloadDigest,
  generateBoxKeyPair,
  generateSigningKeyPair,
  grantEvidenceKey,
  keyIdFor,
  sealEvidence,
  sha256Hex,
  signLedgerHead,
} from '@sigilo/core';
import type { AuthorityKeys } from './authority.ts';
import { createTestDeployment } from './test-keys.ts';
import {
  EvidenceUnreadableError,
  grantEvidenceKeysTo,
  openEvidenceWithKey,
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

describe('openEvidenceWithKey y openForAuthority ante datos manipulados', () => {
  it('un contenedor sellado para otro folio no se abre en esta denuncia', async () => {
    const keys = authorityKeys();
    const sealed = await sealEvidence(
      png(),
      { keyId: keys.keyId, publicKey: keys.boxPublicKey },
      { folio: 'PQRS-TVWX-YZ23', authorityId: NODE_KEY_AUTHORITY_ID, mediaType: 'image/png' },
    );
    const { descriptor, detail } = await scenario();
    const moved = { ...descriptor, sha256: sealed.sha256, sizeBytes: sealed.container.length };
    await expect(
      openForAuthority(sealed.container, moved, detail, keys, OWN),
    ).rejects.toBeInstanceOf(EvidenceUnreadableError);
    // Ni siquiera con la llave del archivo a la mano: el folio va en el AAD del cuerpo.
    await expect(
      openEvidenceWithKey(sealed.container, moved, FOLIO, sealed.fileKey),
    ).rejects.toBeInstanceOf(EvidenceUnreadableError);
  });

  it('el digesto del descriptor manda: un contenedor de otro digesto no se descifra', async () => {
    const { sealed, descriptor } = await scenario();
    const other = { ...descriptor, sha256: 'e'.repeat(64) };
    await expect(
      openEvidenceWithKey(sealed.container, other, FOLIO, sealed.fileKey),
    ).rejects.toThrow('El archivo no coincide con su digesto.');
  });

  it('declarar otro tipo de imagen cambia el AAD; descifrar algo que no es imagen se rechaza', async () => {
    const { sealed, descriptor } = await scenario();
    await expect(
      openEvidenceWithKey(
        sealed.container,
        { ...descriptor, mediaType: 'image/jpeg' },
        FOLIO,
        sealed.fileKey,
      ),
    ).rejects.toThrow('No pudimos abrir');
    // Una «PNG» que no empieza con la firma de PNG: el navegador no la muestra.
    const keys = authorityKeys();
    const notPng = new Uint8Array(200).fill(1);
    const fake = await sealEvidence(
      notPng,
      { keyId: keys.keyId, publicKey: keys.boxPublicKey },
      { folio: FOLIO, authorityId: NODE_KEY_AUTHORITY_ID, mediaType: 'image/png' },
    );
    await expect(
      openEvidenceWithKey(
        fake.container,
        { ...descriptor, sha256: fake.sha256, sizeBytes: fake.container.length },
        FOLIO,
        fake.fileKey,
      ),
    ).rejects.toThrow('no es una imagen del tipo declarado');
  });

  it('coincide con lo anclado solo si digesto y compromiso son los anclados', async () => {
    const { sealed, descriptor, custody } = await scenario();
    const open = (anchored?: EvidenceCustody['items']) =>
      openEvidenceWithKey(sealed.container, descriptor, FOLIO, sealed.fileKey, anchored);
    expect((await open(custody.items)).matchesAnchor).toBe(true);
    expect((await open()).matchesAnchor).toBeNull();
    expect((await open([])).matchesAnchor).toBe(false);
    const item = custody.items[0];
    if (item === undefined) throw new Error('Sin prueba anclada.');
    expect((await open([{ ...item, commitment: 'f'.repeat(64) }])).matchesAnchor).toBe(false);
    expect((await open([{ ...item, sha256: 'f'.repeat(64) }])).matchesAnchor).toBe(false);
    expect((await open([{ ...item, evidenceId: 'b'.repeat(32) }])).matchesAnchor).toBe(false);
  });

  it('una prueba en claro que no es imagen o con otro digesto no se muestra', async () => {
    const { keys, descriptor, detail } = await scenario();
    const text = new TextEncoder().encode('no soy una imagen, soy texto con un script');
    await expect(
      openForAuthority(text, { ...descriptor, sha256: sha256Hex(text) }, detail, keys, OWN),
    ).rejects.toThrow('El archivo no coincide con su digesto.');
    await expect(openForAuthority(png(), descriptor, detail, keys, OWN)).rejects.toBeInstanceOf(
      EvidenceUnreadableError,
    );
  });

  it('al re-cifrar hacia otra autoridad salta las pruebas ya borradas o sin descriptor', async () => {
    const { keys, sealed, detail, custody } = await scenario(OWN);
    const target = authorityKeys();
    const item = custody.items[0];
    if (item === undefined) throw new Error('Sin prueba anclada.');
    const withGone = {
      ...detail,
      evidenceCustody: {
        ...custody,
        items: [
          { ...item, isStored: false },
          { ...item, evidenceId: 'c'.repeat(32) },
        ],
      },
    } as ComplaintDetail;
    const fetched: string[] = [];
    const grants = await grantEvidenceKeysTo(
      withGone,
      keys,
      OWN,
      { authorityId: OTHER, recipient: { keyId: target.keyId, publicKey: target.boxPublicKey } },
      (evidenceId) => {
        fetched.push(evidenceId);
        return Promise.resolve(sealed.container);
      },
    );
    expect(grants).toEqual([]);
    expect(fetched).toEqual([]);
  });
});

describe('verifyEvidenceAnchor contra la bitácora publicada', () => {
  async function published() {
    const { detail, custody } = await scenario();
    const deployment = createTestDeployment();
    const received = buildEvent(null, {
      type: 'complaint.received',
      folio: FOLIO,
      at: '2026-11-09',
      actorRole: 'system',
      payload: { folio: FOLIO },
    });
    const anchored = buildEvent(received, {
      type: 'evidence.received',
      folio: FOLIO,
      at: '2026-11-09',
      actorRole: 'system',
      payload: evidenceReceivedPayload(FOLIO, custody.items),
    });
    const events = [received, anchored];
    const head = signLedgerHead(
      {
        seq: anchored.seq,
        hash: anchored.hash,
        at: '2026-11-09',
        serverKeyId: deployment.pinned.set.server.keyId,
      },
      deployment.server.privateKey,
    );
    const withSeq = (seq: number) =>
      ({
        ...detail,
        evidenceCustody: {
          ...custody,
          events: custody.events.map((event) => ({ ...event, seq })),
        },
      }) as ComplaintDetail;
    const fetchFrom =
      (ledger: LedgerEvent[], signed = head) =>
      (from: number, limit: number): Promise<LedgerPage> =>
        Promise.resolve({
          events: ledger.filter((event) => event.seq >= from).slice(0, limit),
          head: signed,
        });
    return { deployment, events, head, withSeq, fetchFrom, anchored };
  }

  it('publicado y en la cadena firmada por la llave fijada: verificado', async () => {
    const { deployment, events, withSeq, fetchFrom, anchored } = await published();
    expect(
      await verifyEvidenceAnchor(withSeq(anchored.seq), fetchFrom(events), deployment.pinned),
    ).toBe('verified');
  });

  it('la cabeza firmada por otra llave, un evento de otro tipo u otra secuencia: no coincide', async () => {
    const { deployment, events, head, withSeq, fetchFrom, anchored } = await published();
    const impostor = createTestDeployment();
    expect(
      await verifyEvidenceAnchor(withSeq(anchored.seq), fetchFrom(events), impostor.pinned),
    ).toBe('mismatch');
    // El servidor dice que el anclaje es el evento 0 (la recepción de la denuncia).
    expect(await verifyEvidenceAnchor(withSeq(0), fetchFrom(events), deployment.pinned)).toBe(
      'mismatch',
    );
    // Una secuencia más allá de la cabeza.
    expect(await verifyEvidenceAnchor(withSeq(9), fetchFrom(events), deployment.pinned)).toBe(
      'mismatch',
    );
    // La bitácora sirve otro evento en esa posición, recalculado pero sin la firma de la cabeza.
    const forged = { ...anchored, payloadDigest: 'f'.repeat(64) };
    forged.hash = computeEventHash(forged);
    expect(
      await verifyEvidenceAnchor(
        withSeq(anchored.seq),
        fetchFrom([events[0] as LedgerEvent, forged]),
        deployment.pinned,
      ),
    ).toBe('mismatch');
    expect(head.seq).toBe(anchored.seq);
  });

  it('sin custodia o sin el evento de recepción: no coincide, sin consultar la bitácora', async () => {
    const { detail, custody } = await scenario();
    const { pinned } = createTestDeployment();
    const unused = () => Promise.reject(new Error('No debe consultar la bitácora.'));
    const without = { ...detail, evidenceCustody: undefined } as unknown as ComplaintDetail;
    expect(await verifyEvidenceAnchor(without, unused, pinned)).toBe('mismatch');
    const noEvent = { ...detail, evidenceCustody: { ...custody, events: [] } } as ComplaintDetail;
    expect(await verifyEvidenceAnchor(noEvent, unused, pinned)).toBe('mismatch');
    // Una prueba de más en el detalle que no está anclada.
    const extra = {
      ...detail,
      evidence: [...detail.evidence, { ...detail.evidence[0], evidenceId: 'd'.repeat(32) }],
    } as ComplaintDetail;
    expect(await verifyEvidenceAnchor(extra, unused, pinned)).toBe('mismatch');
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
