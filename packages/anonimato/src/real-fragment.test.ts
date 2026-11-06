// Comprueba que los productos reales del repositorio (agregados, sin nombres de personas) tienen el
// formato que espera el paquete. No aserta nombres concretos: solo estructura y coherencia.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessAnonymityGroup } from './assess.ts';
import { parseAnonymityFragment, parseAnonymityIndex } from './fragment.ts';
import { createAnonymityLoader } from './loader.ts';
import type { FetchLike } from './loader.ts';

const DATA_DIR = new URL('../../../datos/grupos-anonimato/', import.meta.url);

const diskFetch: FetchLike = (url) => {
  const name = url.replace('/datos/grupos-anonimato/', '');
  const bytes = readFileSync(new URL(name, DATA_DIR));
  return Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
  });
};

describe('productos reales de datos/grupos-anonimato', () => {
  it('el índice se valida y Querétaro (22) aparece sin datos', () => {
    const index = parseAnonymityIndex(
      JSON.parse(readFileSync(new URL('indice.json', DATA_DIR), 'utf8')),
    );
    expect(index.k).toBe(10);
    expect(index.entries.find((entry) => entry.stateCode === '22')).toMatchObject({
      hasData: false,
      file: null,
    });
    expect(
      index.entries.filter((entry) => entry.hasData).every((entry) => entry.sha256 !== null),
    ).toBe(true);
  });

  it('el fragmento federal pasa la validación y el digesto del índice', async () => {
    const data = await createAnonymityLoader({ fetch: diskFetch }).loadState('00');
    expect(data.kind).toBe('fragment');
    if (data.kind !== 'fragment') return;
    const { fragment } = data;
    expect(fragment.stateCode).toBe('00');
    expect(fragment.entes.length).toBeGreaterThan(0);
    for (const ente of fragment.entes) {
      if (ente.poolIndex === null) expect(['10-49', '50+']).toContain(ente.bucket);
      for (const area of ente.areas) expect(['10-49', '50+']).toContain(area.bucket);
    }
    // Cualquier ente publicado se encuentra por su propio nombre y da un riesgo conocido.
    const first = fragment.entes[0];
    if (first !== undefined)
      expect(assessAnonymityGroup(data, { ente: first.name }).risk).not.toBe('unknown');
  });

  it('Querétaro (22) responde «sin datos» sin descargar fragmento', async () => {
    const data = await createAnonymityLoader({ fetch: diskFetch }).loadState('22');
    expect(data.kind).toBe('no-data');
  });

  it('todos los fragmentos publicados tienen el formato de la versión 1', () => {
    const index = parseAnonymityIndex(
      JSON.parse(readFileSync(new URL('indice.json', DATA_DIR), 'utf8')),
    );
    for (const entry of index.entries) {
      if (entry.file === null) continue;
      const fragment = parseAnonymityFragment(
        JSON.parse(readFileSync(new URL(entry.file, DATA_DIR), 'utf8')),
      );
      expect(fragment.stateCode).toBe(entry.stateCode);
    }
  });
});
