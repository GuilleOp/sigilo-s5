// Pruebas del cargador: un solo fragmento por denuncia, mismo origen, digesto y entidades sin datos.
import { describe, expect, it } from 'vitest';
import { DEMO_FILES, DEMO_INDEX, DEMO_STATE_FRAGMENT } from './demo-fragment.ts';
import { createAnonymityLoader, fragmentKeyFor } from './loader.ts';
import { createMemoryFetch } from './test-helpers.ts';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('createAnonymityLoader', () => {
  it('pide el índice y un solo fragmento, ambos del mismo origen', async () => {
    const { fetch, requests } = createMemoryFetch(DEMO_FILES);
    const loader = createAnonymityLoader({ fetch });
    const data = await loader.loadState('17');
    expect(data.kind).toBe('fragment');
    await loader.loadState('17');
    expect(requests).toEqual([
      '/datos/grupos-anonimato/indice.json',
      '/datos/grupos-anonimato/17.json',
    ]);
  });

  it('rechaza una segunda entidad sin descargarla', async () => {
    const { fetch, requests } = createMemoryFetch(DEMO_FILES);
    const loader = createAnonymityLoader({ fetch });
    await loader.loadState('17');
    await expect(loader.loadState('00')).rejects.toThrow(/un fragmento por denuncia/u);
    expect(requests.some((url) => url.endsWith('00.json'))).toBe(false);
  });

  it('una entidad sin datos no descarga ningún fragmento', async () => {
    const { fetch, requests } = createMemoryFetch(DEMO_FILES);
    const data = await createAnonymityLoader({ fetch }).loadState('22');
    expect(data).toEqual({
      kind: 'no-data',
      stateCode: '22',
      stateName: 'Querétaro',
      cutoffDate: '2026-10-07',
    });
    expect(requests).toEqual(['/datos/grupos-anonimato/indice.json']);
  });

  it('solo acepta rutas del mismo origen', () => {
    const { fetch } = createMemoryFetch(DEMO_FILES);
    for (const basePath of ['https://cdn.example.org/', '//cdn.example.org/', 'datos/', '/x:y/']) {
      expect(() => createAnonymityLoader({ fetch, basePath })).toThrow(/mismo origen/u);
    }
    expect(() => createAnonymityLoader({ fetch, basePath: '/estaticos/grupos' })).not.toThrow();
  });

  it('comprueba el SHA-256 del fragmento contra el índice', async () => {
    const body = JSON.stringify(DEMO_STATE_FRAGMENT);
    const good = await sha256Hex(body);
    const index = (sha256: string): unknown => ({
      ...DEMO_INDEX,
      entidades: [{ clave: '17', nombre: 'Morelos', archivo: '17.json', hayDatos: true, sha256 }],
    });
    const ok = createMemoryFetch({ 'indice.json': index(good), '17.json': body });
    await expect(createAnonymityLoader({ fetch: ok.fetch }).loadState('17')).resolves.toMatchObject(
      { kind: 'fragment' },
    );
    const bad = createMemoryFetch({ 'indice.json': index('0'.repeat(64)), '17.json': body });
    await expect(createAnonymityLoader({ fetch: bad.fetch }).loadState('17')).rejects.toThrow(
      /no coincide/u,
    );
  });

  it('rechaza un fragmento de otra entidad o con formato inválido', async () => {
    const swapped = createMemoryFetch({ ...DEMO_FILES, '17.json': DEMO_FILES['00.json'] });
    await expect(createAnonymityLoader({ fetch: swapped.fetch }).loadState('17')).rejects.toThrow(
      /otra entidad/u,
    );
    const broken = createMemoryFetch({ ...DEMO_FILES, '17.json': '{"version": 2}' });
    await expect(createAnonymityLoader({ fetch: broken.fetch }).loadState('17')).rejects.toThrow(
      /formato/u,
    );
    const missing = createMemoryFetch({ 'indice.json': DEMO_INDEX });
    await expect(createAnonymityLoader({ fetch: missing.fetch }).loadState('17')).rejects.toThrow(
      /HTTP 404/u,
    );
  });

  it('rechaza claves de entidad que no son de dos dígitos', async () => {
    const { fetch } = createMemoryFetch(DEMO_FILES);
    await expect(createAnonymityLoader({ fetch }).loadState('../00')).rejects.toThrow(
      /dos dígitos/u,
    );
  });
});

describe('fragmentKeyFor', () => {
  it('los entes federales usan el fragmento 00', () => {
    expect(fragmentKeyFor('22', true)).toBe('00');
    expect(fragmentKeyFor('22', false)).toBe('22');
  });
});
