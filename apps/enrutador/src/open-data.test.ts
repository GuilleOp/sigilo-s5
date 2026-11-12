// Pruebas del agregador nacional de datos abiertos: suma de los CSV de los nodos, celda mínima
// después de sumar, nodo caído, CSV inválido rechazado completo y rutas públicas del corte.
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES, NationalOpenDataSchema, ROUTES } from '@sigilo/contracts';
import type { FetchLike } from '@sigilo/red';
import { createRouterApp } from './app.ts';
import {
  OPEN_DATA_CSV_HEADER,
  buildNationalOpenData,
  createOpenDataAggregator,
  nationalOpenDataCsv,
  parseNodeOpenDataCsv,
} from './open-data-aggregator.ts';
import type { NodeOpenDataInput, OpenDataRules } from './open-data-aggregator.ts';
import { NODE_URLS, TEST_DAY, createTestRouter } from './test-support.ts';

const RULES: OpenDataRules = { closedBefore: '2026-11', minCell: 5, rounding: 5 };
const CUT_AT = new Date(`${TEST_DAY}T12:34:00Z`);

/** CSV sintético con el formato del servidor de referencia. */
function csv(rows: readonly string[], suppressed = 0): string {
  return `${[OPEN_DATA_CSV_HEADER, ...rows, `suprimidas,,,,${suppressed}`].join('\r\n')}\r\n`;
}

function input(id: string, text: string | null): NodeOpenDataInput {
  return { node: { id, name: `Nodo ${id}` }, csv: text, ledger: null };
}

describe('parseNodeOpenDataCsv', () => {
  it('acepta el CSV del nodo con su fila de suprimidas', () => {
    const parsed = parseNodeOpenDataCsv(
      csv(['22,LGRA-52,2026-10,investigating,10', '09,LGRA-57,2026-09,archived,5'], 5),
      RULES,
    );
    expect(parsed).toEqual({
      cells: [
        {
          stateCode: '22',
          offenseCode: 'LGRA-52',
          month: '2026-10',
          status: 'investigating',
          count: 10,
        },
        { stateCode: '09', offenseCode: 'LGRA-57', month: '2026-09', status: 'archived', count: 5 },
      ],
      suppressed: 5,
    });
    expect(parseNodeOpenDataCsv(csv([]), RULES)).toEqual({ cells: [], suppressed: 0 });
  });

  it('rechaza completo el CSV que no cumple el esquema o las reglas de publicación', () => {
    const cases: [string, string][] = [
      ['entidad,conducta,mes,estatus,denuncias\r\nsuprimidas,,,,0\r\n', 'header'],
      [`${OPEN_DATA_CSV_HEADER}\r\n22,LGRA-52,2026-10,investigating,10\r\n`, 'suppressed-row'],
      [csv([], 3), 'suppressed-row'],
      [csv(['99,LGRA-52,2026-10,investigating,10']), 'row'],
      [csv(['22,LGRA-52,2026-10,inventado,10']), 'row'],
      [csv(["'=1,LGRA-52,2026-10,investigating,10"]), 'row'],
      [csv(['22,LGRA-52,2026-10,investigating,10,extra']), 'row'],
      [csv(['22,LGRA-52,2026-11,investigating,10']), 'open-month'],
      [csv(['22,LGRA-52,2026-10,investigating,7']), 'rounding'],
      [csv(['22,LGRA-52,2026-10,investigating,0']), 'min-cell'],
      [
        csv(['22,LGRA-52,2026-10,investigating,5', '22,LGRA-52,2026-10,investigating,5']),
        'duplicate',
      ],
    ];
    for (const [text, rejection] of cases) {
      expect(parseNodeOpenDataCsv(text, RULES), rejection).toEqual({ rejection });
    }
  });
});

describe('buildNationalOpenData', () => {
  it('suma por entidad, conducta, mes y estatus y junta las suprimidas', () => {
    const cut = buildNationalOpenData({
      cutAt: CUT_AT,
      directorySerial: 3,
      rules: RULES,
      nodes: [
        input(
          'node.queretaro',
          csv(['22,LGRA-52,2026-10,investigating,10', '22,LGRA-57,2026-10,archived,5'], 5),
        ),
        input('node.federal', csv(['22,LGRA-52,2026-10,investigating,5'], 10)),
      ],
    });
    expect(NationalOpenDataSchema.parse(cut)).toEqual(cut);
    expect(cut.cutAt).toBe(`${TEST_DAY}T12:00Z`);
    expect(cut.cells).toEqual([
      {
        stateCode: '22',
        offenseCode: 'LGRA-52',
        month: '2026-10',
        status: 'investigating',
        count: 15,
      },
      { stateCode: '22', offenseCode: 'LGRA-57', month: '2026-10', status: 'archived', count: 5 },
    ]);
    expect(cut.suppressed).toBe(15);
    expect(cut.nodes.map((node) => [node.nodeId, node.status, node.cells, node.total])).toEqual([
      ['node.queretaro', 'included', 2, 20],
      ['node.federal', 'included', 1, 15],
    ]);
    expect(nationalOpenDataCsv(cut)).toBe(
      csv(['22,LGRA-52,2026-10,investigating,15', '22,LGRA-57,2026-10,archived,5'], 15),
    );
  });

  it('vuelve a aplicar la celda mínima después de sumar', () => {
    const cut = buildNationalOpenData({
      cutAt: CUT_AT,
      directorySerial: 1,
      rules: RULES,
      nationalMinCell: 10,
      nodes: [
        input(
          'node.queretaro',
          csv(['22,LGRA-52,2026-10,investigating,5', '22,LGRA-57,2026-10,archived,5']),
        ),
        input('node.federal', csv(['22,LGRA-52,2026-10,investigating,5'])),
      ],
    });
    // 5 + 5 llega a 10 y se publica; la celda que solo tiene 5 pasa a suprimidas.
    expect(cut.cells.map((cell) => [cell.offenseCode, cell.count])).toEqual([['LGRA-52', 10]]);
    expect(cut.suppressed).toBe(5);
    expect(cut.minCell).toBe(10);
  });

  it('marca el nodo caído y el inválido sin detener el corte ni sumar sus filas', () => {
    const cut = buildNationalOpenData({
      cutAt: CUT_AT,
      directorySerial: 1,
      rules: RULES,
      nodes: [
        input('node.queretaro', csv(['22,LGRA-52,2026-10,investigating,10'])),
        input('node.federal', null),
        input('node.oaxaca', csv(['22,LGRA-52,2026-11,investigating,50'])),
      ],
    });
    expect(cut.nodes.map((node) => [node.status, node.rejection, node.total])).toEqual([
      ['included', null, 10],
      ['unreachable', null, 0],
      ['rejected', 'open-month', 0],
    ]);
    expect(cut.cells.map((cell) => cell.count)).toEqual([10]);
  });
});

