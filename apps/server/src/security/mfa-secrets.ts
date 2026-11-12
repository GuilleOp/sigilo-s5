// Material del segundo factor del panel: la llave del nodo que cifra los secretos TOTP en reposo
// (`mfa-key`, 0600, en el directorio de datos), el cifrado AES-256-GCM de cada secreto ligado a su
// cuenta y los códigos de recuperación de un solo uso, guardados como digestos scrypt.
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromBase64Url, toBase64Url } from '@sigilo/core';
import { MIN_SCRYPT_LOG_N } from './passwords.ts';

/** Nombre del archivo de la llave del segundo factor en el directorio de datos. */
export const MFA_KEY_FILE = 'mfa-key';

/** Bytes de la llave AES-256-GCM. */
export const MFA_KEY_BYTES = 32;

/**
 * Costo scrypt de los códigos de recuperación: N = 2^14 (16 MiB por intento). Cada código tiene 50
 * bits aleatorios, así que no hace falta el costo de una contraseña elegida por una persona.
 */
export const RECOVERY_SCRYPT_LOG_N = MIN_SCRYPT_LOG_N;

/** Códigos de recuperación por cuenta. */
export const RECOVERY_CODE_COUNT = 10;

/** Caracteres de un código de recuperación (Base32, 50 bits), sin contar el guion. */
export const RECOVERY_CODE_LENGTH = 10;

const RECOVERY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_FORMAT = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const RECOVERY_HASH_BYTES = 32;
const SCRYPT_R = 8;

/**
 * Lee la llave del segundo factor del nodo, o la crea (0600) la primera vez. Lanza error si es
 * corta o si el grupo u otros pueden leerla.
 * Seguridad: sin esta llave, una copia de la base no revela los secretos TOTP; viaja en el
 * respaldo cifrado junto con la base (`./sigilo respaldar`), nunca en claro ni en un registro.
 */
export function loadOrCreateMfaKey(dataDir: string): Uint8Array {
  const path = join(dataDir, MFA_KEY_FILE);
  if (!existsSync(path)) {
    writeFileSync(path, `${toBase64Url(randomBytes(MFA_KEY_BYTES))}\n`, { mode: 0o600 });
    chmodSync(path, 0o600);
  }
  if ((statSync(path).mode & 0o077) !== 0) {
    throw new Error(`La llave del segundo factor (${MFA_KEY_FILE}) debe tener permisos 0600.`);
  }
  const key = fromBase64Url(readFileSync(path, 'utf8').trim());
  if (key.length !== MFA_KEY_BYTES) {
    throw new Error('La llave del segundo factor del nodo no tiene 32 bytes.');
  }
  return key;
}

function aadFor(accountId: string): Buffer {
  return Buffer.from(`sigilo/mfa/v1:${accountId}`, 'utf8');
}

/**
 * Cifra el secreto TOTP de una cuenta: `v1.<iv>.<cifrado y etiqueta>` en Base64URL, con la cuenta
 * en los datos asociados (un secreto copiado a otra fila no descifra).
 */
export function encryptTotpSecret(key: Uint8Array, accountId: string, secret: Uint8Array): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(aadFor(accountId));
  const body = Buffer.concat([cipher.update(secret), cipher.final(), cipher.getAuthTag()]);
  return `${SECRET_FORMAT}.${toBase64Url(iv)}.${toBase64Url(body)}`;
}

/** Descifra el secreto TOTP de la cuenta. Lanza error si el formato, la llave o la cuenta no coinciden. */
export function decryptTotpSecret(key: Uint8Array, accountId: string, sealed: string): Uint8Array {
  const [format, ivText, bodyText] = sealed.split('.');
  if (format !== SECRET_FORMAT || ivText === undefined || bodyText === undefined) {
    throw new Error('Secreto del segundo factor con formato inválido.');
  }
  const iv = fromBase64Url(ivText);
  const body = fromBase64Url(bodyText);
  if (iv.length !== IV_BYTES || body.length <= TAG_BYTES) {
    throw new Error('Secreto del segundo factor con formato inválido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  decipher.setAAD(aadFor(accountId));
  decipher.setAuthTag(body.subarray(body.length - TAG_BYTES));
  return new Uint8Array(
    Buffer.concat([decipher.update(body.subarray(0, body.length - TAG_BYTES)), decipher.final()]),
  );
}

/** Digestos de los códigos de recuperación de una cuenta; `null` marca un código ya usado. */
export interface RecoveryCodeSet {
  logN: number;
  /** Sal común de la cuenta: un solo scrypt por intento se compara con los diez digestos. */
  salt: string;
  hashes: (string | null)[];
}

/** Código de recuperación nuevo, `XXXXX-XXXXX` (50 bits). */
function randomRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_CODE_LENGTH);
  let code = '';
  for (const byte of bytes) code += RECOVERY_ALPHABET[byte & 31];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/**
 * Normaliza un código de recuperación (mayúsculas, sin espacios ni guiones), o `null` si no tiene
 * la forma de uno.
 */
export function normalizeRecoveryCode(code: string): string | null {
  const clean = code.replace(/[\s-]/gu, '').toUpperCase();
  return new RegExp(`^[A-Z2-7]{${RECOVERY_CODE_LENGTH}}$`, 'u').test(clean) ? clean : null;
}

function maxMemory(logN: number): number {
  return 256 * SCRYPT_R * 2 ** logN;
}

/** Diez códigos nuevos en claro (se muestran una sola vez) y sus digestos scrypt. */
export function generateRecoveryCodes(logN: number = RECOVERY_SCRYPT_LOG_N): {
  codes: string[];
  set: RecoveryCodeSet;
} {
  const salt = randomBytes(16);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, randomRecoveryCode);
  const hashes = codes.map((code) =>
    toBase64Url(
      scryptSync(normalizeRecoveryCode(code) ?? '', salt, RECOVERY_HASH_BYTES, {
        N: 2 ** logN,
        r: SCRYPT_R,
        p: 1,
        maxmem: maxMemory(logN),
      }),
    ),
  );
  return { codes, set: { logN, salt: toBase64Url(salt), hashes } };
}

function scryptAsync(text: string, salt: Uint8Array, logN: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      text,
      salt,
      RECOVERY_HASH_BYTES,
      { N: 2 ** logN, r: SCRYPT_R, p: 1, maxmem: maxMemory(logN) },
      (error, derived) => {
        if (error === null) resolve(derived);
        else reject(error);
      },
    );
  });
}

/**
 * Busca el código entre los digestos sin usar y devuelve su posición, o `null`.
 * Seguridad: calcula un solo scrypt y compara con todos los digestos en tiempo constante, sin salir
 * antes; un código ya usado (`null`) nunca coincide.
 */
export async function matchRecoveryCode(
  set: RecoveryCodeSet,
  code: string,
): Promise<number | null> {
  const clean = normalizeRecoveryCode(code);
  const derived = await scryptAsync(clean ?? 'sin-formato', fromBase64Url(set.salt), set.logN);
  let found: number | null = null;
  set.hashes.forEach((hash, index) => {
    const expected = hash === null ? Buffer.alloc(RECOVERY_HASH_BYTES) : fromBase64Url(hash);
    const isMatch = expected.length === derived.length && timingSafeEqual(expected, derived);
    if (isMatch && hash !== null && clean !== null && found === null) found = index;
  });
  return found;
}

/** Digesto de comparación con el mismo costo, para que un reto señuelo tarde lo mismo. */
export async function dummyRecoveryCheck(logN: number): Promise<void> {
  await scryptAsync('sin-cuenta', randomBytes(16), logN);
}
