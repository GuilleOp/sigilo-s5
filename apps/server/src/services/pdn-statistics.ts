// Estadística agregada de denuncias para el portal de la PDN (Bases de la PDN, art. 61), con las
// reglas de los datos abiertos (`open-data.ts`): solo meses cerrados, cada uno calculado y congelado
// una sola vez, conteos redondeados al azar a múltiplos de 5 con semilla del mes y celdas menores
// que 5 suprimidas (`null`). La consulta solo elige filas de esa tabla congelada: filtrar no vuelve
// a sumar, así que no permite reconstruir una celda suprimida restando resultados.
import type { DatabaseSync } from 'node:sqlite';
import {
  AuthorityIdSchema,
  CLOSURE_REASONS,
  COMPLAINT_STATUSES,
  OPEN_DATA_MIN_CELL,
  OPEN_DATA_ROUNDING,
  PDN_DEFAULT_PAGE_SIZE,
  PDN_MIN_MEDIAN_OBSERVATIONS,
  TURN_SEMAPHORE,
  turnWaitFor,
} from '@sigilo/contracts';
import type {
  ClosureReason,
  ComplaintStatus,
  ManagementState,
  PdnStatisticsRequest,
  PdnStatisticsResponse,
  PdnStatisticsRow,
  ProcedureAction,
  PublishedCount,
  TurnWait,
} from '@sigilo/contracts';
import { remainingDays } from '@sigilo/core';
import { withTransaction } from '../db/database.ts';
import type {
  PdnStatisticsRepository,
  StatisticsComplaint,
  StatisticsStep,
} from '../db/pdn-statistics-repository.ts';
import { currentMonth, hmacNoiseUnit, newNoiseSeed, randomRound } from './open-data.ts';
import type { NoiseUnit } from './open-data.ts';

/** Estado de gestión en que deja la denuncia cada acción que la mete a una espera del semáforo. */
const WAIT_ENTRY: Partial<Record<ProcedureAction, ManagementState>> = {
  received: 'received_in_inbox',
  returned_to_inbox: 'returned_to_inbox',
  routed: 'routed',
  reassigned: 'reassigned',
};

/** Acciones que cambian la autoridad o el estado de gestión (no avances de etapa ni excusas). */
const MOVES: ReadonlySet<ProcedureAction> = new Set([
  'received',
  'routed',
  'accepted',
  'reassigned',
  'returned_to_inbox',
  'closed',
]);

/** Último día (`AAAA-MM-DD`) del mes `AAAA-MM`. */
export function lastDayOf(month: string): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, monthNumber, 0));
  return last.toISOString().slice(0, 10);
}

/** Días hábiles entre dos días legales, o `null` si salen del calendario. */
function businessDays(from: string, to: string): number | null {
  try {
    return to <= from ? 0 : remainingDays(from, to, 'business_days');
  } catch {
    return null;
  }
}

/** Mediana inferior, o `null` con menos de `PDN_MIN_MEDIAN_OBSERVATIONS` observaciones. */
function median(values: readonly number[]): number | null {
  if (values.length < PDN_MIN_MEDIAN_OBSERVATIONS) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? null;
}

/** Conteos reales de una fila, antes de redondear. */
interface RawRow {
  authorityId: string;
  stateCode: string;
  offenseCode: string;
  received: number;
  routedOnTime: number;
  routedLate: number;
  acceptedOnTime: number;
  acceptedLate: number;
  archived: Record<ClosureReason, number>;
  serious: number;
  nonSerious: number;
  escalations: number;
  statuses: Record<ComplaintStatus, number>;
  routingDays: number[];
  acceptanceDays: number[];
  closureDays: number[];
}

