// Autenticación del enrutador ante el buzón de red de cada nodo: HMAC-SHA256 del cuerpo exacto con un
// secreto compartido nodo-enrutador. Así el nodo solo acepta sobres que pasaron por el enrutador
// ciego (y su registro y conteo), no los que alguien le manda directo. La etiqueta v2 agrega
// frescura (marca de tiempo y nonce); la v1 se acepta solo durante la transición.
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  equalBytes,
  fromBase64Url,
  randomBytes,
  toBase64Url,
  toHex,
  utf8Encode,
} from '@sigilo/core';

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

/**
 * Dominio de la etiqueta v2, con frescura: cubre la marca de tiempo y un nonce además del cuerpo.
 * Así un sobre capturado no se puede volver a entregar al buzón fuera de la ventana, ni dentro de
 * ella (el nodo recuerda los nonces vistos).
 */
export const RELAY_AUTH_DOMAIN_V2 = 'sigilo/red/relay-auth/v2:';

/** Ventana de frescura de la etiqueta v2, hacia atrás y hacia adelante (desfase de relojes). */
export const RELAY_AUTH_WINDOW_MS = 5 * 60 * 1000;

const V2_PATTERN = /^v2\.(\d{10,13})\.([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/u;

function v2Tag(secret: Uint8Array, timestampMs: number, nonce: string, body: string): string {
  if (secret.length < RELAY_SECRET_BYTES)
    throw new Error('El secreto del buzón es demasiado corto.');
  return toBase64Url(
    hmac(sha256, secret, utf8Encode(`${RELAY_AUTH_DOMAIN_V2}${timestampMs}.${nonce}.${body}`)),
  );
}

/**
 * Cabecera v2 (`v2.<milisegundos>.<nonce>.<etiqueta>`) del cuerpo exacto. Lanza si el secreto es
 * corto. Seguridad (H13): sin frescura, un sobre capturado en el enlace enrutador→nodo se podía
 * reenviar tal cual.
 */
export function relayAuthHeaderV2(
  secret: Uint8Array,
  body: string,
  timestampMs: number = Date.now(),
  nonce: string = toHex(randomBytes(16)),
): string {
  return `v2.${timestampMs}.${nonce}.${v2Tag(secret, timestampMs, nonce, body)}`;
}

/** Nonces de etiquetas v2 ya vistas, hasta que salen de la ventana. */
export interface RelayNonceCache {
  /** Anota el nonce; devuelve `false` si ya estaba o si la caché está llena de nonces vigentes. */
  remember(nonce: string, expiresAt: number, now: number): boolean;
}

/** Crea la caché de nonces con un tope de entradas (100 000 por omisión). */
export function createRelayNonceCache(maxEntries = 100_000): RelayNonceCache {
  const seen = new Map<string, number>();
  return {
    remember(nonce, expiresAt, now) {
      if (seen.has(nonce)) return false;
      if (seen.size >= maxEntries) {
        for (const [key, until] of seen) if (until <= now) seen.delete(key);
      }
      // Seguridad: llena de nonces vigentes se rechaza en lugar de olvidar uno.
      if (seen.size >= maxEntries) return false;
      seen.set(nonce, expiresAt);
      return true;
    },
  };
}

/** Opciones de `verifyRelayAuthHeader`. */
export interface RelayAuthCheck {
  /** Hora actual en milisegundos. */
  now: number;
  /** Nonces ya vistos (obligatorio para la v2). */
  nonces: RelayNonceCache;
  /** Si se acepta todavía la etiqueta v1 sin frescura (transición). */
  allowLegacy: boolean;
  windowMs?: number;
}

/**
 * Comprueba la cabecera de autenticación del enrutador: la v2 (con marca de tiempo dentro de la
 * ventana y nonce no visto) o, si `allowLegacy`, la v1. Devuelve `false` ante cualquier entrada mal
 * formada. El nonce se anota solo si la etiqueta es válida.
 */
export function verifyRelayAuthHeader(
  secret: Uint8Array,
  body: string,
  header: string | undefined,
  check: RelayAuthCheck,
): boolean {
  if (header === undefined || secret.length < RELAY_SECRET_BYTES) return false;
  const match = V2_PATTERN.exec(header);
  if (match === null) return check.allowLegacy && verifyRelayAuth(secret, body, header);
  const timestampMs = Number(match[1]);
  const nonce = match[2] ?? '';
  const windowMs = check.windowMs ?? RELAY_AUTH_WINDOW_MS;
  if (Math.abs(check.now - timestampMs) > windowMs) return false;
  try {
    const isValid = equalBytes(
      fromBase64Url(match[3] ?? ''),
      fromBase64Url(v2Tag(secret, timestampMs, nonce, body)),
    );
    return isValid && check.nonces.remember(nonce, timestampMs + windowMs, check.now);
  } catch {
    return false;
  }
}
