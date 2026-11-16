// Descarga anticipada de los catálogos del asistente (ADR 0012): al entrar a «Denunciar», todavía
// con conexión, se piden los entes de las 32 entidades y la federación y el catálogo completo del
// grupo de anonimato (unos 300 KB comprimidos). Así la persona puede llenar los pasos 1 a 4 en modo
// avión y conectarse solo para enviar.
// Seguridad: todo queda en memoria (almacenes que borra la salida rápida), nunca en localStorage,
// IndexedDB ni la caché del navegador. Pedir TODO, siempre igual, no revela la entidad: el servidor
// ve las mismas peticiones para cualquier denuncia.
import { FEDERAL_ENTITY_STATE_CODE, STATES } from '@sigilo/contracts';
import { prefetchAnonymityCatalog } from '../anonymity/report-anonymity.ts';
import { createMemoryStore } from '../state/memory-store.ts';
import { loadEntityFragment } from './entity-catalog.ts';

/** Claves de todos los fragmentos de entes: la federación (`00`) y las 32 entidades. */
export const ALL_ENTITY_FRAGMENT_CODES: readonly string[] = [
  FEDERAL_ENTITY_STATE_CODE,
  ...STATES.map((state) => state.code),
];

/** Estado de la descarga anticipada. */
export type PrefetchStatus = 'idle' | 'loading' | 'ready' | 'failed';

/** Descargas que hace la anticipación (inyectables en pruebas). */
export interface PrefetchDependencies {
  loadEntity: (code: string) => Promise<unknown>;
  loadAnonymity: () => Promise<unknown>;
}

const DEFAULT_DEPENDENCIES: PrefetchDependencies = {
  loadEntity: (code) => loadEntityFragment(code),
  loadAnonymity: () => prefetchAnonymityCatalog(),
};

let inFlight: Promise<PrefetchStatus> | null = null;

/** Estado de esta pestaña; la salida rápida lo vuelve a `idle` y olvida la descarga en curso. */
export const reportPrefetchStore = createMemoryStore<PrefetchStatus>(
  () => 'idle',
  () => {
    inFlight = null;
  },
);

/**
 * Descarga todos los catálogos del asistente una vez por pestaña. Si algo falla queda `failed` y la
 * siguiente llamada lo reintenta; mientras tanto el asistente usa la descarga bajo demanda.
 */
export function prefetchReportCatalogs(
  dependencies: PrefetchDependencies = DEFAULT_DEPENDENCIES,
): Promise<PrefetchStatus> {
  if (reportPrefetchStore.get() === 'ready') return Promise.resolve('ready');
  if (inFlight !== null) return inFlight;
  reportPrefetchStore.set(() => 'loading');
  const run = (async (): Promise<PrefetchStatus> => {
    const results = await Promise.allSettled([
      ...ALL_ENTITY_FRAGMENT_CODES.map((code) => dependencies.loadEntity(code)),
      dependencies.loadAnonymity(),
    ]);
    return results.every((result) => result.status === 'fulfilled') ? 'ready' : 'failed';
  })();
  inFlight = run;
  void run.then((status) => {
    // Si la salida rápida reinició el estado a mitad de la descarga, no se escribe encima.
    if (inFlight === run) {
      inFlight = null;
      reportPrefetchStore.set(() => status);
    }
  });
  return run;
}
