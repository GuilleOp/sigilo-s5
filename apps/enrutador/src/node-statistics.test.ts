// Pruebas del corte nacional de la estadística: la SESNA valida las filas de cada nodo (meses
// cerrados, autoridades propias, sin repetidas, conteos ya redondeados y suprimidos) y no suma a un
// nodo que no da token o que publica de más.
import { describe, expect, it } from 'vitest';
import { PDN_ROUTES, PdnStatisticsRowSchema } from '@sigilo/contracts';
import type { DirectoryNode, PdnStatisticsRow } from '@sigilo/contracts';
import type { FetchLike } from '@sigilo/red';
import { checkNodeRows, createNodeStatisticsAggregator } from './node-statistics.ts';
import type { NodeTokenClient } from './oauth/token-client.ts';
import { createTestNetwork } from './test-support.ts';

const ROW: PdnStatisticsRow = {
  mes: '2026-10',
  autoridad: { clave: 'authority.comptroller-queretaro', nombre: 'Contraloría' },
  entidad: '22',
  conducta: 'LGRA-52',
  recibidas: 10,
  turnadas: { aTiempo: 5, vencidas: null },
  aceptadas: { aTiempo: null, vencidas: null },
  archivadas: {
    attended: null,
    channeled: null,
    inadmissible: null,
    insufficient_information: null,
    joined: null,
    other: null,
  },
  calificadas: { graves: null, noGraves: null },
  escalamientos: null,
  estatusAlCierre: {
    received: null,
    routing: null,
    routed: 10,
    investigating: null,
    classified: null,
    archived: null,
    resolved: null,
  },
  tiemposMedianosDiasHabiles: { turno: null, aceptacion: null, archivo: null },
};

const TOKENS: NodeTokenClient = {
  hasCredentials: (node) => node.id === 'node.queretaro',
  token: async () => 'token-sintetico',
  invalidate: () => undefined,
};

describe('filas de un nodo', () => {
  const { signed } = createTestNetwork();
  const node = { id: 'node.queretaro' };

  it('acepta meses cerrados de autoridades propias y rechaza lo demás', () => {
    expect(checkNodeRows([ROW], node, signed.directory, '2026-11')).toBeNull();
    expect(checkNodeRows([ROW], node, signed.directory, '2026-10')).toBe('open-month');
    expect(
      checkNodeRows(
        [{ ...ROW, autoridad: { clave: 'authority.oic-iffe', nombre: 'OIC' } }],
        node,
        signed.directory,
        '2026-11',
      ),
    ).toBe('foreign-authority');
    expect(checkNodeRows([ROW, ROW], node, signed.directory, '2026-11')).toBe('duplicate');
  });

  it('el esquema rechaza conteos sin redondear o menores que 5', () => {
    expect(PdnStatisticsRowSchema.safeParse({ ...ROW, recibidas: 3 }).success).toBe(false);
    expect(PdnStatisticsRowSchema.safeParse({ ...ROW, recibidas: 7 }).success).toBe(false);
    expect(PdnStatisticsRowSchema.safeParse({ ...ROW, recibidas: null }).success).toBe(true);
  });
});

describe('corte nacional', () => {
  function aggregator(respond: (body: unknown) => Response) {
    const { signed } = createTestNetwork();
    const fetch: FetchLike = async (input, init) => {
      const request = new Request(input, init);
      expect(new URL(request.url).pathname).toBe(PDN_ROUTES.statistics);
      expect(request.headers.get('Authorization')).toBe('Bearer token-sintetico');
      return respond(await request.json());
    };
    return createNodeStatisticsAggregator({
      directory: () => signed.directory,
      nodeUrl: (item: DirectoryNode) => item.baseUrl,
      fetch,
      tokens: TOKENS,
      now: () => new Date('2026-11-09T12:00:00Z'),
    });
  }

  it('pagina, copia las filas con su nodo y marca los nodos sin credenciales', async () => {
    const pages: unknown[] = [];
    const cut = await aggregator((body) => {
      pages.push(body);
      const page = (body as { page: number }).page;
      return Response.json({
        pagination: { pageSize: 200, page, totalRows: 2, hasNextPage: page === 1 },
        results: [{ ...ROW, conducta: page === 1 ? 'LGRA-52' : 'LGRA-57' }],
      });
    }).run();
    expect(pages).toEqual([
      { page: 1, pageSize: 200, query: { mesHasta: '2026-10' } },
      { page: 2, pageSize: 200, query: { mesHasta: '2026-10' } },
    ]);
    expect(cut.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'node.queretaro', status: 'included', rows: 2 }),
        expect.objectContaining({ nodeId: 'node.federal', status: 'no-credentials', rows: 0 }),
      ]),
    );
    expect(cut.rows.map((row) => row.nodeId)).toEqual(['node.queretaro', 'node.queretaro']);
  });

  it('un nodo que rechaza el token o publica un mes abierto no entra al corte', async () => {
    const unauthorized = await aggregator(() => new Response('{}', { status: 401 })).run();
    expect(unauthorized.nodes.find((item) => item.nodeId === 'node.queretaro')).toMatchObject({
      status: 'rejected',
      rejection: 'unauthorized',
    });
    const open = await aggregator(() =>
      Response.json({
        pagination: { pageSize: 200, page: 1, totalRows: 1, hasNextPage: false },
        results: [{ ...ROW, mes: '2026-11' }],
      }),
    ).run();
    expect(open.nodes.find((item) => item.nodeId === 'node.queretaro')?.rejection).toBe(
      'open-month',
    );
    expect(open.rows).toEqual([]);
  });
});
