// Pruebas de la preparación del texto del buzón.
import { describe, expect, it } from 'vitest';
import { MAX_MAILBOX_TEXT_LENGTH } from '@sigilo/core';
import { mailboxCountText, prepareMailboxText } from './mailbox-text.ts';

describe('prepareMailboxText', () => {
  it('quita caracteres invisibles y espacios sobrantes', () => {
    expect(prepareMailboxText('  Hola\u200b mundo\u2060 ')).toEqual({
      ok: true,
      text: 'Hola mundo',
    });
  });

  it('rechaza un mensaje vacío o solo con marcas invisibles', () => {
    expect(prepareMailboxText(' \u200b\ufeff ')).toMatchObject({ ok: false });
  });

  it('mide el límite después de limpiar', () => {
    const exact = 'a'.repeat(MAX_MAILBOX_TEXT_LENGTH);
    expect(prepareMailboxText(`${exact}\u200b`)).toEqual({ ok: true, text: exact });
    expect(prepareMailboxText(`${exact}b`)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/quita 1\./u),
    });
  });

  it('describe el contador', () => {
    expect(mailboxCountText(10)).toBe(`Llevas 10 de ${MAX_MAILBOX_TEXT_LENGTH} caracteres.`);
  });
});
