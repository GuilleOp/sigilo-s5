// Segundo factor en E2E: código TOTP de las cuentas inscritas con el reloj del servidor de prueba
// y sin repetir un paso ya aceptado (el nodo lo rechazaría), y sus códigos de recuperación.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AuthorityAccountsFileSchema } from '@sigilo/contracts';
import { hotp, totpStep } from '../../apps/server/src/security/totp.ts';
import { serverNow } from './clock.ts';
import { openServerDatabase } from './database.ts';
import { dataDir, E2E_MFA_USERS, e2eTotpSecret, recoveryCodesPath } from './environment.ts';

/** Si la cuenta tiene el segundo factor inscrito en E2E. */
export function hasE2eMfa(username: string): boolean {
  return E2E_MFA_USERS.has(username);
}

function accountIdOf(username: string): string {
  const file = AuthorityAccountsFileSchema.parse(
    JSON.parse(readFileSync(join(dataDir(), 'authority-accounts.json'), 'utf8')),
  );
  const account = file.accounts.find((item) => item.username === username);
  if (account === undefined) throw new Error(`No existe la cuenta ${username}.`);
  return account.accountId;
}

/** Último paso TOTP que aceptó el servidor para la cuenta (no es secreto). */
export function lastAcceptedStep(username: string): number {
  const db = openServerDatabase();
  try {
    const row = db
      .prepare('SELECT last_step FROM authority_mfa WHERE account_id = ?')
      .get(accountIdOf(username));
    return row === undefined ? Number.NEGATIVE_INFINITY : Number(row.last_step);
  } finally {
    db.close();
  }
}

/** Código TOTP del paso dado con el secreto sintético de la cuenta. */
export function totpAt(username: string, step: number): string {
  return hotp(e2eTotpSecret(username), step);
}

/** Paso TOTP vigente según el reloj del servidor de prueba. */
export function currentStep(): number {
  return totpStep(serverNow().getTime());
}

/**
 * Código que el servidor aceptará ahora: el del paso vigente o, si ya se usó, el siguiente (se
 * aceptan ±1 paso). Si también se usó, espera a que avance el reloj.
 */
export async function nextTotpCode(username: string): Promise<string> {
  const step = Math.max(currentStep(), lastAcceptedStep(username) + 1);
  while (step > currentStep() + 1) await new Promise((resolve) => setTimeout(resolve, 500));
  return totpAt(username, step);
}

/** Códigos de recuperación de la cuenta, tal como se inscribieron al preparar la corrida. */
export function e2eRecoveryCodes(username: string): string[] {
  const all = JSON.parse(readFileSync(recoveryCodesPath(), 'utf8')) as Record<string, string[]>;
  const codes = all[username];
  if (codes === undefined) throw new Error(`${username} no tiene códigos de recuperación.`);
  return codes;
}
