// Pruebas del buzón: firma del remitente, AAD ligado a folio y remitente, y relleno a 512 bytes.
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url } from './encoding.ts';
import { generateBoxKeyPair, generateSigningKeyPair, keyIdFor } from './keys.ts';
import { openMailboxMessage, sealMailboxMessage } from './mailbox.ts';
import type { MailboxBinding, SealedMailboxMessage } from './mailbox.ts';
import { deriveReceiptKeys } from './receipt-keys.ts';

const OPEN_ERROR = 'No se pudo abrir el sobre.';
const BINDING: MailboxBinding = { folio: '0123-4567-89AB', from: 'authority' };

// Mensaje fijo: de la autoridad (semilla del vector 1 de RFC 8032) a las llaves del recibo 00..0a.
const FIXED_MESSAGE: SealedMailboxMessage = {
  envelope: {
    v: 1,
    suite: 'DHKEM-X25519-HKDF-SHA256/HKDF-SHA256/ChaCha20Poly1305',
    keyId: '6069014c26a2d9aa',
    enc: 'Nzrz0oXv5AeslnHwo-qwB2RvonsPGL3IfFLw6aSBKBM',
    ct: '_Ej4jva1nJmCeerknbmUmxmcdFX27ni1_iJwI1JdB0oRy5kqlsjFGHDHRfDqZvrxwYKg5P5RRX-1s5UqIW9ifUsK6yO0NeR0n7S4AvjF5edBOFFQRf8bqZszfk98LoilmUghm7cqgfSKsONu94AlqcSVOSp3rufP4Hut4SoUVH_3A4bj6AiF1lqHQeVcCff51k17gLJml7BQQYvExJbJQxSKVkY_cbUPZ9_MKSPoeo1GVfFVFcHjNEJY0j9WzwYHRciqt-Rtj0kBHs0FqU7hTLooglt3B2Pan5GG0idXhxdCQdMMooVNGd5HTvNYfkx-VNEktGC6Kk-RkWpdB5eELcCPCbcvfYozovUjQV_RjIqPsgj_RoEO3D8J-bqj3OHk8Tji0zfIzIAg1SnMkfInuXOpAOWK6-NsfEL_Dlbf7PkS5wdnhq7T5Ncza9V_u7q_JWXblv2GGZI-Yku5BDXsdZckIoyrHzhtK5rSTbSiLRtTNQa81t5UkjyAphdZXG9hBd80cWu2Jph-AsjPAXSfXhkCd2RdVAwc6eEzBlovtHyG_XA7l53pM_pfqotSL5uVn08TQjcT3M3WZ4WFxuI4LUyRqbq-FGLfjBRiC5_PTCVK9f_N90WX7geBX5YCHjgAy8F5ZImGgktimnROQ-L5UAwoWsT47HgKNPS_1RodZxf5_xjNkCsfAA620AwPxx4k',
  },
  signature:
    '7n-iJ2l4xmcR7VKw-3YW923giTw_bZcaYGoqTHqW99cTGJnK6sGNJ895X2qGITSGuMLISkUvDFV5IAdsDdlSBw',
};
const FIXED_SENDER_PUBLIC = fromHex(
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
);

function setup() {
  const recipient = generateBoxKeyPair();
  const sender = generateSigningKeyPair();
  return {
    recipient,
    sender,
    target: { keyId: keyIdFor(recipient.publicKey), publicKey: recipient.publicKey },
  };
}

function flipFirstBit(encoded: string): string {
  const bytes = fromBase64Url(encoded);
  bytes[0] = (bytes[0] ?? 0) ^ 1;
  return toBase64Url(bytes);
}

describe('buzón', () => {
  it('hace ida y vuelta con relleno a 512 bytes', async () => {
    const { recipient, sender, target } = setup();
    const message = await sealMailboxMessage(
      '¿Puede ampliar los hechos?',
      target,
      sender.privateKey,
      BINDING,
    );
    // 512 bytes de texto en claro más 16 de etiqueta.
    expect(fromBase64Url(message.envelope.ct)).toHaveLength(528);
    const text = await openMailboxMessage(message, recipient.privateKey, sender.publicKey, BINDING);
    expect(text).toBe('¿Puede ampliar los hechos?');
    const long = await sealMailboxMessage('x'.repeat(600), target, sender.privateKey, BINDING);
    expect(fromBase64Url(long.envelope.ct)).toHaveLength(1040);
  });

  it('abre el vector fijo de regresión', async () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const text = await openMailboxMessage(
      FIXED_MESSAGE,
      reporter.box.privateKey,
      FIXED_SENDER_PUBLIC,
      BINDING,
    );
    expect(text).toBe('Mensaje fijo');
  });

  it('rechaza firma alterada, remitente equivocado o sobre alterado', async () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const key = reporter.box.privateKey;
    const cases: SealedMailboxMessage[] = [
      { ...FIXED_MESSAGE, signature: flipFirstBit(FIXED_MESSAGE.signature) },
      {
        ...FIXED_MESSAGE,
        envelope: { ...FIXED_MESSAGE.envelope, ct: flipFirstBit(FIXED_MESSAGE.envelope.ct) },
      },
      {
        ...FIXED_MESSAGE,
        envelope: { ...FIXED_MESSAGE.envelope, enc: flipFirstBit(FIXED_MESSAGE.envelope.enc) },
      },
      { ...FIXED_MESSAGE, signature: '***' },
    ];
    for (const message of cases) {
      await expect(openMailboxMessage(message, key, FIXED_SENDER_PUBLIC, BINDING)).rejects.toThrow(
        OPEN_ERROR,
      );
    }
    const otherSender = generateSigningKeyPair().publicKey;
    await expect(openMailboxMessage(FIXED_MESSAGE, key, otherSender, BINDING)).rejects.toThrow(
      OPEN_ERROR,
    );
  });

  it('rechaza otro folio, otro remitente u otra llave del destinatario', async () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const key = reporter.box.privateKey;
    const bindings: MailboxBinding[] = [
      { folio: '0123-4567-89AC', from: 'authority' },
      { folio: '0123-4567-89AB', from: 'reporter' },
    ];
    for (const binding of bindings) {
      await expect(
        openMailboxMessage(FIXED_MESSAGE, key, FIXED_SENDER_PUBLIC, binding),
      ).rejects.toThrow(OPEN_ERROR);
    }
    const wrongKey = generateBoxKeyPair().privateKey;
    await expect(
      openMailboxMessage(FIXED_MESSAGE, wrongKey, FIXED_SENDER_PUBLIC, BINDING),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza folio o remitente inválidos al sellar', async () => {
    const { sender, target } = setup();
    await expect(
      sealMailboxMessage('hola', target, sender.privateKey, { folio: 'malo', from: 'authority' }),
    ).rejects.toThrow();
    await expect(
      sealMailboxMessage('hola', target, sender.privateKey, {
        folio: '0123-4567-89AB',
        from: 'system' as MailboxBinding['from'],
      }),
    ).rejects.toThrow();
  });
});