function emptyRow(authorityId: string, complaint: StatisticsComplaint): RawRow {
  return {
    authorityId,
    stateCode: complaint.stateCode,
    offenseCode: complaint.offenseCode,
    received: 0,
    routedOnTime: 0,
    routedLate: 0,
    acceptedOnTime: 0,
    acceptedLate: 0,
    archived: Object.fromEntries(CLOSURE_REASONS.map((item) => [item.key, 0])) as Record<
      ClosureReason,
      number
    >,
    serious: 0,
    nonSerious: 0,
    escalations: 0,
    statuses: Object.fromEntries(COMPLAINT_STATUSES.map((item) => [item.key, 0])) as Record<
      ComplaintStatus,
      number
    >,
    routingDays: [],
    acceptanceDays: [],
    closureDays: [],
  };
}

/**
 * Calcula los conteos reales de un mes cerrado. Cada indicador se atribuye a una autoridad: la que
 * tenía la denuncia al cerrar el día de recepción (recibidas y estatus), la que esperaba turnarla
 * (turnos), la que aceptó, la que cerró, la que calificó y la de la regla cumplida.
 */
export function computeMonth(repository: PdnStatisticsRepository, month: string): RawRow[] {
  const lastDay = lastDayOf(month);
  const complaints = repository.complaintsTouching(month);
  const byFolio = new Map(complaints.map((item) => [item.folio, item]));
  const steps = repository.stepsUntil(
    complaints.map((item) => item.folio),
    lastDay,
  );
  const stepsByFolio = new Map<string, StatisticsStep[]>();
  for (const step of steps) {
    const list = stepsByFolio.get(step.folio) ?? [];
    list.push(step);
    stepsByFolio.set(step.folio, list);
  }
  const rows = new Map<string, RawRow>();
  const row = (authorityId: string, complaint: StatisticsComplaint): RawRow => {
    const key = `${authorityId}|${complaint.stateCode}|${complaint.offenseCode}`;
    let current = rows.get(key);
    if (current === undefined) {
      current = emptyRow(authorityId, complaint);
      rows.set(key, current);
    }
    return current;
  };
  const inMonth = (day: string): boolean => day.slice(0, 7) === month;
  const statuses = repository.statusAt(month, lastDay);

  for (const complaint of complaints) {
    const list = stepsByFolio.get(complaint.folio) ?? [];
    if (inMonth(complaint.receivedOn)) {
      // Autoridad al cerrar el día de recepción (la ventanilla única ya pudo turnarla).
      const sameDay = list.filter(
        (step) => step.on === complaint.receivedOn && MOVES.has(step.action),
      );
      const holder = sameDay.at(-1)?.authorityId;
      if (holder !== undefined) {
        const target = row(holder, complaint);
        target.received += 1;
        const status = statuses.get(complaint.folio);
        if (status !== undefined) target.statuses[status] += 1;
      }
    }
    let wait: { kind: TurnWait; sinceOn: string; authorityId: string } | null = null;
    for (const step of list) {
      if (!MOVES.has(step.action)) continue;
      if (inMonth(step.on)) {
        const elapsed = wait === null ? null : businessDays(wait.sinceOn, step.legalOn);
        const isLate = elapsed !== null && elapsed >= TURN_SEMAPHORE.overdueAfter;
        if (wait?.kind === 'routing' && step.action === 'routed' && elapsed !== null) {
          const target = row(wait.authorityId, complaint);
          if (isLate) target.routedLate += 1;
          else target.routedOnTime += 1;
          target.routingDays.push(elapsed);
        }
        if (wait?.kind === 'acceptance' && step.action === 'accepted' && elapsed !== null) {
          const target = row(step.authorityId, complaint);
          if (isLate) target.acceptedLate += 1;
          else target.acceptedOnTime += 1;
          target.acceptanceDays.push(elapsed);
        }
        if (step.action === 'closed' && step.closureReason !== null) {
          const target = row(step.authorityId, complaint);
          target.archived[step.closureReason] += 1;
          const days = businessDays(complaint.receivedLegalOn, step.legalOn);
          if (days !== null) target.closureDays.push(days);
        }
      }
      const state = WAIT_ENTRY[step.action];
      const kind = state === undefined ? null : turnWaitFor(state);
      wait = kind === null ? null : { kind, sinceOn: step.legalOn, authorityId: step.authorityId };
    }
  }
  for (const item of repository.qualificationsOf(month)) {
    const complaint = byFolio.get(item.folio);
    if (complaint === undefined) continue;
    const target = row(item.authorityId, complaint);
    if (item.isSerious) target.serious += 1;
    else target.nonSerious += 1;
  }
  for (const item of repository.escalationsOf(month)) {
    const complaint = byFolio.get(item.folio);
    if (complaint !== undefined) row(item.authorityId, complaint).escalations += 1;
  }
  return [...rows.values()];
}

