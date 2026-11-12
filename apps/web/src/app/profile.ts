// Qué pantallas sirve cada perfil de la web. La ventanilla única (SESNA) sirve las públicas; el nodo
// de un estado sirve solo el panel de autoridades; el perfil completo (un solo nodo, pruebas y E2E)
// sirve todas.
import type { WebProfile } from '../config/app-config.ts';
import { PATHS } from './paths.ts';

/**
 * Qué se muestra en una ruta: la pantalla, el aviso «La ventanilla única está en…» (en un nodo) o
 * el aviso «El panel está en el nodo de tu estado» (en la ventanilla).
 */
export type RouteAvailability = 'page' | 'ventanilla-notice' | 'panel-notice';

/** Disponibilidad de la ruta en el perfil. */
export function routeAvailability(profile: WebProfile, path: string): RouteAvailability {
  if (profile === 'panel') return path === PATHS.authority ? 'page' : 'ventanilla-notice';
  if (profile === 'ventanilla' && path === PATHS.authority) return 'panel-notice';
  return 'page';
}
