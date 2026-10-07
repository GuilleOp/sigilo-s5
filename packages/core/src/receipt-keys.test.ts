// Pruebas de la derivación de llaves desde el recibo, con vectores fijos y verificación cruzada con Web Crypto.
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import { fromHex, toBase64Url, toHex, utf8Encode } from './encoding.ts';
import { deriveReceiptKeys } from './receipt-keys.ts';
import { randomBytes } from './random.ts';

const ENTROPY = fromHex('000102030405060708090a');

describe('deriveReceiptKeys', () => {
  it('fija los vectores de regresión', () => {
    const keys = deriveReceiptKeys(ENTROPY);
    expect(toHex(keys.authKey)).toBe(
      'ae34ea2162dc6e3827a6536a40345aa95ed50b30b202b84eaabce19cdee198c4',
    );
    expect(keys.authVerifier).toBe('DzZ9K2ARNLPcxa10AivpU5UUBNjfy5vRGH3x3sqbDEU');
    expect(toHex(keys.box.privateKey)).toBe(
      '55101233479baaf84e16871082f4b48409412d9f5e198a05e7dc71a08f373391',
    );
    expect(toHex(keys.box.publicKey)).toBe(
      'e49e4b72af726ef7b08a0f9b9d3de9b6e8d8adc8e5010151bafb60020a2c041c',
    );
    expect(toHex(keys.signing.privateKey)).toBe(
      'fef756e33b73bb16a68b00b195f8a9b6892994b03b588ca704741e4e00dda183',
    );
    expect(toHex(keys.signing.publicKey)).toBe(
      '5f1a0426a50f06d4499336cd8d603c3d107f1914718ee25d05e726f168d97278',
    );
  });

  it('coincide con HKDF-SHA256 de Web Crypto y SHA-256 del verificador', async () => {
    const keys = deriveReceiptKeys(ENTROPY);
    const base = await crypto.subtle.importKey('raw', new Uint8Array(ENTROPY), 'HKDF', false, [
      'deriveBits',
    ]);
    const expected = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(0),
        info: new Uint8Array(utf8Encode('sigilo/v1/auth')),
      },
      base,
      256,
    );
    expect(keys.authKey).toEqual(new Uint8Array(expected));
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(keys.authKey));
    expect(keys.authVerifier).toBe(toBase64Url(new Uint8Array(digest)));
  });

  it('es determinista, separa contextos y produce pares coherentes', () => {
    const entropy = randomBytes(11);
    const first = deriveReceiptKeys(entropy);
    expect(deriveReceiptKeys(entropy)).toEqual(first);
    const secrets = [first.authKey, first.box.privateKey, first.signing.privateKey].map(toHex);
    expect(new Set(secrets).size).toBe(3);
    expect(first.box.publicKey).toEqual(x25519.getPublicKey(first.box.privateKey));
    expect(first.signing.publicKey).toEqual(ed25519.getPublicKey(first.signing.privateKey));
    const other = new Uint8Array(entropy);
    other[0] = (other[0] ?? 0) ^ 1;
    expect(deriveReceiptKeys(other).authVerifier).not.toBe(first.authVerifier);
  });

  it('rechaza entropía de longitud incorrecta', () => {
    expect(() => deriveReceiptKeys(new Uint8Array(10))).toThrow('11 bytes');
    expect(() => deriveReceiptKeys(new Uint8Array(32))).toThrow('11 bytes');
  });
});
