// Sobres HPKE (RFC 9180, modo base) hacia llaves públicas X25519 con ChaCha20-Poly1305.
import { CipherSuite, HkdfSha256 } from '@hpke/core';
import { Chacha20Poly1305 } from '@hpke/chacha20poly1305';
import { DhkemX25519HkdfSha256 } from '@hpke/dhkem-x25519';
import { x25519 } from '@noble/curves/ed25519.js';
import { HPKE_SUITE_V1, HpkeEnvelopeSchema } from '@sigilo/contracts';
import type { HpkeEnvelope } from '@sigilo/contracts';
import { fromBase64Url, toBase64Url, utf8Encode } from './encoding.ts';
import { keyIdFor } from './keys.ts';

/** Destinatario de un sobre: llave pública X25519 cruda y su identificador. */
export interface EnvelopeRecipient {
  keyId: string;
  publicKey: Uint8Array;
}

const HPKE_INFO = utf8Encode('sigilo/v1/hpke');
const OPEN_ERROR = 'No se pudo abrir el sobre.';

const suite = new CipherSuite({
  kem: new DhkemX25519HkdfSha256(),
  kdf: new HkdfSha256(),
  aead: new Chacha20Poly1305(),
});

/**
 * Cifra `plaintext` hacia la llave pública del destinatario, autenticando `aad`.
 * Lanza error si `keyId` no corresponde a la llave pública.
 */
export async function sealToPublicKey(
  plaintext: Uint8Array,
  recipient: EnvelopeRecipient,
  aad: Uint8Array,
): Promise<HpkeEnvelope> {
  if (recipient.keyId !== keyIdFor(recipient.publicKey)) {
    throw new Error('El identificador de llave no corresponde a la llave pública.');
  }
  const recipientPublicKey = await suite.kem.deserializePublicKey(recipient.publicKey);
  const { enc, ct } = await suite.seal({ recipientPublicKey, info: HPKE_INFO }, plaintext, aad);
  return {
    v: 1,
    suite: HPKE_SUITE_V1,
    keyId: recipient.keyId,
    enc: toBase64Url(new Uint8Array(enc)),
    ct: toBase64Url(new Uint8Array(ct)),
  };
}

/**
 * Abre un sobre con la llave privada X25519 cruda y la misma `aad` usada al sellar.
 * Seguridad: cualquier fallo (formato, versión, suite, llave, AAD o etiqueta) produce el mismo
 * error genérico para no filtrar en qué paso falló.
 */
export async function openEnvelope(
  envelope: HpkeEnvelope,
  privateKey: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  try {
    const parsed = HpkeEnvelopeSchema.parse(envelope);
    if (parsed.keyId !== keyIdFor(x25519.getPublicKey(privateKey))) {
      throw new Error(OPEN_ERROR);
    }
    const recipientKey = await suite.kem.importKey('raw', new Uint8Array(privateKey).buffer, false);
    const plaintext = await suite.open(
      { recipientKey, enc: fromBase64Url(parsed.enc), info: HPKE_INFO },
      fromBase64Url(parsed.ct),
      aad,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error(OPEN_ERROR);
  }
}
