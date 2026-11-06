// Modos de uso para la inclusión: denuncia asistida, quiosco (equipo compartido), poca conexión y
// lectura fácil. Viven en memoria como todo lo demás: nada se guarda en el navegador (PRV-10).
import { createMemoryStore } from './memory-store.ts';

/** Modos activos. */
export interface UsageModes {
  /** Alguien ayuda a denunciar: avisos para proteger el recibo de quien denuncia. */
  isAssisted: boolean;
  /** Equipo compartido (módulo de atención): se borra todo al terminar y el recibo no se copia. */
  isKiosk: boolean;
  /** Conexión lenta o intermitente: reintentos con aviso y textos de espera. */
  isLowConnection: boolean;
  /** Letra más grande, más espacio y frases cortas. */
  isEasyReading: boolean;
}

/** Modos según la dirección de entrada (`?modo=quiosco,asistida,poca-conexion,lectura-facil`). */
export function modesFromQuery(search: string): UsageModes {
  const requested = new Set(
    (new URLSearchParams(search).get('modo') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
  return {
    isAssisted: requested.has('asistida'),
    isKiosk: requested.has('quiosco'),
    isLowConnection: requested.has('poca-conexion'),
    isEasyReading: requested.has('lectura-facil'),
  };
}

let initialModes: UsageModes = modesFromQuery('');

/** Fija los modos de arranque (los lee `main.tsx` de la dirección antes de limpiarla). */
export function setInitialModes(modes: UsageModes): void {
  initialModes = modes;
  usageModesStore.reset();
}

/**
 * Modos de esta pestaña. Al borrar todo (salida rápida o fin en quiosco) vuelven a los de arranque:
 * un quiosco sigue siendo quiosco para la siguiente persona.
 */
export const usageModesStore = createMemoryStore<UsageModes>(() => ({ ...initialModes }));

/** Cambia un modo. */
export function setUsageMode<K extends keyof UsageModes>(mode: K, value: UsageModes[K]): void {
  usageModesStore.set((current) => ({ ...current, [mode]: value }));
}

/** Atributos que el documento refleja para los estilos (`html[data-...]`). */
export function applyModesToDocument(modes: UsageModes, root: HTMLElement): void {
  root.dataset['kiosk'] = String(modes.isKiosk);
  root.dataset['reading'] = modes.isEasyReading ? 'easy' : 'standard';
  root.dataset['connection'] = modes.isLowConnection ? 'low' : 'standard';
}
