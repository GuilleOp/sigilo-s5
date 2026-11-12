// Inscripciones al segundo factor de las cuentas de la autoridad (`authority_mfa`, migración 17).
// Guarda el secreto TOTP solo cifrado, el último paso aceptado y los digestos de los códigos de
// recuperación; nunca un código ni un secreto en claro.
import type { DatabaseSync } from 'node:sqlite';
import type { RecoveryCodeSet } from '../security/mfa-secrets.ts';
import { readInteger, readText } from './database.ts';

/** Inscripción de una cuenta. */
export interface MfaEnrollment {
  accountId: string;
  /** Secreto TOTP cifrado (`encryptTotpSecret`). */
  secretSealed: string;
  /** Último paso TOTP aceptado: los anteriores y él mismo ya no sirven. */
  lastStep: number;
  recovery: RecoveryCodeSet;
  /** Minuto UTC de la inscripción. */
  enrolledAt: string;
}

/** Operaciones sobre `authority_mfa`. */
export interface MfaRepository {
  find(accountId: string): MfaEnrollment | null;
  isEnrolled(accountId: string): boolean;
  /** Inscribe la cuenta. Lanza error si ya estaba inscrita. */
  insert(enrollment: MfaEnrollment): void;
  /**
   * Marca `step` como el último aceptado solo si es posterior al guardado. Devuelve si lo marcó:
   * `false` significa que el código ya se usó (protección contra repetición).
   */
  advanceStep(accountId: string, step: number): boolean;
  /** Marca como usado el código de recuperación `index`. Devuelve si seguía sin usar. */
  consumeRecoveryCode(accountId: string, index: number): boolean;
  /** Borra la inscripción (reinicio). Devuelve si existía. */
  remove(accountId: string): boolean;
  /** Cuentas inscritas (para el diagnóstico y las pruebas). */
  countEnrolled(): number;
}

function parseRecovery(text: string): RecoveryCodeSet {
  const raw = JSON.parse(text) as Partial<RecoveryCodeSet>;
  if (
    typeof raw.logN !== 'number' ||
    typeof raw.salt !== 'string' ||
    !Array.isArray(raw.hashes) ||
    !raw.hashes.every((hash) => hash === null || typeof hash === 'string')
  ) {
    throw new Error('Códigos de recuperación con formato inválido.');
  }
  return { logN: raw.logN, salt: raw.salt, hashes: raw.hashes };
}

/** Crea el repositorio sobre `db`. */
export function createMfaRepository(db: DatabaseSync): MfaRepository {
  const findStatement = db.prepare('SELECT * FROM authority_mfa WHERE account_id = ?');
  const insertStatement = db.prepare(
    `INSERT INTO authority_mfa (account_id, secret_sealed, last_step, recovery_json, enrolled_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  // La comparación va en el UPDATE: dos peticiones con el mismo código no pueden pasar las dos.
  const advanceStatement = db.prepare(
    'UPDATE authority_mfa SET last_step = ? WHERE account_id = ? AND last_step < ?',
  );
  const recoveryStatement = db.prepare(
    'UPDATE authority_mfa SET recovery_json = ? WHERE account_id = ? AND recovery_json = ?',
  );
  const removeStatement = db.prepare('DELETE FROM authority_mfa WHERE account_id = ?');
  const countStatement = db.prepare('SELECT COUNT(*) AS total FROM authority_mfa');

  function find(accountId: string): MfaEnrollment | null {
    const row = findStatement.get(accountId);
    if (row === undefined) return null;
    return {
      accountId: readText(row, 'account_id'),
      secretSealed: readText(row, 'secret_sealed'),
      lastStep: readInteger(row, 'last_step'),
      recovery: parseRecovery(readText(row, 'recovery_json')),
      enrolledAt: readText(row, 'enrolled_at'),
    };
  }

  return {
    find,
    isEnrolled: (accountId) => findStatement.get(accountId) !== undefined,
    insert: (enrollment) => {
      insertStatement.run(
        enrollment.accountId,
        enrollment.secretSealed,
        enrollment.lastStep,
        JSON.stringify(enrollment.recovery),
        enrollment.enrolledAt,
      );
    },
    advanceStep: (accountId, step) =>
      Number(advanceStatement.run(step, accountId, step).changes) === 1,
    consumeRecoveryCode: (accountId, index) => {
      const row = findStatement.get(accountId);
      if (row === undefined) return false;
      const before = readText(row, 'recovery_json');
      const recovery = parseRecovery(before);
      if (recovery.hashes[index] === null || recovery.hashes[index] === undefined) return false;
      recovery.hashes[index] = null;
      return (
        Number(recoveryStatement.run(JSON.stringify(recovery), accountId, before).changes) === 1
      );
    },
    remove: (accountId) => Number(removeStatement.run(accountId).changes) === 1,
    countEnrolled: () => {
      const row = countStatement.get();
      return row === undefined ? 0 : readInteger(row, 'total');
    },
  };
}
