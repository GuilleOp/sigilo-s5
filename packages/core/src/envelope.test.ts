// Pruebas de sobres HPKE: ida y vuelta, vector fijo y manipulación.
import { HPKE_SUITE_V1, HpkeEnvelopeSchema } from '@sigilo/contracts';
import type { HpkeEnvelope } from '@sigilo/contracts';
import { x25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url, utf8Decode, utf8Encode } from './encoding.ts';
import { envelopePlaintextLength, openEnvelope, sealToPublicKey } from './envelope.ts';
import { generateBoxKeyPair, keyIdFor } from './keys.ts';

const OPEN_ERROR = 'No se pudo abrir el sobre.';

// Llave privada de Alice en RFC 7748 (solo para pruebas).
const FIXED_PRIVATE_KEY = fromHex(
  '77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a',
);
const FIXED_ENVELOPE: HpkeEnvelope = {
  v: 1,
  suite: HPKE_SUITE_V1,
  keyId: '300c9c9603b92a4b',
  enc: 'd9rymMJmyTI66SpjoQEpT289aN5dBghUGvVUUMln_3U',
  ct: 'qNFZD2uDRLBxZJghu75F7l9PDBXLgvAoqW5M_w2QwFTHEAJS2w',
};

function recipientFor(publicKey: Uint8Array) {
  return { keyId: keyIdFor(publicKey), publicKey };
}

function flipFirstBit(encoded: string): string {
  const bytes = fromBase64Url(encoded);
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return toBase64Url(bytes);
}

describe('sobres HPKE', () => {
  it('hace ida y vuelta y cumple el esquema', async () => {
    const pair = generateBoxKeyPair();
    const aad = utf8Encode('contexto');
    const envelope = await sealToPublicKey(utf8Encode('hola'), recipientFor(pair.publicKey), aad);
    expect(HpkeEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(envelope.suite).toBe(HPKE_SUITE_V1);
    expect(utf8Decode(await openEnvelope(envelope, pair.privateKey, aad))).toBe('hola');
  });

  it('abre el vector fijo de regresión', async () => {
    expect(keyIdFor(x25519.getPublicKey(FIXED_PRIVATE_KEY))).toBe(FIXED_ENVELOPE.keyId);
    const plaintext = await openEnvelope(FIXED_ENVELOPE, FIXED_PRIVATE_KEY, utf8Encode('aad-fija'));
    expect(utf8Decode(plaintext)).toBe('vector fijo de SIGILO');
  });

  it('cifra de forma aleatoria', async () => {
    const pair = generateBoxKeyPair();
    const recipient = recipientFor(pair.publicKey);
    const first = await sealToPublicKey(new Uint8Array(4), recipient, new Uint8Array(0));
    const second = await sealToPublicKey(new Uint8Array(4), recipient, new Uint8Array(0));
    expect(first.enc).not.toBe(second.enc);
    expect(first.ct).not.toBe(second.ct);
  });

  it('rechaza con error genérico cualquier manipulación', async () => {
    const aad = utf8Encode('aad-fija');
    const tampered: HpkeEnvelope[] = [
      { ...FIXED_ENVELOPE, ct: flipFirstBit(FIXED_ENVELOPE.ct) },
      { ...FIXED_ENVELOPE, enc: flipFirstBit(FIXED_ENVELOPE.enc) },
      { ...FIXED_ENVELOPE, ct: FIXED_ENVELOPE.ct.slice(0, -2) },
      { ...FIXED_ENVELOPE, keyId: '0000000000000000' },
      { ...FIXED_ENVELOPE, v: 2 } as unknown as HpkeEnvelope,
      { ...FIXED_ENVELOPE, suite: 'otra' } as unknown as HpkeEnvelope,
      { ...FIXED_ENVELOPE, ct: '***' },
    ];
    for (const envelope of tampered) {
      await expect(openEnvelope(envelope, FIXED_PRIVATE_KEY, aad)).rejects.toThrow(OPEN_ERROR);
    }
    await expect(
      openEnvelope(FIXED_ENVELOPE, FIXED_PRIVATE_KEY, utf8Encode('otra')),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza la llave equivocada aunque se falsifique el keyId', async () => {
    const wrong = generateBoxKeyPair();
    const aad = utf8Encode('aad-fija');
    await expect(openEnvelope(FIXED_ENVELOPE, wrong.privateKey, aad)).rejects.toThrow(OPEN_ERROR);
    const relabeled = { ...FIXED_ENVELOPE, keyId: keyIdFor(wrong.publicKey) };
    await expect(openEnvelope(relabeled, wrong.privateKey, aad)).rejects.toThrow(OPEN_ERROR);
    await expect(openEnvelope(FIXED_ENVELOPE, new Uint8Array(3), aad)).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza un keyId que no corresponde a la llave al sellar', async () => {
    const pair = generateBoxKeyPair();
    await expect(
      sealToPublicKey(
        new Uint8Array(1),
        { keyId: '0000000000000000', publicKey: pair.publicKey },
        new Uint8Array(0),
      ),
    ).rejects.toThrow('identificador de llave');
  });
});

describe('envelopePlaintextLength', () => {
  it('calcula la longitud del texto en claro sin abrir el sobre', async () => {
    expect(envelopePlaintextLength(FIXED_ENVELOPE)).toBe(
      fromBase64Url(FIXED_ENVELOPE.ct).length - 16,
    );
    const pair = generateBoxKeyPair();
    const sealed = await sealToPublicKey(
      new Uint8Array(100),
      recipientFor(pair.publicKey),
      new Uint8Array(0),
    );
    expect(envelopePlaintextLength(sealed)).toBe(100);
  });

  it('devuelve null con enc de otra longitud, ct corto o Base64URL no canónico', () => {
    expect(envelopePlaintextLength({ ...FIXED_ENVELOPE, enc: 'AAAA' })).toBeNull();
    expect(envelopePlaintextLength({ ...FIXED_ENVELOPE, ct: 'AAAA' })).toBeNull();
    expect(envelopePlaintextLength({ ...FIXED_ENVELOPE, ct: 'A' })).toBeNull();
  });
});
