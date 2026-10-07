// Pruebas del buzón: firma del remitente, AAD ligado a folio, remitente y secuencia, relleno fijo y
// detección de mensajes repetidos o reordenados.
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url } from './encoding.ts';
import { generateBoxKeyPair, generateSigningKeyPair, keyIdFor } from './keys.ts';
import {
  MAILBOX_PADDED_SIZE,
  MAX_MAILBOX_TEXT_LENGTH,
  isMailboxSequenceComplete,
  nextMailboxSequence,
  openMailboxMessage,
  sealMailboxMessage,
  verifyMailboxSignature,
} from './mailbox.ts';
import type { MailboxBinding, SealedMailboxMessage } from './mailbox.ts';
import { deriveReceiptKeys } from './receipt-keys.ts';
import { FIXED_MAILBOX_MESSAGE } from './test-vectors.ts';

const OPEN_ERROR = 'No se pudo abrir el sobre.';
const FOLIO = '0123-4567-89AB';
const BINDING: MailboxBinding = { folio: FOLIO, from: 'authority', sequence: 0 };
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
  it('hace ida y vuelta con relleno fijo de 4096 bytes', async () => {
    const { recipient, sender, target } = setup();
    const message = await sealMailboxMessage(
      '¿Puede ampliar los hechos?',
      target,
      sender.privateKey,
      BINDING,
    );
    expect(message).toMatchObject({ from: 'authority', sequence: 0 });
    // 4096 bytes de texto en claro más 16 de etiqueta, sin importar la longitud del texto.
    expect(fromBase64Url(message.envelope.ct)).toHaveLength(MAILBOX_PADDED_SIZE + 16);
    const text = await openMailboxMessage(message, recipient.privateKey, sender.publicKey, FOLIO);
    expect(text).toBe('¿Puede ampliar los hechos?');
    const longest = await sealMailboxMessage(
      '€'.repeat(MAX_MAILBOX_TEXT_LENGTH),
      target,
      sender.privateKey,
      BINDING,
    );
    expect(fromBase64Url(longest.envelope.ct)).toHaveLength(MAILBOX_PADDED_SIZE + 16);
    await expect(
      openMailboxMessage(longest, recipient.privateKey, sender.publicKey, FOLIO),
    ).resolves.toHaveLength(MAX_MAILBOX_TEXT_LENGTH);
  });

  it('rechaza textos vacíos o más largos que el máximo con un error claro', async () => {
    const { sender, target } = setup();
    await expect(sealMailboxMessage('', target, sender.privateKey, BINDING)).rejects.toThrow(
      'vacío',
    );
    await expect(
      sealMailboxMessage(
        'x'.repeat(MAX_MAILBOX_TEXT_LENGTH + 1),
        target,
        sender.privateKey,
        BINDING,
      ),
    ).rejects.toThrow(`no puede exceder ${MAX_MAILBOX_TEXT_LENGTH} caracteres`);
  });

  it('abre el vector fijo de regresión', async () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const text = await openMailboxMessage(
      FIXED_MAILBOX_MESSAGE,
      reporter.box.privateKey,
      FIXED_SENDER_PUBLIC,
      FOLIO,
    );
    expect(text).toBe('Mensaje fijo');
    expect(verifyMailboxSignature(FIXED_MAILBOX_MESSAGE, FIXED_SENDER_PUBLIC)).toBe(true);
  });

  it('rechaza firma alterada, remitente equivocado o sobre alterado', async () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const key = reporter.box.privateKey;
    const cases: SealedMailboxMessage[] = [
      { ...FIXED_MAILBOX_MESSAGE, signature: flipFirstBit(FIXED_MAILBOX_MESSAGE.signature) },
      {
        ...FIXED_MAILBOX_MESSAGE,
        envelope: {
          ...FIXED_MAILBOX_MESSAGE.envelope,
          ct: flipFirstBit(FIXED_MAILBOX_MESSAGE.envelope.ct),
        },
      },
      {
        ...FIXED_MAILBOX_MESSAGE,
        envelope: {
          ...FIXED_MAILBOX_MESSAGE.envelope,
          enc: flipFirstBit(FIXED_MAILBOX_MESSAGE.envelope.enc),
        },
      },
      { ...FIXED_MAILBOX_MESSAGE, signature: '***' },
    ];
    for (const message of cases) {
      await expect(openMailboxMessage(message, key, FIXED_SENDER_PUBLIC, FOLIO)).rejects.toThrow(
        OPEN_ERROR,
      );
    }
    const otherSender = generateSigningKeyPair().publicKey;
    await expect(
      openMailboxMessage(FIXED_MAILBOX_MESSAGE, key, otherSender, FOLIO),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza otro folio, otro remitente, otra secuencia u otra llave del destinatario', async () => {
    const reporter = deriveReceiptKeys(fromHex('000102030405060708090a'));
    const key = reporter.box.privateKey;
    await expect(
      openMailboxMessage(FIXED_MAILBOX_MESSAGE, key, FIXED_SENDER_PUBLIC, '0123-4567-89AC'),
    ).rejects.toThrow(OPEN_ERROR);
    // Cambiar remitente o secuencia invalida la firma y, sin ella, también el AAD.
    for (const altered of [
      { ...FIXED_MAILBOX_MESSAGE, from: 'reporter' as const },
      { ...FIXED_MAILBOX_MESSAGE, sequence: 1 },
    ]) {
      expect(verifyMailboxSignature(altered, FIXED_SENDER_PUBLIC)).toBe(false);
      await expect(openMailboxMessage(altered, key, FIXED_SENDER_PUBLIC, FOLIO)).rejects.toThrow(
        OPEN_ERROR,
      );
    }
    const wrongKey = generateBoxKeyPair().privateKey;
    await expect(
      openMailboxMessage(FIXED_MAILBOX_MESSAGE, wrongKey, FIXED_SENDER_PUBLIC, FOLIO),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza un sobre repetido con otra secuencia aunque se vuelva a firmar', async () => {
    // Quien tiene la llave de firma no puede mover el sobre a otra posición: el AAD lo impide.
    const { recipient, sender, target } = setup();
    const first = await sealMailboxMessage('Primero', target, sender.privateKey, BINDING);
    const second = await sealMailboxMessage('Segundo', target, sender.privateKey, {
      ...BINDING,
      sequence: 1,
    });
    const replay = { ...second, envelope: first.envelope };
    expect(verifyMailboxSignature(replay, sender.publicKey)).toBe(false);
    await expect(
      openMailboxMessage(replay, recipient.privateKey, sender.publicKey, FOLIO),
    ).rejects.toThrow(OPEN_ERROR);
  });

  it('rechaza folio, remitente o secuencia inválidos al sellar', async () => {
    const { sender, target } = setup();
    const invalid: MailboxBinding[] = [
      { ...BINDING, folio: 'malo' },
      { ...BINDING, from: 'system' as MailboxBinding['from'] },
      { ...BINDING, sequence: -1 },
      { ...BINDING, sequence: 1.5 },
    ];
    for (const binding of invalid) {
      await expect(
        sealMailboxMessage('hola', target, sender.privateKey, binding),
      ).rejects.toThrow();
    }
  });
});

