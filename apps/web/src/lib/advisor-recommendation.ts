// Modo que recomendó el asesor, para mostrarlo en el paso 1 del asistente. Vive solo en memoria
// (se borra al recargar y con la salida rápida).
import { createMemoryStore } from '../state/memory-store.ts';

/** Recomendación vigente del asesor, o `null` si no se usó. */
export const advisorRecommendationStore = createMemoryStore<'anonymous' | 'sealed' | null>(
  () => null,
);
