// Ayudas de prueba: un fetch en memoria que registra cada URL pedida.
import type { FetchLike } from './loader.ts';

/** Fetch sintético que sirve `files` bajo `basePath` y guarda las URL solicitadas. */
export function createMemoryFetch(
  files: Readonly<Record<string, unknown>>,
  basePath = '/datos/grupos-anonimato/',
): { fetch: FetchLike; requests: string[] } {
  const requests: string[] = [];
  const fetch: FetchLike = (url) => {
    requests.push(url);
    const name = url.startsWith(basePath) ? url.slice(basePath.length) : null;
    const body = name === null ? undefined : files[name];
    const bytes = new TextEncoder().encode(
      body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body),
    );
    return Promise.resolve({
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      arrayBuffer: () => Promise.resolve(bytes.slice().buffer),
    });
  };
  return { fetch, requests };
}
