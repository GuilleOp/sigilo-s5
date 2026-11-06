// Autenticación del enrutador ante el buzón de red de cada nodo: HMAC-SHA256 del cuerpo exacto con un
// secreto compartido nodo-enrutador. Así el nodo solo acepta sobres que pasaron por el enrutador
// ciego (y su registro y conteo), no los que alguien le manda directo.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { equalBytes, fromBase64Url, toBase64Url, utf8Encode } from '@sigilo/core';

/** Cabecera con la etiqueta HMAC que agrega el enrutador al reenviar un sobre. */
export const RELAY_AUTH_HEADER = 'X-Sigilo-Relay-Auth';

/** Dominio de la etiqueta: no se confunde con ningún otro HMAC del sistema. */
export const RELAY_AUTH_DOMAIN = 'sigilo/red/relay-auth/v1:';

/** Longitud mínima del secreto compartido, en bytes. */
export const RELAY_SECRET_BYTES = 32;

/** Etiqueta del cuerpo exacto que se reenvía al nodo (Base64URL). Lanza si el secreto es corto. */
export function relayAuthTag(secret: Uint8Array, body: string): string {
  if (secret.length < RELAY_SECRET_BYTES)
    throw new Error('El secreto del buzón es demasiado corto.');
  return toBase64Url(hmac(sha256, secret, utf8Encode(`${RELAY_AUTH_DOMAIN}${body}`)));
}

/**
 * Indica si la etiqueta corresponde al cuerpo con el secreto. Compara en tiempo constante y
 * devuelve `false` ante cualquier entrada mal formada.
 */
export function verifyRelayAuth(
  secret: Uint8Array,
  body: string,
  tag: string | undefined,
): boolean {
  if (tag === undefined || secret.length < RELAY_SECRET_BYTES) return false;
  try {
    return equalBytes(fromBase64Url(tag), fromBase64Url(relayAuthTag(secret, body)));
  } catch {
    return false;
  }
}