describe('verifyMailboxSignature', () => {
  it('devuelve false con firma de otra longitud o campos inválidos', () => {
    expect(
      verifyMailboxSignature({ ...FIXED_MAILBOX_MESSAGE, signature: 'AAAA' }, FIXED_SENDER_PUBLIC),
    ).toBe(false);
    expect(
      verifyMailboxSignature({ ...FIXED_MAILBOX_MESSAGE, sequence: -1 }, FIXED_SENDER_PUBLIC),
    ).toBe(false);
  });
});

describe('secuencia del buzón', () => {
  it('detecta huecos, repeticiones y reordenamientos por remitente', () => {
    expect(isMailboxSequenceComplete([])).toBe(true);
    expect(
      isMailboxSequenceComplete([
        { from: 'reporter', sequence: 0 },
        { from: 'authority', sequence: 0 },
        { from: 'reporter', sequence: 1 },
      ]),
    ).toBe(true);
    for (const broken of [
      [{ from: 'reporter' as const, sequence: 1 }],
      [
        { from: 'authority' as const, sequence: 0 },
        { from: 'authority' as const, sequence: 0 },
      ],
      [
        { from: 'authority' as const, sequence: 1 },
        { from: 'authority' as const, sequence: 0 },
      ],
    ]) {
      expect(isMailboxSequenceComplete(broken)).toBe(false);
    }
  });

  it('calcula la siguiente secuencia del remitente', () => {
    const messages = [{ from: 'reporter' as const }, { from: 'authority' as const }];
    expect(nextMailboxSequence(messages, 'reporter')).toBe(1);
    expect(nextMailboxSequence([], 'authority')).toBe(0);
  });
});
