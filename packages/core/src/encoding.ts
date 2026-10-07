// Codificaciones de bytes (Base64URL, hexadecimal y UTF-8) idénticas en Node y navegadores.

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;
const HEX_PATTERN = /^(?:[0-9a-fA-F]{2})*$/;

const BASE64URL_LOOKUP: ReadonlyMap<string, number> = new Map(
  [...BASE64URL_ALPHABET].map((character, index) => [character, index]),
);

const textEncoder = new TextEncoder();
// Seguridad: `fatal` rechaza secuencias UTF-8 inválidas en lugar de sustituirlas en silencio.
const textDecoder = new TextDecoder('utf-8', { fatal: true });

/** Codifica bytes en Base64URL sin relleno (RFC 4648, sección 5). */
export function toBase64Url(bytes: Uint8Array): string {
  let output = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;
    const remaining = bytes.length - index;
    output += BASE64URL_ALPHABET[(chunk >> 18) & 63];
    output += BASE64URL_ALPHABET[(chunk >> 12) & 63];
    if (remaining > 1) output += BASE64URL_ALPHABET[(chunk >> 6) & 63];
    if (remaining > 2) output += BASE64URL_ALPHABET[chunk & 63];
  }
  return output;
}

/**
 * Decodifica Base64URL sin relleno.
 * Lanza error si hay caracteres fuera del alfabeto, longitud imposible o bits sobrantes no nulos.
 */
export function fromBase64Url(text: string): Uint8Array {
  // Seguridad: la forma no canónica se rechaza para que cada valor tenga una sola codificación.
  if (!BASE64URL_PATTERN.test(text) || text.length % 4 === 1) {
    throw new Error('Texto Base64URL inválido.');
  }
  const output = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let position = 0;
  for (const character of text) {
    buffer = (buffer << 6) | (BASE64URL_LOOKUP.get(character) ?? 0);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[position] = (buffer >> bits) & 0xff;
      position += 1;
    }
    buffer &= (1 << bits) - 1;
  }
  if (buffer !== 0) {
    throw new Error('Texto Base64URL inválido.');
  }
  return output;
}

/** Codifica bytes en hexadecimal minúsculo. */
export function toHex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) {
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}

/** Decodifica hexadecimal (mayúsculas o minúsculas). Lanza error si la longitud es impar o hay caracteres inválidos. */
export function fromHex(text: string): Uint8Array {
  if (!HEX_PATTERN.test(text)) {
    throw new Error('Texto hexadecimal inválido.');
  }
  const output = new Uint8Array(text.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

/** Codifica texto en bytes UTF-8. */
export function utf8Encode(text: string): Uint8Array {
  return textEncoder.encode(text);
}

/** Decodifica bytes UTF-8. Lanza error si la secuencia no es UTF-8 válido. */
export function utf8Decode(bytes: Uint8Array): string {
  try {
    return textDecoder.decode(bytes);
  } catch {
    throw new Error('Los bytes no son UTF-8 válido.');
  }
}

/**
 * Indica si dos arreglos de bytes son idénticos.
 * Seguridad: recorre siempre todo el arreglo, sin salir en la primera diferencia, para no
 * revelar por tiempo en qué posición difieren (solo la longitud es observable).
 */
export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
