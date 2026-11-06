// Digestos de contraseña con scrypt (RFC 7914) para las cuentas de la autoridad. El servidor nunca
// guarda ni registra la contraseña.
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { fromBase64Url, toBase64Url } from '@sigilo/core';

/** Costo por omisión: N = 2^15, r = 8, p = 1 (unos 32 MiB y decenas de milisegundos por intento). */
export const DEFAULT_SCRYPT_LOG_N = 15;

/** Costo mínimo que acepta el archivo de cuentas fuera de las pruebas unitarias. */
export const MIN_SCRYPT_LOG_N = 14;

const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const HASH_PATTERN =
  /^scrypt\$(\d{1,2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/u;

/** Parámetros de un digesto de contraseña. */
export interface PasswordHashParameters {
  logN: number;
  r: number;
  p: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

function maxMemory(logN: number, r: number): number {
  // scrypt usa 128 · r · N bytes; se deja el doble de margen.
  return 256 * r * 2 ** logN;
}

/** Lee los parámetros de `scrypt$logN$r$p$sal$digesto`, o `null` si el formato no es válido. */
export function parsePasswordHash(encoded: string): PasswordHashParameters | null {
  const match = HASH_PATTERN.exec(encoded);
  if (match === null) return null;
  const [logN, r, p] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (logN < 10 || logN > 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  try {
    const salt = fromBase64Url(match[4] ?? '');
    const hash = fromBase64Url(match[5] ?? '');
    if (salt.length < SALT_LENGTH || hash.length !== KEY_LENGTH) return null;
    return { logN, r, p, salt, hash };
  } catch {
    return null;
  }
}

/**
 * Calcula el digesto de una contraseña con una sal aleatoria. Es síncrono: lo usan los scripts que
 * generan cuentas y las pruebas, nunca una petición.
 */
export function hashPassword(password: string, logN: number = DEFAULT_SCRYPT_LOG_N): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password.normalize('NFC'), salt, KEY_LENGTH, {
    N: 2 ** logN,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: maxMemory(logN, SCRYPT_R),
  });
  return `scrypt$${logN}$${SCRYPT_R}$${SCRYPT_P}$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

/**
 * Comprueba una contraseña contra su digesto sin bloquear el event loop. Devuelve `false` si el
 * digesto no tiene formato válido.
 * Seguridad: la comparación final es en tiempo constante.
 */
export function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parameters = parsePasswordHash(encoded);
  if (parameters === null) return Promise.resolve(false);
  const { logN, r, p, salt, hash } = parameters;
  return new Promise((resolve) => {
    scrypt(
      password.normalize('NFC'),
      salt,
      KEY_LENGTH,
      { N: 2 ** logN, r, p, maxmem: maxMemory(logN, r) },
      (error, derived) => {
        if (error !== null) {
          resolve(false);
          return;
        }
        resolve(timingSafeEqual(derived, hash));
      },
    );
  });
}
