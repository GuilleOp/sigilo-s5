// Grupo de anonimato de la denuncia en curso. Con el catálogo completo ya descargado al empezar
// (ADR 0012) se consulta en memoria, sin red y para cualquier entidad. Si esa descarga falló, queda
// el camino prudente del ADR 0008: un cargador por denuncia que pide al mismo origen el índice y,
// como máximo, el fragmento de una entidad. Nada del borrador sale del navegador.
import { findEntity } from '@sigilo/contracts';
import {
  assessAnonymityGroup,
  createAnonymityLoader,
  fragmentKeyFor,
  parseAnonymityIndex,
} from '@sigilo/anonimato';
import type { AnonymityAssessment, AnonymityLoader, FetchLike } from '@sigilo/anonimato';
import { createMemoryStore } from '../state/memory-store.ts';
import type { WorkplaceDraft } from '../state/report-draft.ts';

/** Datos del borrador que usa la evaluación: entidad, ente y lugar de trabajo. */
export interface AnonymityQueryDraft extends WorkplaceDraft {
  stateCode: string;
  entityId: string;
}

/** Ruta del mismo origen donde la web publica el catálogo (ver `vite.config.ts`). */
export const ANONYMITY_BASE_PATH = '/datos/grupos-anonimato/';

/** Descarga del mismo origen, sin cookies, caché ni referer. */
function sameOriginFetch(url: string) {
  return fetch(url, {
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
    mode: 'same-origin',
  });
}

function newLoader(): AnonymityLoader {
  return createAnonymityLoader({ fetch: sameOriginFetch, basePath: ANONYMITY_BASE_PATH });
}

/**
 * Cargador de la denuncia en curso. Se reinicia con el borrador (envío exitoso o salida rápida):
 * cada denuncia tiene el suyo.
 */
const loaderStore = createMemoryStore(newLoader);

/** Empieza una denuncia nueva: el cargador anterior se descarta. */
export function resetAnonymityLoader(): void {
  loaderStore.reset();
}

/**
 * Catálogo completo descargado al empezar (índice y todos los fragmentos con datos, por ruta) y el
 * cargador que lo lee. Solo en memoria; la salida rápida lo borra.
 */
const prefetchedStore = createMemoryStore<{ loader: AnonymityLoader } | null>(() => null);

/** `fetch` que solo lee archivos ya descargados: nunca toca la red. */
function memoryFetch(files: ReadonlyMap<string, ArrayBuffer>): FetchLike {
  return (url) => {
    const bytes = files.get(url);
    return Promise.resolve({
      ok: bytes !== undefined,
      status: bytes === undefined ? 404 : 200,
      arrayBuffer: () => Promise.resolve(bytes ?? new ArrayBuffer(0)),
    });
  };
}

/**
 * Descarga el índice y TODOS los fragmentos con datos y deja listo un cargador en memoria. Pedir
 * todos los fragmentos, siempre los mismos, no revela la entidad de la persona (ADR 0012). El
 * cargador sigue comprobando el SHA-256 de cada fragmento contra el índice.
 */
export async function prefetchAnonymityCatalog(
  fetcher: FetchLike = sameOriginFetch,
): Promise<void> {
  const files = new Map<string, ArrayBuffer>();
  const download = async (name: string): Promise<ArrayBuffer> => {
    const url = `${ANONYMITY_BASE_PATH}${name}`;
    const response = await fetcher(url);
    if (!response.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${response.status}).`);
    const bytes = await response.arrayBuffer();
    files.set(url, bytes);
    return bytes;
  };
  const indexBytes = await download('indice.json');
  const index = parseAnonymityIndex(JSON.parse(new TextDecoder().decode(indexBytes)) as unknown);
  const names = index.entries.flatMap((entry) =>
    entry.hasData && entry.file !== null ? [entry.file] : [],
  );
  await Promise.all(names.map(download));
  const loader = createAnonymityLoader({
    fetch: memoryFetch(files),
    basePath: ANONYMITY_BASE_PATH,
    allowsSeveralStates: true,
  });
  prefetchedStore.set(() => ({ loader }));
}

/** Indica si el catálogo completo ya está en memoria. */
export function isAnonymityCatalogPrefetched(): boolean {
  return prefetchedStore.get() !== null;
}

/** Cargador a usar: el del catálogo en memoria si existe; si no, el prudente de la denuncia. */
function currentLoader(): AnonymityLoader {
  return prefetchedStore.get()?.loader ?? loaderStore.get();
}

/** Resultado para la interfaz: evaluación, que no aplica, o que no se pudo estimar. */
export type AnonymityCheck =
  | { kind: 'not-applicable' }
  | { kind: 'assessed'; assessment: AnonymityAssessment }
  | { kind: 'other-state'; message: string }
  | { kind: 'failed'; message: string };

const OTHER_STATE =
  'Para esta denuncia ya consultamos los datos de otra entidad. Para no descargar más datos que puedan decir dónde estás, no estimamos este grupo. Por precaución, escribe como si tu grupo fuera pequeño.';
const FAILED =
  'No pudimos consultar el tamaño de tu grupo. Por precaución, escribe como si tu grupo fuera pequeño.';

/** Clave del fragmento que corresponde al borrador, o `null` si no aplica. */
export function fragmentKeyOf(draft: AnonymityQueryDraft): string | null {
  if (draft.worksThere !== 'yes') return null;
  const entity = findEntity(draft.entityId);
  if (entity === undefined || !/^\d{2}$/u.test(draft.stateCode)) return null;
  return fragmentKeyFor(draft.stateCode, entity.level === 'federal');
}

/**
 * Evalúa el grupo de anonimato si la persona dijo que trabaja o trabajó en el ente.
 * Seguridad: el fragmento solo revela la entidad (o que el ente es federal), lo mismo que ya revela
 * el destino del sobre; el ente y el área nunca salen del navegador.
 */
export async function checkAnonymity(
  draft: AnonymityQueryDraft,
  loader: AnonymityLoader = currentLoader(),
): Promise<AnonymityCheck> {
  const key = fragmentKeyOf(draft);
  const entity = findEntity(draft.entityId);
  if (key === null || entity === undefined) return { kind: 'not-applicable' };
  let data;
  try {
    data = await loader.loadState(key);
  } catch (error) {
    const isOtherState = error instanceof Error && error.message.includes('otra entidad');
    return isOtherState
      ? { kind: 'other-state', message: OTHER_STATE }
      : { kind: 'failed', message: FAILED };
  }
  const area = draft.area.trim();
  return {
    kind: 'assessed',
    assessment: assessAnonymityGroup(data, {
      ente: entity.name,
      ...(area === '' ? {} : { area }),
    }),
  };
}
