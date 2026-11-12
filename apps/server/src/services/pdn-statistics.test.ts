// Pruebas del cálculo de la estadística de la PDN: a quién se atribuye cada indicador, semáforo de
// turnado en días hábiles (a tiempo o vencida), medianas solo con 10 observaciones o más, y
// redondeo y supresión de cada conteo.
import { describe, expect, it } from 'vitest';
import { PdnStatisticsRowSchema } from '@sigilo/contracts';
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
