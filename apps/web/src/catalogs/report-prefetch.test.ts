// Pruebas de la descarga anticipada (ADR 0012): pide todos los fragmentos, deja el grupo de
// anonimato consultable sin red para cualquier entidad, reintenta si falla y la salida rápida la
// borra.
import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_FILES } from '@sigilo/anonimato/demo';
import type { FetchLike } from '@sigilo/anonimato';
import {
  ANONYMITY_BASE_PATH,
  checkAnonymity,
  isAnonymityCatalogPrefetched,
  prefetchAnonymityCatalog,
} from '../anonymity/report-anonymity.ts';
import { resetAllStores } from '../state/memory-store.ts';
import {
  ALL_ENTITY_FRAGMENT_CODES,
  prefetchReportCatalogs,
  reportPrefetchStore,
} from './report-prefetch.ts';

/** `fetch` sintético sobre los archivos de la demostración, con registro y corte de red. */
function demoFetch(): { fetch: FetchLike; requests: string[]; setOffline(value: boolean): void } {
  const requests: string[] = [];
  let isOffline = false;
  const fetch: FetchLike = (url) => {
    if (isOffline) return Promise.reject(new TypeError('Failed to fetch'));
    requests.push(url);
    const content = DEMO_FILES[url.slice(ANONYMITY_BASE_PATH.length)];
    const bytes = new TextEncoder().encode(JSON.stringify(content ?? null));
    return Promise.resolve({
      ok: content !== undefined,
      status: content === undefined ? 404 : 200,
      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
    });
  };
  return {
    fetch,
    requests,
    setOffline: (value) => {
      isOffline = value;
    },
  };
}

const DRAFT = { worksThere: 'yes' as const, area: '', entityId: 'VE-OBRAS' };

afterEach(() => resetAllStores());

describe('prefetchReportCatalogs', () => {
  it('pide los 33 fragmentos de entes y el catálogo de anonimato, una sola vez', async () => {
    const entities: string[] = [];
    let anonymity = 0;
    const dependencies = {
      loadEntity: (code: string) => {
        entities.push(code);
        return Promise.resolve();
      },
      loadAnonymity: () => {
        anonymity += 1;
        return Promise.resolve();
      },
    };
    const first = prefetchReportCatalogs(dependencies);
    expect(reportPrefetchStore.get()).toBe('loading');
    // Una segunda llamada mientras descarga reutiliza la misma descarga.
    expect(prefetchReportCatalogs(dependencies)).toBe(first);
    expect(await first).toBe('ready');
    expect(reportPrefetchStore.get()).toBe('ready');
    await prefetchReportCatalogs(dependencies);
    expect(ALL_ENTITY_FRAGMENT_CODES).toHaveLength(33);
    expect(entities.sort()).toEqual([...ALL_ENTITY_FRAGMENT_CODES].sort());
    expect(anonymity).toBe(1);
  });

  it('si algo falla queda «failed» y la siguiente llamada reintenta', async () => {
    let shouldFail = true;
    const dependencies = {
      loadEntity: (code: string) =>
        shouldFail && code === '22' ? Promise.reject(new Error('sin red')) : Promise.resolve(),
      loadAnonymity: () => Promise.resolve(),
    };
    expect(await prefetchReportCatalogs(dependencies)).toBe('failed');
    expect(reportPrefetchStore.get()).toBe('failed');
    shouldFail = false;
    expect(await prefetchReportCatalogs(dependencies)).toBe('ready');
  });

  it('la salida rápida la borra y una descarga a medias no la revive', async () => {
    let finish = (): void => undefined;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const run = prefetchReportCatalogs({
      loadEntity: () => pending,
      loadAnonymity: () => Promise.resolve(),
    });
    resetAllStores();
    finish();
    await run;
    expect(reportPrefetchStore.get()).toBe('idle');
  });
});

describe('prefetchAnonymityCatalog', () => {
  it('descarga el índice y todos los fragmentos; después consulta cualquier entidad sin red', async () => {
    const network = demoFetch();
    await prefetchAnonymityCatalog(network.fetch);
    expect(isAnonymityCatalogPrefetched()).toBe(true);
    expect([...network.requests].sort()).toEqual([
      '/datos/grupos-anonimato/00.json',
      '/datos/grupos-anonimato/17.json',
      '/datos/grupos-anonimato/indice.json',
    ]);

    network.setOffline(true);
    // Dos entidades distintas en la misma denuncia: ya no hay «otra entidad» que esconder.
    const morelos = await checkAnonymity({ ...DRAFT, stateCode: '17' });
    const queretaro = await checkAnonymity({ ...DRAFT, stateCode: '22' });
    expect(morelos.kind).toBe('assessed');
    expect(queretaro.kind).toBe('assessed');
    expect(network.requests).toHaveLength(3);
  });

  it('si la descarga falla no deja nada y la denuncia vuelve al camino prudente', async () => {
    const network = demoFetch();
    network.setOffline(true);
    await expect(prefetchAnonymityCatalog(network.fetch)).rejects.toThrow();
    expect(isAnonymityCatalogPrefetched()).toBe(false);
  });

  it('la salida rápida borra el catálogo en memoria', async () => {
    await prefetchAnonymityCatalog(demoFetch().fetch);
    resetAllStores();
    expect(isAnonymityCatalogPrefetched()).toBe(false);
  });
});
