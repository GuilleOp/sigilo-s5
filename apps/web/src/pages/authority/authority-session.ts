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
