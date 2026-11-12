// Contraseñas de un solo uso por tiempo (TOTP, RFC 6238) sobre HOTP (RFC 4226) con node:crypto:
// HMAC-SHA-1, 6 dígitos y pasos de 30 segundos, como las apps de autenticación comunes. Lo usan el
// segundo factor del panel, los scripts de la demostración y las pruebas.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Dígitos del código. */
export const TOTP_DIGITS = 6;

/** Duración de cada paso, en segundos. */
export const TOTP_PERIOD_SECONDS = 30;

/** Pasos de tolerancia hacia cada lado (±30 s) para relojes un poco desfasados. */
export const TOTP_WINDOW_STEPS = 1;

/** Bytes del secreto: 160 bits, el tamaño de la salida de SHA-1 (RFC 4226, sección 4). */
export const TOTP_SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Codifica en Base32 (RFC 4648) sin relleno, como lo leen las apps de autenticación. */
export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/**
 * Decodifica Base32 (RFC 4648); acepta minúsculas, espacios y relleno `=`. Lanza error si hay un
 * carácter fuera del alfabeto.
 */
export function fromBase32(text: string): Uint8Array {
  const clean = text.replace(/[\s=]/gu, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Base32 inválido.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Uint8Array.from(output);
}

/** Secreto TOTP aleatorio nuevo. */
export function generateTotpSecret(): Uint8Array {
  return new Uint8Array(randomBytes(TOTP_SECRET_BYTES));
}

/** HOTP (RFC 4226): HMAC-SHA-1 del contador de 8 bytes con truncado dinámico. */
export function hotp(secret: Uint8Array, counter: number, digits: number = TOTP_DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Paso de tiempo (contador TOTP) de un instante en milisegundos. */
export function totpStep(timeMs: number, periodSeconds: number = TOTP_PERIOD_SECONDS): number {
  return Math.floor(timeMs / 1000 / periodSeconds);
}

/** Código TOTP vigente en `timeMs`. */
export function totpCode(
  secret: Uint8Array,
  timeMs: number,
  options: { digits?: number; periodSeconds?: number } = {},
): string {
  return hotp(secret, totpStep(timeMs, options.periodSeconds), options.digits);
}

/** Si el texto tiene la forma de un código TOTP (6 dígitos, se ignoran los espacios). */
export function isTotpCodeFormat(code: string): boolean {
  return /^\d{6}$/u.test(code.replace(/\s/gu, ''));
}

/**
 * Comprueba un código contra los pasos `t - 1`, `t` y `t + 1` y devuelve el paso que coincide, o
 * `null`. Solo acepta pasos posteriores a `lastStep` (el último aceptado de la cuenta), así que
 * cada código sirve una sola vez aunque siga vigente.
 * Seguridad: compara todos los pasos de la ventana sin salir antes y en tiempo constante.
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  timeMs: number,
  lastStep: number | null,
  windowSteps: number = TOTP_WINDOW_STEPS,
): number | null {
  const clean = code.replace(/\s/gu, '');
  if (!isTotpCodeFormat(clean)) return null;
  const given = Buffer.from(clean, 'utf8');
  const current = totpStep(timeMs);
  let matched: number | null = null;
  for (let step = current - windowSteps; step <= current + windowSteps; step += 1) {
    const expected = Buffer.from(hotp(secret, step), 'utf8');
    const isMatch = timingSafeEqual(expected, given);
    if (isMatch && matched === null && (lastStep === null || step > lastStep)) matched = step;
  }
  return matched;
}

/**
 * URI `otpauth://totp/...` que leen las apps de autenticación (formato de Google Authenticator):
 * emisor, etiqueta, secreto en Base32, SHA-1, 6 dígitos y 30 segundos.
 */
export function otpauthUri(options: { issuer: string; label: string; secret: Uint8Array }): string {
  const label = `${encodeURIComponent(options.issuer)}:${encodeURIComponent(options.label)}`;
  const query = new URLSearchParams({
    secret: toBase32(options.secret),
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${query.toString().replace(/\+/gu, '%20')}`;
}
