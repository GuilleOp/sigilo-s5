// Pruebas del cifrado de las pruebas: contenedor, AAD con folio y autoridad, compromiso salado,
// llaves re-cifradas dentro del nodo, re-cifrado con la misma sal y anclaje en la bitácora.
import { EVIDENCE_CONTAINER_OVERHEAD } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { fromHex, toBase64Url, toHex } from './encoding.ts';
import {
  EVIDENCE_CONTAINER_MAGIC,
  computeEvidenceCommitment,
  decodeFileKey,
  encodeFileKey,
  evidenceReceivedPayloadDigest,
  grantEvidenceKey,
  openEvidenceBody,
  openEvidenceGrant,
  openEvidenceKey,
  parseEvidenceContainer,
  sealEvidence,
} from './evidence.ts';
import { generateBoxKeyPair, keyIdFor } from './keys.ts';
import { randomBytes } from './random.ts';

const FOLIO = 'ABCD-EFGH-JKMN';
const OTHER_FOLIO = 'PQRS-TVWX-YZ23';
const AUTHORITY = 'authority.oic-prueba';

function recipientOf() {
  const pair = generateBoxKeyPair();
  return { pair, recipient: { keyId: keyIdFor(pair.publicKey), publicKey: pair.publicKey } };
}

const image = () => {
  const bytes = randomBytes(300);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
};

describe('sealEvidence', () => {
  it('cifra hacia la autoridad y solo ella lo abre, con el compromiso comprobado', async () => {
    const { pair, recipient } = recipientOf();
    const plaintext = image();
    const context = { folio: FOLIO, authorityId: AUTHORITY, mediaType: 'image/png' as const };
    const sealed = await sealEvidence(plaintext, recipient, context);
    expect(sealed.container.length).toBe(plaintext.length + EVIDENCE_CONTAINER_OVERHEAD);
    expect(sealed.sha256).toBe(sha256Hex(sealed.container));
    // El nodo solo ve el formato y el compromiso; la imagen no aparece en claro.
    const header = parseEvidenceContainer(sealed.container);
    expect(header?.commitment).toBe(sealed.commitment);
    const needle = toHex(plaintext.subarray(8, 40));
    expect(toHex(sealed.container).includes(needle)).toBe(false);
    const fileKey = await openEvidenceKey(sealed.container, pair.privateKey, recipient.keyId, {
      folio: FOLIO,
      authorityId: AUTHORITY,
    });
    const opened = await openEvidenceBody(sealed.container, fileKey, FOLIO, 'image/png');
    expect(opened.plaintext).toEqual(plaintext);
    expect(computeEvidenceCommitment(opened.salt, opened.plaintext)).toBe(sealed.commitment);
    expect(fileKey).toEqual(sealed.fileKey);
  });

  it('no abre con otra llave, otro folio, otra autoridad u otro tipo', async () => {
    const { pair, recipient } = recipientOf();
    const other = recipientOf();
    const context = { folio: FOLIO, authorityId: AUTHORITY, mediaType: 'image/png' as const };
    const sealed = await sealEvidence(image(), recipient, context);
    const tries = [
      () =>
        openEvidenceKey(sealed.container, other.pair.privateKey, other.recipient.keyId, context),
      () =>
        openEvidenceKey(sealed.container, pair.privateKey, recipient.keyId, {
          folio: OTHER_FOLIO,
          authorityId: AUTHORITY,
        }),
      () =>
        openEvidenceKey(sealed.container, pair.privateKey, recipient.keyId, {
          folio: FOLIO,
          authorityId: 'authority.otra',
        }),
      () => openEvidenceBody(sealed.container, sealed.fileKey, OTHER_FOLIO, 'image/png'),
      () => openEvidenceBody(sealed.container, sealed.fileKey, FOLIO, 'image/jpeg'),
    ];
    for (const attempt of tries) await expect(attempt()).rejects.toThrow('No se pudo abrir');
  });

  it('detecta un compromiso o un cuerpo alterados', async () => {
    const { recipient } = recipientOf();
    const context = { folio: FOLIO, authorityId: AUTHORITY, mediaType: 'image/png' as const };
    const sealed = await sealEvidence(image(), recipient, context);
    const swapped = sealed.container.slice();
    swapped[5] = (swapped[5] ?? 0) ^ 1;
    await expect(openEvidenceBody(swapped, sealed.fileKey, FOLIO, 'image/png')).rejects.toThrow();
    const flipped = sealed.container.slice();
    const last = flipped.length - 1;
    flipped[last] = (flipped[last] ?? 0) ^ 1;
    await expect(openEvidenceBody(flipped, sealed.fileKey, FOLIO, 'image/png')).rejects.toThrow();
  });

  it('con la misma sal, el re-cifrado conserva el compromiso pero no el contenedor', async () => {
    const { recipient } = recipientOf();
    const destination = recipientOf();
    const plaintext = image();
    const sealed = await sealEvidence(plaintext, recipient, {
      folio: FOLIO,
      authorityId: AUTHORITY,
      mediaType: 'image/png',
    });
    const opened = await openEvidenceBody(sealed.container, sealed.fileKey, FOLIO, 'image/png');
    const again = await sealEvidence(
      opened.plaintext,
      destination.recipient,
      { folio: OTHER_FOLIO, authorityId: 'authority.destino', mediaType: 'image/png' },
      opened.salt,
    );
    expect(again.commitment).toBe(sealed.commitment);
    expect(again.sha256).not.toBe(sealed.sha256);
    const fresh = await sealEvidence(plaintext, recipient, {
      folio: FOLIO,
      authorityId: AUTHORITY,
      mediaType: 'image/png',
    });
    // Sin la sal, la misma imagen da otro compromiso: no se puede confirmar con la bitácora.
    expect(fresh.commitment).not.toBe(sealed.commitment);
  });

  it('rechaza contenedores sin formato', () => {
    expect(parseEvidenceContainer(new Uint8Array(400))).toBeNull();
    expect(parseEvidenceContainer(new Uint8Array(10))).toBeNull();
  });
});

