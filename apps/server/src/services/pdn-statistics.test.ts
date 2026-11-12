// Pruebas del cálculo de la estadística de la PDN: a quién se atribuye cada indicador, semáforo de
// turnado en días hábiles (a tiempo o vencida), medianas solo con 10 observaciones o más, y
// redondeo y supresión de cada conteo.
import { describe, expect, it } from 'vitest';
import {
  PDN_DEFAULT_PAGE_SIZE,
  PDN_MAX_PAGE_SIZE,
  PdnStatisticsRequestSchema,
  PdnStatisticsRowSchema,
  STATES,
} from '@sigilo/contracts';
import type { PdnStatisticsRepository, StatisticsStep } from '../db/pdn-statistics-repository.ts';
import {
  computeMonth,
  lastDayOf,
  publishMonth,
  queryPdnStatistics,
  toPdnStatisticsRow,
} from './pdn-statistics.ts';

const INBOX = 'authority.buzon-prueba';
const OIC = 'authority.oic-prueba';

function step(
  folio: string,
  position: number,
  action: StatisticsStep['action'],
  on: string,
  authorityId: string,
  closureReason: StatisticsStep['closureReason'] = null,
): StatisticsStep {
  return { folio, position, action, on, legalOn: on, authorityId, closureReason };
}

/** Repositorio en memoria con `count` denuncias iguales: recibidas, turnadas, aceptadas, cerradas. */
function repository(count: number, routedOn: string): PdnStatisticsRepository {
  const folios = Array.from({ length: count }, (_, index) => `F-${index}`);
  return {
    listActiveMonthsBefore: () => ['2026-10'],
    listFrozenMonths: () => [],
    complaintsTouching: () =>
      folios.map((folio) => ({
        folio,
        receivedOn: '2026-10-01',
        receivedLegalOn: '2026-10-01',
        stateCode: '22',
        offenseCode: 'LGRA-52',
      })),
    stepsUntil: () =>
      folios.flatMap((folio) => [
        step(folio, 0, 'received', '2026-10-01', INBOX),
        step(folio, 1, 'routed', routedOn, OIC),
        step(folio, 2, 'accepted', '2026-10-07', OIC),
        step(folio, 3, 'closed', '2026-10-20', OIC, 'attended'),
      ]),
    qualificationsOf: () => folios.map((folio) => ({ folio, authorityId: OIC, isSerious: false })),
    escalationsOf: () => [],
    statusAt: () => new Map(folios.map((folio) => [folio, 'archived' as const])),
    insertMonth: () => undefined,
    listFrozenRows: () => [],
  };
}

const NAMES = (id: string) => (id === INBOX ? 'Buzón' : id === OIC ? 'OIC' : null);

describe('estadística de un mes cerrado', () => {
  it('atribuye cada indicador y cuenta el turnado en días hábiles', () => {
    // 1 de octubre (jueves) → 6 de octubre (martes): 3 días hábiles, ya «vencida».
    const late = computeMonth(repository(1, '2026-10-06'), '2026-10');
    const inbox = late.find((row) => row.authorityId === INBOX);
    const oic = late.find((row) => row.authorityId === OIC);
    expect(inbox).toMatchObject({ received: 1, routedLate: 1, routedOnTime: 0, routingDays: [3] });
    expect(oic).toMatchObject({ acceptedOnTime: 1, nonSerious: 1, acceptanceDays: [1] });
    expect(oic?.archived.attended).toBe(1);
    expect(inbox?.statuses.archived).toBe(1);
    // Turnada al día siguiente (viernes 2): a tiempo.
    const onTime = computeMonth(repository(1, '2026-10-02'), '2026-10');
    expect(onTime.find((row) => row.authorityId === INBOX)?.routedOnTime).toBe(1);
  });

  it('redondea y suprime cada conteo; publica medianas solo con 10 observaciones', () => {
    const roundDown = () => 0.99;
    const nine = publishMonth(
      '2026-10',
      computeMonth(repository(9, '2026-10-06'), '2026-10'),
      NAMES,
      's',
      roundDown,
    );
    const ten = publishMonth(
      '2026-10',
      computeMonth(repository(10, '2026-10-06'), '2026-10'),
      NAMES,
      's',
      roundDown,
    );
    const inboxNine = nine.find((row) => row.autoridad.clave === INBOX);
    expect(inboxNine).toMatchObject({ recibidas: 5, turnadas: { aTiempo: null, vencidas: 5 } });
    expect(inboxNine?.tiemposMedianosDiasHabiles.turno).toBeNull();
    expect(ten.find((row) => row.autoridad.clave === INBOX)?.tiemposMedianosDiasHabiles.turno).toBe(
      3,
    );
    // Con 4 denuncias todo queda bajo 5: ninguna fila.
    expect(
      publishMonth(
        '2026-10',
        computeMonth(repository(4, '2026-10-06'), '2026-10'),
        NAMES,
        's',
        roundDown,
      ),
    ).toEqual([]);
    // Una autoridad que el nodo no aloja no se publica.
    expect(
      publishMonth(
        '2026-10',
        computeMonth(repository(9, '2026-10-06'), '2026-10'),
        () => null,
        's',
        roundDown,
      ),
    ).toEqual([]);
  });

  it('la consulta solo selecciona filas: el total de un filtro nunca supera el de la tabla', () => {
    const rows = publishMonth(
      '2026-10',
      computeMonth(repository(10, '2026-10-06'), '2026-10'),
      NAMES,
      's',
      () => 0.99,
    );
    const all = queryPdnStatistics(rows, {});
    const one = queryPdnStatistics(rows, { query: { autoridad: OIC } });
    expect(one.results).toEqual(
      rows.filter((row) => row.autoridad.clave === OIC).map(toPdnStatisticsRow),
    );
    expect(one.pagination.totalRows).toBeLessThanOrEqual(all.pagination.totalRows);
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
  });
});

