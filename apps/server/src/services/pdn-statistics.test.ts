// Pruebas del cálculo de la estadística de la PDN: a quién se atribuye cada indicador, semáforo de
// turnado en días hábiles (a tiempo o vencida), medianas solo con 10 observaciones o más, y
// redondeo y supresión de cada conteo.
import { describe, expect, it } from 'vitest';
import type { PdnStatisticsRepository, StatisticsStep } from '../db/pdn-statistics-repository.ts';
import { computeMonth, lastDayOf, publishMonth, queryPdnStatistics } from './pdn-statistics.ts';

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
    if (all === 'invalid-page' || one === 'invalid-page') throw new Error('página');
    expect(one.results).toEqual(rows.filter((row) => row.autoridad.clave === OIC));
    expect(one.pagination.totalRows).toBeLessThanOrEqual(all.pagination.totalRows);
    expect(lastDayOf('2026-02')).toBe('2026-02-28');
  });
});
