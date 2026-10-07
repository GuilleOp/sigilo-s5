// Almacén en memoria con suscripción para React. Seguridad: nada se escribe en localStorage,
// sessionStorage, IndexedDB ni cookies; al recargar la página todo desaparece.
import { useSyncExternalStore } from 'react';

/** Almacén mínimo con lectura, actualización, reinicio y suscripción. */
export interface MemoryStore<T> {
  get(): T;
  set(updater: (current: T) => T): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
}

const resetters = new Set<() => void>();

/** Crea un almacén y lo registra para el borrado total ("Salida rápida"). */
export function createMemoryStore<T>(
  initial: () => T,
  onReset?: (previous: T) => void,
): MemoryStore<T> {
  let state = initial();
  const listeners = new Set<() => void>();
  const notify = (): void => listeners.forEach((listener) => listener());
  const store: MemoryStore<T> = {
    get: () => state,
    set(updater) {
      state = updater(state);
      notify();
    },
    reset() {
      onReset?.(state);
      state = initial();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  resetters.add(store.reset);
  return store;
}

/** Borra todos los almacenes registrados. */
export function resetAllStores(): void {
  resetters.forEach((reset) => reset());
}

/** Hook para leer un almacén desde un componente. */
export function useMemoryStore<T>(store: MemoryStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