describe('formato publicado a la PDN', () => {
  const rows = publishMonth(
    '2026-10',
    computeMonth(repository(10, '2026-10-06'), '2026-10'),
    NAMES,
    's',
    () => 0.99,
  );

  it('cada fila trae id, fechaCaptura y catálogos {clave, valor} en español', () => {
    const { results } = queryPdnStatistics(rows, {});
    for (const row of results) expect(PdnStatisticsRowSchema.parse(row)).toEqual(row);
    const oic = results.find((row) => row.autoridad.clave === OIC);
    expect(oic).toMatchObject({
      id: `2026-10|${OIC}|22|LGRA-52`,
      fechaCaptura: '2026-11-01T00:00Z',
      entidad: { clave: '22', valor: 'Querétaro' },
      conducta: { clave: 'LGRA-52', valor: 'Cohecho' },
    });
    expect(oic?.archivadas.map((item) => item.clave)).toEqual([
      'ATENDIDA',
      'CANALIZADA',
      'IMPROCEDENTE',
      'INFORMACION_INSUFICIENTE',
      'ACUMULADA',
      'OTRO_MOTIVO',
    ]);
    expect(oic?.archivadas[0]).toEqual({ clave: 'ATENDIDA', valor: 'Atendido', total: 10 });
    const inbox = results.find((row) => row.autoridad.clave === INBOX);
    expect(inbox?.estatusAlCierre.find((item) => item.clave === 'ARCHIVADA')?.total).toBe(10);
  });

  it('ignora los filtros vacíos y un id inexistente da results vacío', () => {
    const all = queryPdnStatistics(rows, {});
    const empty = queryPdnStatistics(rows, {
      query: {
        id: '',
        mes: '',
        mesDesde: '',
        mesHasta: '',
        entidad: '',
        autoridad: '',
        conducta: '',
        estatus: '',
      },
    });
    expect(empty).toEqual(all);
    const id = all.results[0]?.id ?? '';
    expect(queryPdnStatistics(rows, { query: { id } }).results.map((row) => row.id)).toEqual([id]);
    expect(queryPdnStatistics(rows, { query: { id: 'no-existe' } })).toEqual({
      pagination: { pageSize: 10, page: 1, totalRows: 0, hasNextPage: false },
      results: [],
    });
    expect(
      queryPdnStatistics(rows, { query: { estatus: 'ARCHIVADA' } }).results.map(
        (row) => row.autoridad.clave,
      ),
    ).toEqual([INBOX]);
  });

  describe('paginación con muchas filas', () => {
    // 250 filas distintas: 5 meses × 5 autoridades × 10 entidades, cada una con su propia clave.
    const base = rows[0];
    if (base === undefined) throw new Error('Sin fila base.');
    const many = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].flatMap((mes) =>
      ['a', 'b', 'c', 'd', 'e'].flatMap((suffix) =>
        STATES.slice(0, 10).map((state) => ({
          ...base,
          mes,
          autoridad: { clave: `authority.oic-${suffix}`, nombre: `OIC ${suffix}` },
          entidad: state.code,
        })),
      ),
    );

    it('pageSize 1, 200 y por omisión; 0 y 201 no pasan el esquema', () => {
      const parse = (body: unknown) => PdnStatisticsRequestSchema.safeParse(body).success;
      expect(parse({ pageSize: 1 })).toBe(true);
      expect(parse({ pageSize: PDN_MAX_PAGE_SIZE })).toBe(true);
      for (const pageSize of [0, PDN_MAX_PAGE_SIZE + 1, -1, 1.5, '10', null]) {
        expect(parse({ pageSize }), String(pageSize)).toBe(false);
      }
      for (const page of [0, -1, 1.5, 1_000_001, '1']) {
        expect(parse({ page }), String(page)).toBe(false);
      }
      expect(parse({ page: 1_000_000 })).toBe(true);

      expect(queryPdnStatistics(many, {}).results).toHaveLength(PDN_DEFAULT_PAGE_SIZE);
      expect(queryPdnStatistics(many, { pageSize: 1 }).pagination).toEqual({
        pageSize: 1,
        page: 1,
        totalRows: 250,
        hasNextPage: true,
      });
      const full = queryPdnStatistics(many, { pageSize: PDN_MAX_PAGE_SIZE });
      expect(full.results).toHaveLength(200);
      expect(full.pagination.hasNextPage).toBe(true);
      const rest = queryPdnStatistics(many, { pageSize: PDN_MAX_PAGE_SIZE, page: 2 });
      expect(rest.results).toHaveLength(50);
      expect(rest.pagination.hasNextPage).toBe(false);
    });

    it('recorrer todas las páginas da cada fila una vez, en el mismo orden, con cualquier tamaño', () => {
      const ids = (pageSize: number, sort?: { entidad: 'desc' }) => {
        const seen: string[] = [];
        for (let page = 1; ; page += 1) {
          const result = queryPdnStatistics(many, { pageSize, page, ...(sort && { sort }) });
          expect(result.pagination.totalRows).toBe(250);
          seen.push(...result.results.map((row) => row.id));
          if (!result.pagination.hasNextPage) break;
        }
        return seen;
      };
      const reference = ids(PDN_MAX_PAGE_SIZE);
      expect(new Set(reference).size).toBe(250);
      for (const size of [1, 7, 10, 125, 249, 250]) expect(ids(size)).toEqual(reference);
      const descending = ids(PDN_MAX_PAGE_SIZE, { entidad: 'desc' });
      expect(ids(13, { entidad: 'desc' })).toEqual(descending);
      expect(descending).not.toEqual(reference);
    });

    it('la última página exacta no anuncia otra; la siguiente y una lejana vienen vacías', () => {
      const exact = queryPdnStatistics(many, { pageSize: 125, page: 2 });
      expect(exact.results).toHaveLength(125);
      expect(exact.pagination.hasNextPage).toBe(false);
      for (const page of [3, 1_000_000]) {
        expect(queryPdnStatistics(many, { pageSize: 125, page })).toEqual({
          pagination: { pageSize: 125, page, totalRows: 250, hasNextPage: false },
          results: [],
        });
      }
    });

    it('sin filas: página 1 vacía y sin siguiente', () => {
      expect(queryPdnStatistics([], { pageSize: 1 })).toEqual({
        pagination: { pageSize: 1, page: 1, totalRows: 0, hasNextPage: false },
        results: [],
      });
    });

    it('rangos de meses inclusivos, invertidos vacíos, y el orden se aplica en el de las llaves', () => {
      const between = queryPdnStatistics(many, {
        pageSize: 200,
        query: { mesDesde: '2026-07', mesHasta: '2026-08' },
      });
      expect(between.pagination.totalRows).toBe(100);
      expect(new Set(between.results.map((row) => row.mes))).toEqual(
        new Set(['2026-07', '2026-08']),
      );
      expect(
        queryPdnStatistics(many, { query: { mesDesde: '2026-09', mesHasta: '2026-07' } }).pagination
          .totalRows,
      ).toBe(0);
      // Primero la entidad (desc) y después el mes (desc): las llaves mandan en ese orden.
      const [first] = queryPdnStatistics(many, {
        pageSize: 1,
        sort: { entidad: 'desc', mes: 'desc' },
      }).results;
      expect(first).toMatchObject({ mes: '2026-10', entidad: { clave: STATES[9]?.code } });
      const [other] = queryPdnStatistics(many, {
        pageSize: 1,
        sort: { mes: 'desc', entidad: 'desc' },
      }).results;
      expect(other?.mes).toBe('2026-10');
    });

    it('los filtros vacíos se ignoran combinados con filtros reales y siempre dan {clave, valor}', () => {
      const one = queryPdnStatistics(many, {
        pageSize: 200,
        query: { autoridad: 'authority.oic-c', entidad: '', mes: '2026-08', conducta: '' },
      });
      expect(one.pagination.totalRows).toBe(10);
      for (const row of one.results) {
        expect(PdnStatisticsRowSchema.parse(row)).toEqual(row);
        expect(row.entidad).toEqual({
          clave: row.entidad.clave,
          valor: STATES.find((state) => state.code === row.entidad.clave)?.name,
        });
        for (const item of [...row.archivadas, ...row.estatusAlCierre]) {
          expect(Object.keys(item).sort()).toEqual(['clave', 'total', 'valor']);
        }
      }
    });
  });

  it('una página después de la última responde results vacío con el mismo totalRows', () => {
    const last = queryPdnStatistics(rows, { page: 2, pageSize: 1 });
    expect(last.pagination).toEqual({ pageSize: 1, page: 2, totalRows: 2, hasNextPage: false });
    expect(last.results).toHaveLength(1);
    expect(queryPdnStatistics(rows, { page: 3, pageSize: 1 })).toEqual({
      pagination: { pageSize: 1, page: 3, totalRows: 2, hasNextPage: false },
      results: [],
    });
  });
});
