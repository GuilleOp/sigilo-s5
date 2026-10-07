// Comprobaciones estructurales de llaves y sobres que el servidor puede hacer sin descifrar. Las
// constantes y la lógica del formato vienen de @sigilo/core para no duplicarlas.
import type { HpkeEnvelope } from '@sigilo/contracts';
import {
  envelopePlaintextLength,
  fromBase64Url,
  IDENTITY_PADDED_SIZE,
  MAILBOX_PADDED_SIZE,
} from '@sigilo/core';

const KEY_LENGTH = 32;

/** Indica si el valor es Base64URL canónico de exactamente 32 bytes (llave o digesto). */
export function isKey32(value: string): boolean {
  try {
    return fromBase64Url(value).length === KEY_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Indica si el sobre tiene el tamaño de una identidad rellenada a `IDENTITY_PADDED_SIZE`.
 * Seguridad: rechazar otros tamaños garantiza que el texto cifrado no filtre la longitud real.
 */
export function hasIdentityShape(envelope: HpkeEnvelope): boolean {
  return envelopePlaintextLength(envelope) === IDENTITY_PADDED_SIZE;
}

/**
 * Indica si el sobre tiene el tamaño fijo de un mensaje del buzón (`MAILBOX_PADDED_SIZE`).
 * Seguridad: todos los mensajes miden lo mismo, así que su tamaño no revela la longitud del texto.
 */
export function hasMailboxShape(envelope: HpkeEnvelope): boolean {
  return envelopePlaintextLength(envelope) === MAILBOX_PADDED_SIZE;
}
