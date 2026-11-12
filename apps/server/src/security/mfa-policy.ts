// Política del segundo factor del panel (`SIGILO_MFA`) y la regla que decide si una sesión puede
// usar el panel. La aplica `requireAuthoritySession` a toda ruta de la autoridad, de la
// supervisión y de la operación del nodo, sin excepción por función.
import type { MfaRepository } from '../db/mfa-repository.ts';
import type { AuthorityAccount } from './authority-registry.ts';
import type { LoginChallengeStore, PendingEnrollments } from './login-challenges.ts';
import type { SessionAssurance } from './sessions.ts';

/** Políticas: `requerido` (por omisión en producción y en el perfil «nodo») u `opcional`. */
export const MFA_POLICIES = ['requerido', 'opcional'] as const;

/** Política del segundo factor del nodo. */
export type MfaPolicy = (typeof MFA_POLICIES)[number];

/** Configuración del segundo factor que recibe la aplicación. */
export interface MfaConfig {
  policy: MfaPolicy;
  /** Llave AES-256-GCM de los secretos TOTP (`mfa-key` del directorio de datos). */
  key: Uint8Array;
  /** Emisor que muestra la app de autenticación (por omisión, «SIGILO»). */
  issuer?: string;
  /** Costo scrypt de los códigos de recuperación (`RECOVERY_SCRYPT_LOG_N`); las pruebas usan menos. */
  recoveryLogN?: number;
}

/** Estado del segundo factor compartido por las rutas. */
export interface MfaState {
  policy: MfaPolicy;
  key: Uint8Array;
  issuer: string;
  recoveryLogN: number;
  enrollments: MfaRepository;
  challenges: LoginChallengeStore;
  pending: PendingEnrollments;
}

/** Si la cuenta debe tener segundo factor: por la política del nodo o por su marca propia. */
export function isMfaRequired(mfa: MfaState, account: AuthorityAccount): boolean {
  return mfa.policy === 'requerido' || account.requireMfa === true;
}

/**
 * Si una sesión con `assurance` puede usar el panel: una cuenta inscrita, solo con segundo factor;
 * una sin inscribir, solo si no se le exige.
 * Seguridad: se consulta en cada petición, así que reiniciar el factor de una cuenta a la que se
 * le exige deja sin panel a todas sus sesiones abiertas hasta que vuelva a inscribirlo, y una
 * cuenta inscrita nunca entra solo con la contraseña.
 */
export function isMfaSatisfied(
  mfa: MfaState,
  account: AuthorityAccount,
  assurance: SessionAssurance,
): boolean {
  if (mfa.enrollments.isEnrolled(account.accountId)) return assurance === 'mfa';
  return !isMfaRequired(mfa, account);
}
