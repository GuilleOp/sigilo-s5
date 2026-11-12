// Pruebas de la solicitud de medidas de protección: texto fijo sin datos de la persona, lo que ella
// agrega (opcional) sin caracteres invisibles y dentro del límite del buzón.
import { describe, expect, it } from 'vitest';
import { MAX_MAILBOX_TEXT_LENGTH } from '@sigilo/core';
import {
  buildProtectionRequestMessage,
  isProtectionRequestMessage,
  MAX_PROTECTION_DETAILS_LENGTH,
  PROTECTION_REQUEST_BODY,
  PROTECTION_REQUEST_TITLE,
} from './protection-request.ts';

describe('solicitud de medidas de protección', () => {
  it('sin nada más, envía solo el encabezado y el texto fijo', () => {
    const message = buildProtectionRequestMessage('  \u200b ');
    expect(message).toEqual({
      ok: true,
      text: `${PROTECTION_REQUEST_TITLE}\n\n${PROTECTION_REQUEST_BODY}`,
    });
    if (message.ok) expect(isProtectionRequestMessage(message.text)).toBe(true);
  });

  it('el texto fijo cita la LGRA y el CNPP y dice que decide la autoridad', () => {
    expect(PROTECTION_REQUEST_BODY).toContain('LGRA (art. 64)');
    expect(PROTECTION_REQUEST_BODY).toContain('CNPP (art. 109, fr. XVI y XIX)');
    expect(PROTECTION_REQUEST_BODY).toContain('la autoridad competente decide');
  });

  it('agrega lo que la persona escribe, sin caracteres invisibles', () => {
    const message = buildProtectionRequestMessage(' Temo que me cambien de\u200b área. ');
    expect(
      message.ok && message.text.endsWith('Lo que me preocupa: Temo que me cambien de área.'),
    ).toBe(true);
  });

  it('respeta el límite del buzón y dice cuánto sobra', () => {
    const exact = buildProtectionRequestMessage('a'.repeat(MAX_PROTECTION_DETAILS_LENGTH));
    expect(exact.ok && exact.text.length).toBe(MAX_MAILBOX_TEXT_LENGTH);
    const long = buildProtectionRequestMessage('a'.repeat(MAX_PROTECTION_DETAILS_LENGTH + 3));
    expect(long).toEqual({
      ok: false,
      error: `Lo que agregaste es muy largo. Puede tener hasta ${MAX_PROTECTION_DETAILS_LENGTH} caracteres; quita 3.`,
    });
  });

  it('un mensaje cualquiera no se confunde con una solicitud', () => {
    expect(isProtectionRequestMessage('Creo que el contrato terminaba en 014.')).toBe(false);
    expect(isProtectionRequestMessage(PROTECTION_REQUEST_TITLE)).toBe(false);
  });
});
