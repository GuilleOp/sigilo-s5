// Pruebas de firmas Ed25519 con el vector 1 de RFC 8032 y casos de manipulación.
import { describe, expect, it } from 'vitest';
import { fromHex, toHex, utf8Encode } from './encoding.ts';
import { generateSigningKeyPair } from './keys.ts';
import { sign, verify } from './signing.ts';

const SECRET = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const PUBLIC = fromHex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
const SIGNATURE =
  'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
  '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

describe('Ed25519', () => {
  it('reproduce el vector 1 de RFC 8032', () => {
    expect(toHex(sign(new Uint8Array(0), SECRET))).toBe(SIGNATURE);
    expect(verify(fromHex(SIGNATURE), new Uint8Array(0), PUBLIC)).toBe(true);
  });

  it('rechaza mensaje, firma o llave alterados', () => {
    const pair = generateSigningKeyPair();
    const message = utf8Encode('evento');
    const signature = sign(message, pair.privateKey);
    expect(verify(signature, message, pair.publicKey)).toBe(true);
    expect(verify(signature, utf8Encode('eventO'), pair.publicKey)).toBe(false);
    const tampered = new Uint8Array(signature);
    tampered[0] = (tampered[0] ?? 0) ^ 1;
    expect(verify(tampered, message, pair.publicKey)).toBe(false);
    expect(verify(signature, message, generateSigningKeyPair().publicKey)).toBe(false);
  });

  it('devuelve false con entradas mal formadas', () => {
    expect(verify(new Uint8Array(10), new Uint8Array(0), PUBLIC)).toBe(false);
    expect(verify(fromHex(SIGNATURE), new Uint8Array(0), new Uint8Array(5))).toBe(false);
  });
});
