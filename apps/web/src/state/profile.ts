// Perfil activo del panel de autoridad (función y nombre de la institución), para el distintivo
// de la barra. Vive en memoria como todo lo demás: la salida rápida y el cierre de sesión lo borran.
import type { AuthorityRole } from '../lib/authority-role.ts';
import { createMemoryStore } from './memory-store.ts';

/** Cuenta con sesión en el panel; `null` sin sesión. */
export interface AuthorityProfileState {
  role: AuthorityRole;
  /** Nombre de la institución, cuando ya se consultó. */
  authorityName: string | null;
}

export const authorityProfileStore = createMemoryStore<AuthorityProfileState | null>(() => null);
