// Solicitud de medidas de protección por el buzón cifrado. Es un mensaje más del buzón, con un
// encabezado fijo para que la autoridad la reconozca: no pide datos nuevos y solo lleva lo que la
// persona decida escribir. Quien decide si procede es la autoridad competente: el ente público
// donde trabaja la persona (LGRA, art. 64) o, en la vía penal, el Ministerio Público o el Órgano
// jurisdiccional (CNPP, arts. 109 fr. XVI y XIX, y 137).
import { MAX_MAILBOX_TEXT_LENGTH } from '@sigilo/core';
import { stripInvisibleCharacters } from '@sigilo/huella';
import { prepareMailboxText } from './mailbox-text.ts';
import type { MailboxTextResult } from './mailbox-text.ts';

/** Primera línea del mensaje: con ella la autoridad reconoce la solicitud en el hilo. */
export const PROTECTION_REQUEST_TITLE = 'Solicitud de medidas de protección';

/** Texto fijo de la solicitud, sin datos de la persona. */
export const PROTECTION_REQUEST_BODY =
  'Pido que se valoren medidas de protección por haber denunciado. Si soy persona servidora pública, la LGRA (art. 64) me permite solicitarlas; si en la vía penal tengo la calidad de víctima u ofendido, también el CNPP (art. 109, fr. XVI y XIX). Entiendo que la autoridad competente decide si proceden y cuáles.';

const DETAILS_LABEL = 'Lo que me preocupa: ';

/** Caracteres que quedan para lo que la persona quiera agregar. */
export const MAX_PROTECTION_DETAILS_LENGTH =
  MAX_MAILBOX_TEXT_LENGTH -
  `${PROTECTION_REQUEST_TITLE}\n\n${PROTECTION_REQUEST_BODY}\n\n${DETAILS_LABEL}`.length;

/**
 * Mensaje de la solicitud. `details` es opcional: si está vacío, la solicitud se envía sin él.
 * Pasa por `prepareMailboxText`, así que se quitan los caracteres invisibles y se mide el límite.
 */
export function buildProtectionRequestMessage(details: string): MailboxTextResult {
  const extra = stripInvisibleCharacters(details).trim();
  const parts = [PROTECTION_REQUEST_TITLE, PROTECTION_REQUEST_BODY];
  if (extra !== '') parts.push(`${DETAILS_LABEL}${extra}`);
  const message = prepareMailboxText(parts.join('\n\n'));
  if (message.ok) return message;
  return {
    ok: false,
    error: `Lo que agregaste es muy largo. Puede tener hasta ${MAX_PROTECTION_DETAILS_LENGTH} caracteres; quita ${extra.length - MAX_PROTECTION_DETAILS_LENGTH}.`,
  };
}

/** Indica si un mensaje del buzón es una solicitud de medidas de protección. */
export function isProtectionRequestMessage(text: string): boolean {
  return text.startsWith(`${PROTECTION_REQUEST_TITLE}\n`);
}
