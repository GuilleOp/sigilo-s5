// Agregador nacional de datos abiertos (Bases de la PDN, arts. 60 y 61): en cada corte descarga el
// CSV público de cada nodo del directorio, lo valida, suma por entidad, conducta, mes y estatus,
// vuelve a aplicar la celda mínima y guarda el último corte para servirlo en JSON y en CSV.
// Igual que en el S1, la SESNA consulta números y pruebas, nunca denuncias: el enrutador solo lee
// la ruta pública que cualquiera puede descargar.
import {
  ComplaintStatusSchema,
  MonthPeriodSchema,
  OffenseCodeSchema,
  OPEN_DATA_MIN_CELL,
  OPEN_DATA_ROUNDING,
  ROUTES,
  StateCodeSchema,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  ComplaintStatus,
  DirectoryNode,
  NATIONAL_OPEN_DATA_REJECTIONS,
  NationalOpenData,
  NationalOpenDataCell,
  NationalOpenDataNode,
} from '@sigilo/contracts';
import { toHourDate } from '@sigilo/core';
import type { FetchLike } from '@sigilo/red';
import type { NationalLedgerService } from './national-ledger-service.ts';

/** Encabezado exacto del CSV de cada nodo (y del nacional). */
export const OPEN_DATA_CSV_HEADER = 'entidad,conducta,mes_recepcion,estatus,denuncias';

/** Primera columna de la fila final con las denuncias suprimidas. */
const SUPPRESSED_LABEL = 'suprimidas';

/** CSV más grande que se acepta de un nodo. */
export const MAX_NODE_OPEN_DATA_BYTES = 4 * 1024 * 1024;

const COUNT_PATTERN = /^\d{1,9}$/u;

/** Motivo por el que se descarta completo el CSV de un nodo. */
export type OpenDataRejection = (typeof NATIONAL_OPEN_DATA_REJECTIONS)[number];

/** Reglas que debe cumplir cada CSV y que se vuelven a aplicar al sumar. */
export interface OpenDataRules {
  /** Mes en curso: solo se aceptan meses anteriores (cerrados). */
  closedBefore: string;
  minCell: number;
  rounding: number;
}

/** CSV de un nodo ya validado. */
export interface ParsedNodeOpenData {
  cells: NationalOpenDataCell[];
  suppressed: number;
}

function cellKey(
  cell: Pick<NationalOpenDataCell, 'stateCode' | 'offenseCode' | 'month' | 'status'>,
) {
  return `${cell.month}|${cell.stateCode}|${cell.offenseCode}|${cell.status}`;
}

/**
 * Valida el CSV público de un nodo. Devuelve sus celdas y su fila de suprimidas, o el primer motivo
 * por el que se rechaza completo: encabezado distinto, fila que no cumple los catálogos, mes no
 * cerrado, conteo que no es múltiplo del redondeo o menor que la celda mínima, celda repetida, o
 * fila de suprimidas ausente o mal formada.
 * Seguridad: un nodo que publica de más (un mes abierto o una celda pequeña) no entra al corte
 * nacional; así el consolidado nunca rebaja las reglas de publicación de los nodos.
 */
export function parseNodeOpenDataCsv(
  text: string,
  rules: OpenDataRules,
): ParsedNodeOpenData | { rejection: OpenDataRejection } {
  if (text.length > MAX_NODE_OPEN_DATA_BYTES) return { rejection: 'too-large' };
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  if (lines[0] !== OPEN_DATA_CSV_HEADER) return { rejection: 'header' };
  const last = lines.at(-1)?.split(',') ?? [];
  if (
    lines.length < 2 ||
    last.length !== 5 ||
    last[0] !== SUPPRESSED_LABEL ||
    last.slice(1, 4).some((field) => field !== '') ||
    !COUNT_PATTERN.test(last[4] ?? '') ||
    Number(last[4]) % rules.rounding !== 0
  ) {
    return { rejection: 'suppressed-row' };
  }
  const cells: NationalOpenDataCell[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1, -1)) {
    const fields = line.split(',');
    if (fields.length !== 5) return { rejection: 'row' };
    const [stateCode = '', offenseCode = '', month = '', status = '', count = ''] = fields;
    if (
      !StateCodeSchema.safeParse(stateCode).success ||
      !OffenseCodeSchema.safeParse(offenseCode).success ||
      !MonthPeriodSchema.safeParse(month).success ||
      !ComplaintStatusSchema.safeParse(status).success ||
      !COUNT_PATTERN.test(count)
    ) {
      return { rejection: 'row' };
    }
    if (month >= rules.closedBefore) return { rejection: 'open-month' };
    const value = Number(count);
    if (value % rules.rounding !== 0) return { rejection: 'rounding' };
    if (value < rules.minCell) return { rejection: 'min-cell' };
    const cell: NationalOpenDataCell = {
      stateCode,
      offenseCode,
      month,
      status: status as ComplaintStatus,
      count: value,
    };
    const key = cellKey(cell);
    if (seen.has(key)) return { rejection: 'duplicate' };
    seen.add(key);
    cells.push(cell);
  }
  return { cells, suppressed: Number(last[4]) };
}

/** Lo que se obtuvo de un nodo en un corte. */
export interface NodeOpenDataInput {
  node: Pick<DirectoryNode, 'id' | 'name'>;
  /** Texto del CSV, `null` si el nodo no respondió o `too-large` si anunció uno demasiado grande. */
  csv: string | null | 'too-large';
  /** Cabeza del nodo vigente en la bitácora nacional al hacer el corte. */
  ledger: ReturnType<NationalLedgerService['latestNodeHead']>;
}