/**
 * Redondea al azar cada conteo con la semilla del mes y suprime los menores que la celda mínima.
 * Las filas sin ningún valor publicado no aparecen.
 * Seguridad: igual que en el CSV de datos abiertos, cada conteo es un redondeo insesgado del real
 * con una semilla secreta que solo existe mientras se congela el mes; no se publican totales ni
 * filas marginales, así que restar filas no revela una celda suprimida.
 */
export function publishMonth(
  month: string,
  raw: readonly RawRow[],
  authorityName: (authorityId: string) => string | null,
  noiseSeed: string,
  noiseUnit: NoiseUnit = hmacNoiseUnit,
): PdnStatisticsRow[] {
  const result: PdnStatisticsRow[] = [];
  for (const item of raw) {
    const name = authorityName(item.authorityId);
    if (name === null || !AuthorityIdSchema.safeParse(item.authorityId).success) continue;
    const label = `${item.authorityId}|${item.stateCode}|${item.offenseCode}`;
    let hasValue = false;
    const count = (field: string, value: number): PublishedCount => {
      const published = randomRound(
        value,
        OPEN_DATA_ROUNDING,
        noiseUnit(noiseSeed, `pdn:${label}|${field}`),
      );
      if (published < OPEN_DATA_MIN_CELL) return null;
      hasValue = true;
      return published;
    };
    const medianOf = (values: readonly number[]): number | null => {
      const value = median(values);
      if (value !== null) hasValue = true;
      return value;
    };
    const published: PdnStatisticsRow = {
      mes: month,
      autoridad: { clave: item.authorityId, nombre: name },
      entidad: item.stateCode,
      conducta: item.offenseCode,
      recibidas: count('recibidas', item.received),
      turnadas: {
        aTiempo: count('turnadas.aTiempo', item.routedOnTime),
        vencidas: count('turnadas.vencidas', item.routedLate),
      },
      aceptadas: {
        aTiempo: count('aceptadas.aTiempo', item.acceptedOnTime),
        vencidas: count('aceptadas.vencidas', item.acceptedLate),
      },
      archivadas: Object.fromEntries(
        CLOSURE_REASONS.map((reason) => [
          reason.key,
          count(`archivadas.${reason.key}`, item.archived[reason.key]),
        ]),
      ) as PdnStatisticsRow['archivadas'],
      calificadas: {
        graves: count('calificadas.graves', item.serious),
        noGraves: count('calificadas.noGraves', item.nonSerious),
      },
      escalamientos: count('escalamientos', item.escalations),
      estatusAlCierre: Object.fromEntries(
        COMPLAINT_STATUSES.map((status) => [
          status.key,
          count(`estatus.${status.key}`, item.statuses[status.key]),
        ]),
      ) as PdnStatisticsRow['estatusAlCierre'],
      tiemposMedianosDiasHabiles: {
        turno: medianOf(item.routingDays),
        aceptacion: medianOf(item.acceptanceDays),
        archivo: medianOf(item.closureDays),
      },
    };
    if (hasValue) result.push(published);
  }
  return result;
}

/** Dependencias del publicador. */
export interface PdnStatisticsDeps {
  db: DatabaseSync;
  repository: PdnStatisticsRepository;
  /** Nombre de una autoridad del nodo, o `null` si no la aloja. */
  authorityName: (authorityId: string) => string | null;
  now: () => Date;
  noiseUnit?: NoiseUnit;
}

