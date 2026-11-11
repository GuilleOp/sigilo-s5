// Pruebas de la carga del corte nacional en el observatorio: en red verificada se usa el corte del
// enrutador; sin red, con fallo o con un corte vacío, se cae a los datos de ejemplo con su motivo.
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES } from '@sigilo/contracts';
import type { NationalOpenData } from '@sigilo/contracts';
import { createNetworkFixture } from '../../../../../packages/red/src/test-fixtures.ts';
import type { NetworkState } from '../../network/directory.ts';
import type { ApiClient } from '../../services/api-client.ts';
import { ApiRequestError } from '../../services/api-client.ts';
import {
  cutTotal,
  loadNetworkOutcomes,
  nodeNotes,
  statusTotals,
  suppressedRow,
} from './network-outcomes.ts';

const CUT: NationalOpenData = {
  v: 1,
  cutAt: '2026-11-09T17:00Z',
  closedBefore: '2026-11',
  directorySerial: 1,
  minCell: 5,
  rounding: 5,
  nodes: [
    {
      nodeId: 'node.queretaro',
      name: 'Nodo estatal Querétaro',
      status: 'included',
      rejection: null,
      cells: 3,
      total: 30,
      ledgerHead: null,
      nationalEntrySeq: null,
    },
    {
      nodeId: 'node.federal',
      name: 'Nodo Federal y común',
      status: 'unreachable',
      rejection: null,
      cells: 0,
      total: 0,
      ledgerHead: null,
      nationalEntrySeq: null,
    },
  ],
  cells: [
    { stateCode: '22', offenseCode: 'LGRA-52', month: '2026-10', status: 'archived', count: 10 },
    { stateCode: '22', offenseCode: 'LGRA-57', month: '2026-10', status: 'received', count: 5 },
    { stateCode: '09', offenseCode: 'LGRA-52', month: '2026-09', status: 'archived', count: 10 },
  ],
  suppressed: 5,
};

function verified(): NetworkState {
  return { kind: 'verified', directory: createNetworkFixture().signed.directory };
}

/** Cliente falso que responde `value` (o lanza) y anota las rutas pedidas. */
function clientWith(value: unknown | Error): ApiClient & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    json: async <T>(path: string, schema: { safeParse(raw: unknown): unknown }) => {
      paths.push(path);
      if (value instanceof Error) throw value;
      const parsed = schema.safeParse(value) as { success: boolean; data?: T };
      if (!parsed.success) throw new ApiRequestError('invalid_response', 200);
      return parsed.data as T;
    },
    text: async () => '',
    blob: async () => new Blob(),
  };
}

describe('loadNetworkOutcomes', () => {
  it('en red verificada usa el corte nacional del paso del mismo origen', async () => {
    const client = clientWith(CUT);
    expect(await loadNetworkOutcomes(verified(), client)).toEqual({ kind: 'network', cut: CUT });
    expect(client.paths).toEqual([NETWORK_ROUTES.nationalOpenData]);
  });

  it('sin red no pide nada y usa los datos de ejemplo', async () => {
    const client = clientWith(CUT);
    expect(await loadNetworkOutcomes({ kind: 'single-node' }, client)).toEqual({
      kind: 'example',
      reason: 'single-node',
      cut: null,
    });
    expect(await loadNetworkOutcomes({ kind: 'unavailable' }, client)).toMatchObject({
      reason: 'unavailable',
    });
    expect(client.paths).toEqual([]);
  });

  it('cae a los datos de ejemplo si el corte no llega, no es válido o está vacío', async () => {
    const missing = await loadNetworkOutcomes(
      verified(),
      clientWith(new ApiRequestError('not_found', 404)),
    );
    expect(missing).toEqual({ kind: 'example', reason: 'no-cut', cut: null });
    const invalid = await loadNetworkOutcomes(verified(), clientWith({ ...CUT, v: 2 }));
    expect(invalid).toMatchObject({ kind: 'example', reason: 'no-cut' });
    const empty = { ...CUT, cells: [], suppressed: 0 };
    expect(await loadNetworkOutcomes(verified(), clientWith(empty))).toEqual({
      kind: 'example',
      reason: 'empty',
      cut: empty,
    });
  });
});

describe('resumen del corte', () => {
  it('suma por estatus en el orden del catálogo; las suprimidas van aparte', () => {
    expect(cutTotal(CUT)).toBe(30);
    expect(statusTotals(CUT).map((row) => [row.key, row.count])).toEqual([
      ['received', 5],
      ['archived', 20],
    ]);
    expect(suppressedRow(CUT)?.count).toBe(5);
    expect(suppressedRow({ ...CUT, suppressed: 0 })).toBeNull();
  });

  it('dice qué nodo quedó sin datos en este corte', () => {
    expect(nodeNotes(CUT)).toEqual([
      'Sin datos de Nodo Federal y común en este corte: no respondió.',
    ]);
    const rejected = {
      ...CUT,
      nodes: CUT.nodes.map((node) => ({
        ...node,
        status: 'rejected' as const,
        rejection: 'open-month' as const,
      })),
    };
    expect(nodeNotes(rejected)).toHaveLength(2);
    expect(nodeNotes(rejected)[0]).toContain('no cumplió las reglas de publicación');
  });
});
