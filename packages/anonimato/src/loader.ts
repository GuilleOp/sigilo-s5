// Carga del índice y del fragmento de UNA entidad desde el mismo origen, con fetch inyectable.
// Seguridad: el cargador nunca pide un segundo fragmento ni rutas de otro origen (ADR 0008).

import { FEDERAL_STATE_CODE } from './normalize.ts';
import { parseAnonymityFragment, parseAnonymityIndex } from './fragment.ts';
import type { AnonymityFragment, AnonymityIndex } from './fragment.ts';

/** Respuesta mínima que necesita el cargador (compatible con `Response`). */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** Función de descarga inyectable (compatible con `window.fetch`). */
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

/** Opciones del cargador. */
export interface AnonymityLoaderOptions {
  fetch: FetchLike;
  /** Ruta del mismo origen donde se sirven `indice.json` y los fragmentos. Por omisión `/datos/grupos-anonimato/`. */
  basePath?: string;
  /** Comprueba el SHA-256 del fragmento contra el índice. Activo por omisión. */
  shouldVerifyDigest?: boolean;
}

/** Datos de la entidad: su fragmento o el aviso honesto de que no hay datos. */
export type AnonymityData =
  | { kind: 'fragment'; fragment: AnonymityFragment; cutoffDate: string }
  | { kind: 'no-data'; stateCode: string; stateName: string; cutoffDate: string | null };

/** Cargador de un solo uso por denuncia. */
export interface AnonymityLoader {
  loadIndex(): Promise<AnonymityIndex>;
  /** Carga la entidad indicada. Lanza `Error` si ya se pidió otra entidad con este cargador. */
  loadState(stateCode: string): Promise<AnonymityData>;
}

export const DEFAULT_BASE_PATH = '/datos/grupos-anonimato/';

/**
 * Clave del fragmento que corresponde a un ente: los entes federales están en el fragmento `00`;
 * los demás, en el de la entidad que la persona declara. Descargarlo solo revela lo que la denuncia
 * ya dice (la entidad o que el ente es federal), nunca el ente ni el área.
 */
export function fragmentKeyFor(stateCode: string, isFederalEnte: boolean): string {
  return isFederalEnte ? FEDERAL_STATE_CODE : stateCode;
}

function checkBasePath(basePath: string): string {
  // Seguridad: solo rutas absolutas del mismo origen; «//» y esquemas apuntarían a terceros.
  if (
    !basePath.startsWith('/') ||
    basePath.startsWith('//') ||
    basePath.includes('\\') ||
    basePath.includes(':')
  ) {
    throw new Error('La ruta del catálogo debe ser del mismo origen (empezar con «/»).');
  }
  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchJson(
  fetcher: FetchLike,
  url: string,
): Promise<{ bytes: ArrayBuffer; json: unknown }> {
  const response = await fetcher(url);
  if (!response.ok)
    throw new Error(
      `No se pudo descargar el catálogo del grupo de anonimato (HTTP ${response.status}).`,
    );
  const bytes = await response.arrayBuffer();
  try {
    return { bytes, json: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    throw new Error('El catálogo del grupo de anonimato no es JSON válido.');
  }
}

/**
 * Crea un cargador para una denuncia. Pide `indice.json` una vez y, como máximo, un fragmento: el
 * de la entidad declarada. Si se pide otra entidad, lanza `Error` en lugar de descargarla.
 */
export function createAnonymityLoader(options: AnonymityLoaderOptions): AnonymityLoader {
  const basePath = checkBasePath(options.basePath ?? DEFAULT_BASE_PATH);
  const shouldVerify = options.shouldVerifyDigest ?? true;
  let indexPromise: Promise<AnonymityIndex> | null = null;
  let requestedState: string | null = null;
  let statePromise: Promise<AnonymityData> | null = null;

  const loadIndex = (): Promise<AnonymityIndex> => {
    indexPromise ??= fetchJson(options.fetch, `${basePath}indice.json`).then(({ json }) =>
      parseAnonymityIndex(json),
    );
    return indexPromise;
  };

  const loadState = (stateCode: string): Promise<AnonymityData> => {
    if (!/^\d{2}$/u.test(stateCode))
      return Promise.reject(new Error('La clave de entidad debe tener dos dígitos.'));
    if (requestedState !== null && requestedState !== stateCode) {
      return Promise.reject(
        new Error(
          'Este cargador ya consultó otra entidad: solo se descarga un fragmento por denuncia.',
        ),
      );
    }
    requestedState = stateCode;
    statePromise ??= (async (): Promise<AnonymityData> => {
      const index = await loadIndex();
      const entry = index.entries.find((item) => item.stateCode === stateCode);
      if (entry === undefined || !entry.hasData || entry.file === null) {
        return {
          kind: 'no-data',
          stateCode,
          stateName: entry?.stateName ?? stateCode,
          cutoffDate: index.cutoffDate,
        };
      }
      const { bytes, json } = await fetchJson(options.fetch, `${basePath}${entry.file}`);
      if (shouldVerify && entry.sha256 !== null && (await sha256Hex(bytes)) !== entry.sha256) {
        throw new Error('El fragmento del grupo de anonimato no coincide con el índice publicado.');
      }
      const fragment = parseAnonymityFragment(json);
      if (fragment.stateCode !== stateCode)
        throw new Error('El fragmento descargado es de otra entidad.');
      return { kind: 'fragment', fragment, cutoffDate: index.cutoffDate };
    })();
    return statePromise;
  };

  return { loadIndex, loadState };
}
