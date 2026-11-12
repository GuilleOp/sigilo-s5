// Corte nacional de la estadística para el portal de la PDN (Bases de la PDN, art. 61) con el
// modelo de las APIs de la PDN: cada nodo es el proveedor y la SESNA el cliente. En cada vuelta el
// enrutador pide a cada nodo un token (permiso `sesna:estadisticas`), consulta
// `POST /v1/denuncias/estadisticas` página por página, valida cada fila y guarda el último corte.
// Solo números de meses cerrados, ya redondeados y suprimidos por el nodo: nunca denuncias.
import {
  PDN_MAX_PAGE_SIZE,
  PDN_ROUTES,
  PDN_SCOPES,
  PdnStatisticsResponseSchema,
  pdnStatisticsRowId,
} from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryNode,
  NATIONAL_STATISTICS_REJECTIONS,
  NationalStatistics,
  PdnStatisticsRow,
} from '@sigilo/contracts';
import { toHourDate } from '@sigilo/core';
import type { FetchLike } from '@sigilo/red';
import { monthOf } from './open-data-aggregator.ts';
import type { NodeTokenClient } from './oauth/token-client.ts';

/** Motivo por el que no se sumó la estadística de un nodo. */
export type StatisticsRejection = (typeof NATIONAL_STATISTICS_REJECTIONS)[number];

/** Páginas máximas por nodo (200 filas cada una). */
export const MAX_STATISTICS_PAGES = 50;

/** Dependencias del agregador. */
export interface NodeStatisticsDeps {
  directory: () => AuthorityDirectory;
  nodeUrl: (node: DirectoryNode) => string;
  fetch: FetchLike;
  tokens: NodeTokenClient;
  /** Reloj del corte (en la demostración, el simulado de los nodos). */
  now: () => Date;
  timeoutMs?: number;
}

/** Agregador con el último corte en memoria. */
export interface NodeStatisticsAggregator {
  run(): Promise<NationalStatistics>;
  latest(): NationalStatistics | null;
}

/** Mes anterior a `AAAA-MM`. */
function previousMonth(month: string): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
}

type NodeResult =
  | { status: 'included'; rows: PdnStatisticsRow[] }
  | { status: 'unreachable' | 'no-credentials' }
  | { status: 'rejected'; rejection: StatisticsRejection };

/**
 * Comprueba las filas de un nodo: meses cerrados, autoridades del propio nodo en el directorio,
 * `id` congruente con la fila y sin filas repetidas. Los conteos (múltiplos de 5 y al menos 5, o `null`) ya los exige el esquema.
 * Seguridad: un nodo que publica de más (un mes abierto) o a nombre de otro no entra al corte.
 */
export function checkNodeRows(
  rows: readonly PdnStatisticsRow[],
  node: Pick<DirectoryNode, 'id'>,
  directory: AuthorityDirectory,
  closedBefore: string,
): StatisticsRejection | null {
  const own = new Set(
    directory.authorities.filter((item) => item.nodeId === node.id).map((item) => item.id),
  );
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.mes >= closedBefore) return 'open-month';
    if (!own.has(row.autoridad.clave)) return 'foreign-authority';
    // El `id` debe ser el de su mes, autoridad, entidad y conducta: así no se repite la misma celda
    // con dos identificadores ni un identificador apunta a otra celda.
    const key = pdnStatisticsRowId(
      row.mes,
      row.autoridad.clave,
      row.entidad.clave,
      row.conducta.clave,
    );
    if (row.id !== key) return 'invalid';
    if (seen.has(key)) return 'duplicate';
    seen.add(key);
  }
  return null;
}

async function queryNode(
  deps: NodeStatisticsDeps,
  node: DirectoryNode,
  directory: AuthorityDirectory,
  closedBefore: string,
): Promise<NodeResult> {
  if (!deps.tokens.hasCredentials(node)) return { status: 'no-credentials' };
  const token = await deps.tokens.token(node, PDN_SCOPES.statistics);
  if (token === null) return { status: 'rejected', rejection: 'unauthorized' };
  const rows: PdnStatisticsRow[] = [];
  for (let page = 1; ; page += 1) {
    if (page > MAX_STATISTICS_PAGES) return { status: 'rejected', rejection: 'too-large' };
    let response: Response;
    try {
      response = await deps.fetch(`${deps.nodeUrl(node)}${PDN_ROUTES.statistics}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          page,
          pageSize: PDN_MAX_PAGE_SIZE,
          query: { mesHasta: previousMonth(closedBefore) },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
      });
    } catch {
      return { status: 'unreachable' };
    }
    if (response.status === 401 || response.status === 403) {
      deps.tokens.invalidate(node, PDN_SCOPES.statistics);
      return { status: 'rejected', rejection: 'unauthorized' };
    }
    if (response.status !== 200) return { status: 'unreachable' };
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      return { status: 'rejected', rejection: 'invalid' };
    }
    const parsed = PdnStatisticsResponseSchema.safeParse(raw);
    if (!parsed.success || parsed.data.pagination.page !== page) {
      return { status: 'rejected', rejection: 'invalid' };
    }
    rows.push(...parsed.data.results);
    if (!parsed.data.pagination.hasNextPage) break;
  }
  const rejection = checkNodeRows(rows, node, directory, closedBefore);
  return rejection === null ? { status: 'included', rows } : { status: 'rejected', rejection };
}

/**
 * Crea el agregador. Un nodo caído o que rechaza el token no detiene el corte.
 * Seguridad: las filas se copian tal como las publicó cada nodo, sin volver a sumar entre
 * autoridades ni nodos: el corte no revela nada que no esté ya en las respuestas de los nodos.
 */
export function createNodeStatisticsAggregator(deps: NodeStatisticsDeps): NodeStatisticsAggregator {
  let latest: NationalStatistics | null = null;
  return {
    async run() {
      const directory = deps.directory();
      const cutAt = deps.now();
      const closedBefore = monthOf(cutAt);
      const nodes: NationalStatistics['nodes'] = [];
      const rows: NationalStatistics['rows'] = [];
      for (const node of directory.nodes) {
        const result = await queryNode(deps, node, directory, closedBefore);
        const included = result.status === 'included' ? result.rows : [];
        nodes.push({
          nodeId: node.id,
          name: node.name,
          status: result.status,
          rejection: result.status === 'rejected' ? result.rejection : null,
          rows: included.length,
        });
        rows.push(...included.map((row) => ({ ...row, nodeId: node.id })));
      }
      latest = {
        v: 1,
        cutAt: toHourDate(cutAt),
        closedBefore,
        directorySerial: directory.serial,
        nodes,
        rows,
      };
      return latest;
    },
    latest: () => latest,
  };
}
