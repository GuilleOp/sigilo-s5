// Preparación del texto de un mensaje del buzón antes de sellarlo: sin espacios sobrantes, sin
// caracteres invisibles y dentro del límite que acepta `sealMailboxMessage`.
import { MAX_MAILBOX_TEXT_LENGTH } from '@sigilo/core';
import { stripInvisibleCharacters } from '@sigilo/huella';

/** Texto listo para sellar o el motivo, en lenguaje claro, por el que no se puede enviar. */
export type MailboxTextResult = { ok: true; text: string } | { ok: false; error: string };

/**
 * Limpia y valida un mensaje.
 * Seguridad: los caracteres invisibles se quitan siempre, aunque la persona no haya pulsado el
 * botón, porque pueden servir para marcar el texto y reconocer a quien lo escribió. La longitud
 * se mide después de limpiar (la normalización puede cambiarla).
 */
export function prepareMailboxText(raw: string): MailboxTextResult {
  const text = stripInvisibleCharacters(raw).trim();
  if (text === '') return { ok: false, error: 'Escribe tu mensaje antes de enviarlo.' };
  if (text.length > MAX_MAILBOX_TEXT_LENGTH) {
    return {
      ok: false,
      error: `El mensaje es muy largo. Puede tener hasta ${MAX_MAILBOX_TEXT_LENGTH} caracteres; quita ${text.length - MAX_MAILBOX_TEXT_LENGTH}.`,
    };
  }
  return { ok: true, text };
}

/** Texto del contador de caracteres de un mensaje. */
export function mailboxCountText(length: number): string {
  const left = MAX_MAILBOX_TEXT_LENGTH - length;
  return left >= 0
    ? `Llevas ${length} de ${MAX_MAILBOX_TEXT_LENGTH} caracteres.`
    : `Llevas ${length} caracteres. Te sobran ${-left}.`;
}
