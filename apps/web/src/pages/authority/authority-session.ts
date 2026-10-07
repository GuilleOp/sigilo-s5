// Sesión del panel de autoridad: token bearer y llaves, solo en memoria.
import type { AuthorityKeys } from '../../crypto/authority.ts';

/** Credenciales del panel. */
export interface AuthoritySession {
  token: string;
  keys: AuthorityKeys;
}
