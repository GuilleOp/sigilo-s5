// Inscripción y reinicio del segundo factor fuera de una petición: la demostración y las pruebas
// E2E inscriben cuentas sintéticas antes de arrancar el nodo, y la operación del nodo reinicia el
// factor de una cuenta con `./sigilo cuenta reiniciar-mfa`. Usa la misma base y la misma llave
// (`mfa-key`) que el servidor.
import type { DatabaseSync } from 'node:sqlite';
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from '../db/database.ts';
import { createMfaRepository } from '../db/mfa-repository.ts';
import { createSecurityLogRepository } from '../db/security-log-repository.ts';
import {
  encryptTotpSecret,
  generateRecoveryCodes,
  loadOrCreateMfaKey,
  RECOVERY_SCRYPT_LOG_N,
} from '../security/mfa-secrets.ts';
import { totpStep } from '../security/totp.ts';

/** Nombre de la base del nodo en su directorio de datos. */
export const DATABASE_FILE = 'sigilo.db';

function minuteOf(date: Date): string {
  return `${date.toISOString().slice(0, 16)}Z`;
}

/**
 * Inscribe el segundo factor de una cuenta con un secreto dado y devuelve sus 10 códigos de
 * recuperación en claro. El último paso aceptado queda uno antes del actual: el código vigente
 * sirve para entrar.
 * Lanza error si la cuenta ya está inscrita.
 */
export function provisionMfa(options: {
  db: DatabaseSync;
  key: Uint8Array;
  accountId: string;
  secret: Uint8Array;
  now: Date;
  recoveryLogN?: number;
}): { recoveryCodes: string[] } {
  const { codes, set } = generateRecoveryCodes(options.recoveryLogN ?? RECOVERY_SCRYPT_LOG_N);
  createMfaRepository(options.db).insert({
    accountId: options.accountId,
    secretSealed: encryptTotpSecret(options.key, options.accountId, options.secret),
    lastStep: totpStep(options.now.getTime()) - 2,
    recovery: set,
    enrolledAt: minuteOf(options.now),
  });
  createSecurityLogRepository(options.db).insert({
    at: minuteOf(options.now),
    kind: 'mfa_enrolled',
    accountId: options.accountId,
    folioDigest: null,
  });
  return { recoveryCodes: codes };
}

/**
 * Inscribe varias cuentas en la base del directorio de datos (la crea y migra si no existe, y
 * crea `mfa-key` si falta). Solo con el nodo detenido. Devuelve los códigos de recuperación de
 * cada cuenta.
 */
export function provisionMfaInDataDir(
  dataDir: string,
  accounts: readonly { accountId: string; secret: Uint8Array }[],
  options: { now?: Date; recoveryLogN?: number } = {},
): Map<string, string[]> {
  const key = loadOrCreateMfaKey(dataDir);
  const db = openDatabase(join(dataDir, DATABASE_FILE));
  try {
    const now = options.now ?? new Date();
    return new Map(
      accounts.map((account) => [
        account.accountId,
        provisionMfa({
          db,
          key,
          now,
          accountId: account.accountId,
          secret: account.secret,
          ...(options.recoveryLogN === undefined ? {} : { recoveryLogN: options.recoveryLogN }),
        }).recoveryCodes,
      ]),
    );
  } finally {
    db.close();
    // Seguridad (H18): la base queda 0600 aunque el script corra con otro umask.
    for (const suffix of ['', '-wal', '-shm']) {
      const path = join(dataDir, `${DATABASE_FILE}${suffix}`);
      if (existsSync(path)) chmodSync(path, 0o600);
    }
  }
}

/**
 * Reinicia el segundo factor de una cuenta: borra su inscripción (secreto, último paso y códigos
 * de recuperación) y deja `mfa_reset` en el registro de seguridad, sin ningún secreto. Devuelve si
 * la cuenta estaba inscrita (el evento se registra de todos modos).
 * Seguridad: con `SIGILO_MFA=requerido`, las sesiones abiertas de la cuenta dejan de servir para
 * el panel en su siguiente petición y la persona inscribe un secreto nuevo al volver a entrar.
 */
export function resetMfa(db: DatabaseSync, accountId: string, now: Date): boolean {
  const wasEnrolled = createMfaRepository(db).remove(accountId);
  createSecurityLogRepository(db).insert({
    at: minuteOf(now),
    kind: 'mfa_reset',
    accountId,
    folioDigest: null,
  });
  return wasEnrolled;
}