/**
 * Congela cada mes cerrado que falte. El cálculo usa solo actos fechados hasta el último día del
 * mes, así que el resultado no depende de cuándo se congela.
 */
export function freezePdnStatistics(deps: PdnStatisticsDeps): string[] {
  const month = currentMonth(deps.now());
  const frozen = new Set(deps.repository.listFrozenMonths());
  const missing = deps.repository.listActiveMonthsBefore(month).filter((item) => !frozen.has(item));
  if (missing.length === 0) return [];
  return withTransaction(deps.db, () => {
    const already = new Set(deps.repository.listFrozenMonths());
    const added: string[] = [];
    for (const item of missing) {
      if (already.has(item)) continue;
      const rows = publishMonth(
        item,
        computeMonth(deps.repository, item),
        deps.authorityName,
        // Seguridad: la semilla vive solo durante el congelado; nadie puede volver a sortear.
        newNoiseSeed(),
        deps.noiseUnit,
      );
      deps.repository.insertMonth(item, rows);
      added.push(item);
    }
    return added;
  });
}

type SortField = 'mes' | 'autoridad' | 'entidad' | 'conducta';

function sortValue(row: PdnStatisticsRow, field: SortField): string {
  switch (field) {
    case 'mes':
      return row.mes;
    case 'autoridad':
      return row.autoridad.clave;
    case 'entidad':
      return row.entidad;
    case 'conducta':
      return row.conducta;
  }
}

const DEFAULT_SORT: readonly [SortField, 'asc' | 'desc'][] = [
  ['mes', 'asc'],
  ['autoridad', 'asc'],
  ['entidad', 'asc'],
  ['conducta', 'asc'],
];

/** Resultado de una consulta: la página o `invalid-page` si `page` pasa de la última. */
export type PdnStatisticsQueryResult = PdnStatisticsResponse | 'invalid-page';

/**
 * Filtra, ordena y pagina las filas congeladas.
 * Seguridad: los filtros solo seleccionan filas ya publicadas; ninguno vuelve a sumar.
 */
export function queryPdnStatistics(
  rows: readonly PdnStatisticsRow[],
  request: PdnStatisticsRequest,
): PdnStatisticsQueryResult {
  const query = request.query ?? {};
  const matching = rows.filter(
    (row) =>
      (query.mes === undefined || row.mes === query.mes) &&
      (query.mesDesde === undefined || row.mes >= query.mesDesde) &&
      (query.mesHasta === undefined || row.mes <= query.mesHasta) &&
      (query.entidad === undefined || row.entidad === query.entidad) &&
      (query.autoridad === undefined || row.autoridad.clave === query.autoridad) &&
      (query.conducta === undefined || row.conducta === query.conducta) &&
      (query.estatus === undefined || row.estatusAlCierre[query.estatus] !== null),
  );
  const requested = Object.entries(request.sort ?? {}) as [SortField, 'asc' | 'desc'][];
  const order = [
    ...requested,
    ...DEFAULT_SORT.filter(([field]) => !requested.some(([item]) => item === field)),
  ];
  const sorted = [...matching].sort((left, right) => {
    for (const [field, direction] of order) {
      const compared = sortValue(left, field).localeCompare(sortValue(right, field), 'es');
      if (compared !== 0) return direction === 'asc' ? compared : -compared;
    }
    return 0;
  });
  const pageSize = request.pageSize ?? PDN_DEFAULT_PAGE_SIZE;
  const page = request.page ?? 1;
  const start = (page - 1) * pageSize;
  if (page > 1 && start >= sorted.length) return 'invalid-page';
  return {
    pagination: {
      pageSize,
      page,
      totalRows: sorted.length,
      hasNextPage: start + pageSize < sorted.length,
    },
    results: sorted.slice(start, start + pageSize),
  };
}