describe('contenedores manipulados', () => {
  const context = { folio: FOLIO, authorityId: AUTHORITY, mediaType: 'image/png' as const };

  async function sealedPair() {
    const { pair, recipient } = recipientOf();
    const sealed = await sealEvidence(image(), recipient, context);
    const open = (container: Uint8Array) =>
      openEvidenceKey(container, pair.privateKey, recipient.keyId, context);
    return { sealed, open };
  }

  it('cambiar un solo byte en cualquier parte del contenedor impide abrirlo', async () => {
    const { sealed, open } = await sealedPair();
    // Un byte por región: prefijo, versión, compromiso, enc, llave sellada, sal cifrada, imagen y
    // etiqueta del cuerpo.
    const offsets = [0, 4, 5, 36, 37, 68, 69, 116, 117, 150, sealed.container.length - 1];
    for (const offset of offsets) {
      const tampered = sealed.container.slice();
      tampered[offset] = (tampered[offset] ?? 0) ^ 0x80;
      const opened = (async () => {
        const fileKey = await open(tampered);
        return openEvidenceBody(tampered, fileKey, FOLIO, 'image/png');
      })();
      await expect(opened, `byte ${offset}`).rejects.toThrow('No se pudo abrir');
    }
  });

  it('un cuerpo truncado o con bytes de más no se abre', async () => {
    const { sealed } = await sealedPair();
    const truncated = sealed.container.subarray(0, sealed.container.length - 1);
    const extended = new Uint8Array(sealed.container.length + 1);
    extended.set(sealed.container);
    const headerOnly = sealed.container.subarray(0, EVIDENCE_CONTAINER_OVERHEAD);
    for (const bad of [truncated, extended]) {
      await expect(openEvidenceBody(bad, sealed.fileKey, FOLIO, 'image/png')).rejects.toThrow(
        'No se pudo abrir',
      );
    }
    // Justo la cabecera, la sal y la etiqueta, sin un byte de imagen: no tiene el formato.
    expect(parseEvidenceContainer(headerOnly)).toBeNull();
    await expect(openEvidenceBody(headerOnly, sealed.fileKey, FOLIO, 'image/png')).rejects.toThrow(
      'No se pudo abrir',
    );
  });

  it('otra versión del formato o un prefijo ajeno no es un contenedor', async () => {
    const { sealed, open } = await sealedPair();
    const otherVersion = sealed.container.slice();
    otherVersion[4] = 0x02;
    expect(parseEvidenceContainer(otherVersion)).toBeNull();
    await expect(open(otherVersion)).rejects.toThrow('No se pudo abrir');
    const png = image();
    expect(parseEvidenceContainer(png)).toBeNull();
  });

  it('el cuerpo de una prueba no se abre con la cabecera de otra del mismo folio', async () => {
    const { recipient } = recipientOf();
    const first = await sealEvidence(image(), recipient, context);
    const second = await sealEvidence(image(), recipient, context);
    const header = first.container.subarray(0, 5 + 32 + 32 + 48);
    const body = second.container.subarray(5 + 32 + 32 + 48);
    const spliced = new Uint8Array(header.length + body.length);
    spliced.set(header);
    spliced.set(body, header.length);
    // Ni con la llave de la cabecera ni con la del cuerpo: el compromiso va en el AAD del cuerpo.
    for (const fileKey of [first.fileKey, second.fileKey]) {
      await expect(openEvidenceBody(spliced, fileKey, FOLIO, 'image/png')).rejects.toThrow(
        'No se pudo abrir',
      );
    }
  });

  it('con la llave del archivo correcta pero un compromiso recalculado distinto, falla', async () => {
    // Un nodo malicioso cambia el compromiso de la cabecera por el de otra imagen con otra sal: el
    // AAD del cuerpo ya no coincide.
    const { sealed } = await sealedPair();
    const forged = sealed.container.slice();
    forged.set(
      fromHex(computeEvidenceCommitment(randomBytes(32), image())),
      EVIDENCE_CONTAINER_MAGIC.length,
    );
    await expect(openEvidenceBody(forged, sealed.fileKey, FOLIO, 'image/png')).rejects.toThrow(
      'No se pudo abrir',
    );
  });

  it('rechaza llaves de archivo de otro tamaño, sales de otro tamaño y pruebas vacías', async () => {
    const { sealed } = await sealedPair();
    for (const length of [0, 16, 31, 33]) {
      await expect(
        openEvidenceBody(sealed.container, randomBytes(length), FOLIO, 'image/png'),
      ).rejects.toThrow('No se pudo abrir');
    }
    expect(() => computeEvidenceCommitment(randomBytes(31), image())).toThrow();
    const { recipient } = recipientOf();
    await expect(sealEvidence(new Uint8Array(0), recipient, context)).rejects.toThrow('vacía');
    await expect(sealEvidence(image(), recipient, context, randomBytes(16))).rejects.toThrow();
    await expect(
      grantEvidenceKey(sealed.fileKey, recipient, context, 'no-es-un-digesto'),
    ).rejects.toThrow('compromiso');
    expect(() => decodeFileKey('')).toThrow();
  });

  it('una llave re-cifrada no se abre con otro folio, otra autoridad u otra llave', async () => {
    const { sealed } = await sealedPair();
    const target = recipientOf();
    const other = recipientOf();
    const grantContext = { folio: FOLIO, authorityId: 'authority.destino' };
    const grant = await grantEvidenceKey(
      sealed.fileKey,
      target.recipient,
      grantContext,
      sealed.commitment,
    );
    const tries = [
      () =>
        openEvidenceGrant(
          grant,
          target.pair.privateKey,
          { ...grantContext, folio: OTHER_FOLIO },
          sealed.commitment,
        ),
      () =>
        openEvidenceGrant(
          grant,
          target.pair.privateKey,
          { ...grantContext, authorityId: AUTHORITY },
          sealed.commitment,
        ),
      () => openEvidenceGrant(grant, other.pair.privateKey, grantContext, sealed.commitment),
      () =>
        openEvidenceGrant(
          { ...grant, ct: toBase64Url(randomBytes(48)) },
          target.pair.privateKey,
          grantContext,
          sealed.commitment,
        ),
    ];
    for (const attempt of tries) await expect(attempt()).rejects.toThrow('No se pudo abrir');
  });
});

