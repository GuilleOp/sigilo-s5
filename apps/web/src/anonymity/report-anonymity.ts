// Grupo de anonimato de la denuncia en curso (ADR 0008): un solo cargador por denuncia, que pide al
// mismo origen el índice y, como máximo, el fragmento de una entidad. Nada sale del navegador.
import { findEntity } from '@sigilo/contracts';
import { assessAnonymityGroup, createAnonymityLoader, fragmentKeyFor } from '@sigilo/anonimato';
import type { AnonymityAssessment, AnonymityLoader } from '@sigilo/anonimato';
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
  loader: AnonymityLoader = loaderStore.get(),
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
