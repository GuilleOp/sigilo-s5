// Pruebas de generación de pares de llaves e identificadores.
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { KeyIdSchema } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { fromHex } from './encoding.ts';
import { generateBoxKeyPair, generateSigningKeyPair, keyIdFor } from './keys.ts';

describe('pares de llaves', () => {
  it('genera pares X25519 coherentes de 32 bytes', () => {
    const pair = generateBoxKeyPair();
    expect(pair.privateKey).toHaveLength(32);
    expect(pair.publicKey).toEqual(x25519.getPublicKey(pair.privateKey));
    expect(generateBoxKeyPair().privateKey).not.toEqual(pair.privateKey);
  });

  it('genera pares Ed25519 coherentes de 32 bytes', () => {
    const pair = generateSigningKeyPair();
    expect(pair.privateKey).toHaveLength(32);
    expect(pair.publicKey).toEqual(ed25519.getPublicKey(pair.privateKey));
    expect(generateSigningKeyPair().privateKey).not.toEqual(pair.privateKey);
  });
});

describe('keyIdFor', () => {
  it('toma los primeros 16 hex del SHA-256', () => {
    // SHA-256 de 32 bytes en cero: 66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925.
    expect(keyIdFor(new Uint8Array(32))).toBe('66687aadf862bd77');
    const publicKey = fromHex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
    expect(KeyIdSchema.safeParse(keyIdFor(publicKey)).success).toBe(true);
  });
});
