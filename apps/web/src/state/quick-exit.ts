// "Salida rápida": borra el estado en memoria y sale a una página neutra sin dejar rastro en el
// historial de esta pestaña.
import { QUICK_EXIT_URL } from '../config/app-config.ts';
import { resetAllStores } from './memory-store.ts';

const beforeExitHooks = new Set<() => void>();

/** Registra una limpieza adicional (por ejemplo, desmontar la aplicación). */
export function onQuickExit(hook: () => void): () => void {
  beforeExitHooks.add(hook);
  return () => beforeExitHooks.delete(hook);
}

/**
 * Ejecuta la salida rápida.
 * Seguridad: primero se borra todo (almacenes, componentes y título) de forma síncrona para que
 * una restauración desde la caché de retroceso no muestre datos; después se reemplaza la entrada
 * actual del historial y se navega con `location.replace` para que "Atrás" no vuelva aquí.
 */
export function quickExit(): void {
  try {
    resetAllStores();
    beforeExitHooks.forEach((hook) => hook());
    document.title = 'Clima';
    history.replaceState(null, '', '/');
  } finally {
    location.replace(QUICK_EXIT_URL);
  }
}
