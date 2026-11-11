// Entes públicos reales de la PDN en el navegador: se descarga del mismo origen solo el fragmento
// de la entidad elegida (/datos/entes/<clave>.json) y el federal (00), se validan y se registran en
// @sigilo/contracts para que `findEntity` (ruteo, vista previa, detalle) los encuentre.
// Seguridad: el catálogo completo no viaja en el bundle; descargar un fragmento solo revela la
// entidad, que la denuncia ya declara (igual que el grupo de anonimato, datos/README.md, regla 5).
import { useEffect, useSyncExternalStore } from 'react';
import {
  ENTITY_FRAGMENT_BASE_PATH,
  EntityFragmentSchema,
  entityFromRow,
  entityStateCode,
  FEDERAL_ENTITY_STATE_CODE,
  findEntity,
  isStateCode,
  registerRealEntities,
} from '@sigilo/contracts';
import type { PublicEntityOption } from '@sigilo/contracts';
import { createMemoryStore } from '../state/memory-store.ts';

/** Descarga mínima que usa el cargador (inyectable en pruebas). */
export type FragmentFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Estado de un fragmento: cargando, listo con sus entes o fallido (se reintenta al pedirlo). */
export type FragmentState =
  | { status: 'loading' }
  | { status: 'ready'; entities: readonly PublicEntityOption[] }
  | { status: 'failed' };

/** Descarga del mismo origen, sin cookies, caché ni referer (como el grupo de anonimato). */
function sameOriginFetch(url: string) {
  return fetch(url, {
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    mode: 'same-origin',
  });
}

/** Fragmentos de esta sesión; se borran con la salida rápida. */
const fragmentStore = createMemoryStore<Readonly<Record<string, FragmentState>>>(() => ({}));
const pending = new Map<string, Promise<readonly PublicEntityOption[]>>();

function setState(code: string, state: FragmentState): void {
  fragmentStore.set((current) => ({ ...current, [code]: state }));
}

/** Indica si la clave es de un fragmento publicado: una entidad o `00` (federal). */
export function isFragmentCode(code: string): boolean {
  return code === FEDERAL_ENTITY_STATE_CODE || isStateCode(code);
}

/**
 * Descarga (una sola vez por sesión) el fragmento de una entidad, lo valida y registra sus entes.
 * Rechaza si la respuesta no es un fragmento válido de esa entidad.
 */
export function loadEntityFragment(
  code: string,
  fetchFragment: FragmentFetch = sameOriginFetch,
): Promise<readonly PublicEntityOption[]> {
  const current = fragmentStore.get()[code];
  if (current?.status === 'ready') return Promise.resolve(current.entities);
  const inFlight = pending.get(code);
  if (inFlight !== undefined) return inFlight;
  if (!isFragmentCode(code)) return Promise.reject(new Error('Entidad desconocida.'));
  setState(code, { status: 'loading' });
  const promise = (async () => {
    const response = await fetchFragment(`${ENTITY_FRAGMENT_BASE_PATH}${code}.json`);
    if (!response.ok) throw new Error('No se pudo descargar el catálogo de entes.');
    const fragment = EntityFragmentSchema.parse(await response.json());
    if (fragment.entidad.clave !== code) throw new Error('El fragmento es de otra entidad.');
    const entities = fragment.entes.map((row) => entityFromRow(code, row));
    registerRealEntities(entities);
    return entities;
  })();
  pending.set(code, promise);
  promise.then(
    (entities) => {
      pending.delete(code);
      setState(code, { status: 'ready', entities });
    },
    () => {
      pending.delete(code);
      setState(code, { status: 'failed' });
    },
  );
  return promise;
}

/** Entes reales disponibles para una entidad: los suyos y los federales. */
export interface StateEntities {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  entities: readonly PublicEntityOption[];
}

/** Combina el estado del fragmento federal y el de la entidad. */
export function combineFragments(
  states: Readonly<Record<string, FragmentState>>,
  stateCode: string,
): StateEntities {
  if (!isStateCode(stateCode)) return { status: 'idle', entities: [] };
  const parts = [states[FEDERAL_ENTITY_STATE_CODE], states[stateCode]];
  const entities = parts.flatMap((part) => (part?.status === 'ready' ? part.entities : []));
  if (parts.some((part) => part?.status === 'failed')) return { status: 'failed', entities };
  if (parts.every((part) => part?.status === 'ready')) return { status: 'ready', entities };
  return { status: 'loading', entities };
}

/** Descarga los fragmentos de la entidad y federal, y devuelve sus entes cuando están listos. */
export function useStateEntities(stateCode: string): StateEntities {
  const states = useSyncExternalStore(fragmentStore.subscribe, fragmentStore.get);
  useEffect(() => {
    if (!isStateCode(stateCode)) return;
    // Los errores quedan en el estado del fragmento («failed»); aquí no hay nada más que hacer.
    loadEntityFragment(FEDERAL_ENTITY_STATE_CODE).catch(() => undefined);
    loadEntityFragment(stateCode).catch(() => undefined);
  }, [stateCode]);
  return combineFragments(states, stateCode);
}

/**
 * Ente por id para mostrarlo (vista previa, detalle de la autoridad): si es real y aún no se
 * descargó su fragmento, lo descarga; mientras tanto devuelve `undefined`.
 */
export function useEntity(entityId: string): PublicEntityOption | undefined {
  // Se suscribe para volver a buscar en el registro cuando termina una descarga.
  useSyncExternalStore(fragmentStore.subscribe, fragmentStore.get);
  const code = entityStateCode(entityId);
  const known = findEntity(entityId);
  useEffect(() => {
    if (known === undefined && code !== undefined && isFragmentCode(code)) {
      loadEntityFragment(code).catch(() => undefined);
    }
  }, [known, code]);
  return known;
}
