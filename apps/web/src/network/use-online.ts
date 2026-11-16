// Hook con la conexión del equipo según el navegador (`navigator.onLine` y sus eventos). Un «sin
// conexión» es fiable; un «con conexión» no garantiza que el servidor responda.
import { useSyncExternalStore } from 'react';

function subscribe(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

const isOnlineNow = (): boolean => navigator.onLine;

/** Indica si el navegador cree tener conexión. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnlineNow, () => true);
}