/** Datos de un corte nacional. */
export interface NationalCutInput {
  cutAt: Date;
  directorySerial: number;
  rules: OpenDataRules;
  /** Celda mínima después de sumar; por omisión, la misma de cada nodo. */
  nationalMinCell?: number;
  nodes: readonly NodeOpenDataInput[];
}

/**
 * Suma los CSV válidos por entidad, conducta, mes y estatus y vuelve a aplicar la celda mínima: una
 * celda nacional menor que `minCell` pasa a suprimidas. Un nodo sin respuesta queda `unreachable`
 * y uno inválido `rejected`, sin detener el corte.
 * Seguridad: solo se suman conteos ya publicados por cada nodo, así que el corte no revela nada que
 * no esté en los CSV públicos. No se firma: cualquiera puede rehacerlo con esos mismos CSV.
 */
export function buildNationalOpenData(input: NationalCutInput): NationalOpenData {
  const { rules } = input;
  const nationalMinCell = input.nationalMinCell ?? rules.minCell;
  const totals = new Map<string, NationalOpenDataCell>();
  let suppressed = 0;
  const nodes: NationalOpenDataNode[] = input.nodes.map(({ node, csv, ledger }) => {
    const base = {
      nodeId: node.id,
      name: node.name,
      ledgerHead: ledger?.head ?? null,
      nationalEntrySeq: ledger?.entrySeq ?? null,
    };
    if (csv === null) {
      return { ...base, status: 'unreachable', rejection: null, cells: 0, total: 0 };
    }
    const parsed =
      csv === 'too-large' ? { rejection: 'too-large' as const } : parseNodeOpenDataCsv(csv, rules);
    if ('rejection' in parsed) {
      return { ...base, status: 'rejected', rejection: parsed.rejection, cells: 0, total: 0 };
    }
    let total = parsed.suppressed;
    for (const cell of parsed.cells) {
      const key = cellKey(cell);
      const current = totals.get(key);
      totals.set(
        key,
        current === undefined ? { ...cell } : { ...current, count: current.count + cell.count },
      );
      total += cell.count;
    }
    suppressed += parsed.suppressed;
    return { ...base, status: 'included', rejection: null, cells: parsed.cells.length, total };
  });
  const cells: NationalOpenDataCell[] = [];
  for (const [, cell] of [...totals].sort(([left], [right]) => left.localeCompare(right))) {
    if (cell.count < nationalMinCell) suppressed += cell.count;
    else cells.push(cell);
  }
  return {
    v: 1,
    cutAt: toHourDate(input.cutAt),
    closedBefore: rules.closedBefore,
    directorySerial: input.directorySerial,
    minCell: nationalMinCell,
    rounding: rules.rounding,
    nodes,
    cells,
    suppressed,
  };
}

/** CSV del corte nacional: mismas columnas que el de cada nodo y su fila final de suprimidas. */
export function nationalOpenDataCsv(data: NationalOpenData): string {
  const lines = [OPEN_DATA_CSV_HEADER];
  for (const cell of data.cells) {
    lines.push(
      [cell.stateCode, cell.offenseCode, cell.month, cell.status, String(cell.count)].join(','),
    );
  }
  lines.push(`${SUPPRESSED_LABEL},,,,${data.suppressed}`);
  return `${lines.join('\r\n')}\r\n`;
}

/** Mes `AAAA-MM` (UTC) de la fecha: los meses anteriores están cerrados. */
export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/** Dependencias del agregador. */
export interface OpenDataAggregatorDeps {
  directory: () => AuthorityDirectory;
  national: Pick<NationalLedgerService, 'latestNodeHead'>;
  nodeUrl: (node: DirectoryNode) => string;
  fetch: FetchLike;
  /** Reloj del corte (en la demostración, el reloj simulado de los nodos). */
  now: () => Date;
  minCell?: number;
  rounding?: number;
  nationalMinCell?: number;
  timeoutMs?: number;
}

/** Agregador con el último corte en memoria. */
export interface OpenDataAggregator {
  /** Hace un corte nuevo y lo deja como el vigente. */
  run(): Promise<NationalOpenData>;
  /** Último corte, o `null` si todavía no hay ninguno. */
  latest(): NationalOpenData | null;
}

async function downloadCsv(
  deps: OpenDataAggregatorDeps,
  node: DirectoryNode,
): Promise<string | null | 'too-large'> {
  try {
    const response = await deps.fetch(`${deps.nodeUrl(node)}${ROUTES.openDataCsv}`, {
      redirect: 'error',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    });
    if (!response.ok) return null;
    const length = Number(response.headers.get('Content-Length') ?? '0');
    // Un archivo demasiado grande se cuenta como inválido sin leerlo.
    if (length > MAX_NODE_OPEN_DATA_BYTES) return 'too-large';
    return await response.text();
  } catch {
    return null;
  }
}

/** Crea el agregador. Los nodos se consultan en el orden del directorio. */
export function createOpenDataAggregator(deps: OpenDataAggregatorDeps): OpenDataAggregator {
  let latest: NationalOpenData | null = null;
  return {
    async run() {
      const directory = deps.directory();
      const cutAt = deps.now();
      const nodes: NodeOpenDataInput[] = [];
      for (const node of directory.nodes) {
        const csv = await downloadCsv(deps, node);
        nodes.push({ node, csv, ledger: deps.national.latestNodeHead(node.id) });
      }
      latest = buildNationalOpenData({
        cutAt,
        directorySerial: directory.serial,
        rules: {
          closedBefore: monthOf(cutAt),
          minCell: deps.minCell ?? OPEN_DATA_MIN_CELL,
          rounding: deps.rounding ?? OPEN_DATA_ROUNDING,
        },
        ...(deps.nationalMinCell === undefined ? {} : { nationalMinCell: deps.nationalMinCell }),
        nodes,
      });
      return latest;
    },
    latest: () => latest,
  };
}