describe('llaves re-cifradas dentro del nodo', () => {
  it('la autoridad destino abre la llave con su propia llave y el mismo compromiso', async () => {
    const { recipient } = recipientOf();
    const target = recipientOf();
    const sealed = await sealEvidence(image(), recipient, {
      folio: FOLIO,
      authorityId: AUTHORITY,
      mediaType: 'image/png',
    });
    const context = { folio: FOLIO, authorityId: 'authority.destino' };
    const grant = await grantEvidenceKey(
      sealed.fileKey,
      target.recipient,
      context,
      sealed.commitment,
    );
    const fileKey = await openEvidenceGrant(
      grant,
      target.pair.privateKey,
      context,
      sealed.commitment,
    );
    expect(fileKey).toEqual(sealed.fileKey);
    await expect(
      openEvidenceGrant(grant, target.pair.privateKey, context, '0'.repeat(64)),
    ).rejects.toThrow();
  });

  it('codifica la llave del archivo para el sobre de escalamiento', () => {
    const key = randomBytes(32);
    expect(decodeFileKey(encodeFileKey(key))).toEqual(key);
    expect(() => decodeFileKey(toBase64Url(randomBytes(16)))).toThrow();
  });
});

describe('evidenceReceivedPayloadDigest', () => {
  it('es el digesto canónico del folio y de las pruebas en orden', () => {
    const items = [
      { evidenceId: 'a'.repeat(32), sha256: 'b'.repeat(64), commitment: 'c'.repeat(64) },
    ];
    expect(evidenceReceivedPayloadDigest(FOLIO, items)).toBe(
      sha256Hex(canonicalize({ folio: FOLIO, evidence: items })),
    );
  });
});