describe('agregador en el enrutador', () => {
  function setup(serve: (nodeId: string) => Response | Promise<Response>) {
    const router = createTestRouter();
    const requested: string[] = [];
    const fetch: FetchLike = async (url) => {
      const target = new URL(typeof url === 'string' ? url : url.url);
      requested.push(target.href);
      const nodeId = Object.entries(NODE_URLS).find(([, base]) => base === target.origin)?.[0];
      if (nodeId === undefined || target.pathname !== ROUTES.openDataCsv) {
        return new Response('', { status: 404 });
      }
      return serve(nodeId);
    };
    const aggregator = createOpenDataAggregator({
      directory: router.directory.directory,
      national: router.national,
      nodeUrl: (node) => node.baseUrl,
      fetch,
      now: () => CUT_AT,
    });
    const app = createRouterApp({
      directory: router.directory,
      national: router.national,
      relay: router.relay,
      openData: aggregator,
      now: () => CUT_AT,
    });
    return { router, aggregator, app, requested };
  }

  it('descarga el CSV público de cada nodo, cita su cabeza y publica el corte en JSON y CSV', async () => {
    const { router, aggregator, app, requested } = setup((nodeId) =>
      nodeId === 'node.queretaro'
        ? new Response(csv(['22,LGRA-52,2026-10,investigating,10'], 5))
        : Promise.reject(new Error('caído')),
    );
    const queretaro = router.directory
      .directory()
      .nodes.find((node) => node.id === 'node.queretaro');
    if (queretaro === undefined) throw new Error('Falta el nodo de prueba.');
    const head = router.nodeHead('node.queretaro', 7, 'a'.repeat(64));
    await router.national.recordNodeHead(queretaro, head, TEST_DAY);

    expect((await app.request(NETWORK_ROUTES.nationalOpenData)).status).toBe(404);
    expect((await app.request(NETWORK_ROUTES.nationalOpenDataCsv)).status).toBe(404);
    await aggregator.run();
    // Solo la ruta pública de datos abiertos de cada nodo; nada del buzón ni de las denuncias.
    expect(requested.map((url) => new URL(url).pathname)).toEqual([
      ROUTES.openDataCsv,
      ROUTES.openDataCsv,
      ROUTES.openDataCsv,
    ]);

    const response = await app.request(NETWORK_ROUTES.nationalOpenData);
    expect(response.status).toBe(200);
    const cut = NationalOpenDataSchema.parse(await response.json());
    expect(cut.directorySerial).toBe(router.signed.directory.serial);
    expect(cut.closedBefore).toBe('2026-11');
    const byId = new Map(cut.nodes.map((node) => [node.nodeId, node]));
    expect(byId.get('node.queretaro')).toMatchObject({ status: 'included', ledgerHead: head });
    expect(byId.get('node.queretaro')?.nationalEntrySeq).toBeGreaterThan(0);
    expect(byId.get('node.federal')).toMatchObject({ status: 'unreachable', ledgerHead: null });
    expect(cut.suppressed).toBe(5);

    const file = await app.request(NETWORK_ROUTES.nationalOpenDataCsv);
    expect(file.headers.get('Content-Type')).toContain('text/csv');
    expect(file.headers.get('Cache-Control')).toBe('no-store');
    expect(await file.text()).toBe(csv(['22,LGRA-52,2026-10,investigating,10'], 5));
  });

  it('rechaza el CSV que anuncia un tamaño excesivo y el que responde con error', async () => {
    const { aggregator } = setup((nodeId) =>
      nodeId === 'node.queretaro'
        ? new Response('', { headers: { 'Content-Length': String(64 * 1024 * 1024) } })
        : new Response('', { status: 500 }),
    );
    const cut = await aggregator.run();
    expect(cut.nodes.map((node) => [node.nodeId, node.status, node.rejection])).toEqual(
      expect.arrayContaining([
        ['node.queretaro', 'rejected', 'too-large'],
        ['node.federal', 'unreachable', null],
      ]),
    );
    expect(cut.cells).toEqual([]);
  });
});
