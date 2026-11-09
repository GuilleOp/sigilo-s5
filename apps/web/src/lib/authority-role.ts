// Perfil del panel según las funciones de la cuenta: una sola función, o recepción e
// investigación juntas (el área de quejas, denuncias e investigación de un OIC).
import type { AuthorityFunction } from '@sigilo/contracts';

/** Perfil de la cuenta en el panel: su función, o `intake_investigation` si tiene las dos. */
export type AuthorityRole = AuthorityFunction | 'intake_investigation';

/** Perfil que corresponde a las funciones de la cuenta (el servidor ya validó la combinación). */
export function authorityRoleOf(functions: readonly AuthorityFunction[]): AuthorityRole {
  if (functions.includes('intake') && functions.includes('investigation')) {
    return 'intake_investigation';
  }
  return functions[0] ?? 'intake';
}
