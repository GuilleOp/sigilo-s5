// Sesión del panel de autoridad: token de la sesión de una cuenta individual, su cuenta y las
// llaves, solo en memoria.
import type { AuthorityAccountView } from '@sigilo/contracts';
import type { AuthorityKeys } from '../../crypto/authority.ts';

/** Credenciales del panel. */
export interface AuthoritySession {
  token: string;
  account: AuthorityAccountView;
  keys: AuthorityKeys;
}

/**
 * Sesión de la cuenta de operación del nodo: solo resuelve solicitudes de alta, así que no importa
 * llave de autoridad ni ve denuncias.
 */
export interface OperationSession {
  token: string;
  account: AuthorityAccountView;
}
