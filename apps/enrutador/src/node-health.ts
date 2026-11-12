// Salud de los nodos: el enrutador consulta periódicamente `GET /api/v1/red/health` de cada nodo
// del directorio y guarda en memoria si respondió, sus versiones y el último contacto. Con una
// versión mínima configurada, no entrega sobres a un nodo con versión menor o desconocida.
// Seguridad: solo nodos, versiones y (para la operación) conteos de la cola; ninguna denuncia,
// autoridad ni contenido.
import { NETWORK_ROUTES, NodeHealthReportSchema } from '@sigilo/contracts';
import type {
  AuthorityDirectory,
  DirectoryNode,
  NetworkHealth,
  NetworkHealthNode,
} from '@sigilo/contracts';
import type { FetchLike } from '@sigilo/red';

const DEFAULT_TIMEOUT_MS = 5_000;
const VERSION_PATTERN = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/u;

/**
 * Compara dos versiones `mayor.menor.parche`: negativo si `a < b`, 0 si son iguales, positivo si
 * `a > b`. Lanza error si alguna no tiene esa forma.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] => {
    const match = VERSION_PATTERN.exec(value);
    if (match === null) throw new Error(`Versión inválida: ${value}`);
    return match.slice(1).map(Number);
  };
  const [left, right] = [parse(a), parse(b)];
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function toMinuteDate(date: Date): string {
  return `${date.toISOString().slice(0, 16)}Z`;
}

/** Lo que se sabe de un nodo entre consultas. */
interface NodeState {
  status: 'up' | 'down';
  softwareVersion: string | null;
  standardVersion: string | null;
  lastCheckAt: string;
  lastContactAt: string | null;
}

/** Monitor de salud. */
export interface NodeHealthMonitor {
  /** Consulta a todos los nodos del directorio a la vez y devuelve la salud. */
  check(): Promise<NetworkHealth>;
  /**
   * Salud con lo último que se sabe (sin consultar). Sin `includeQueue`, los conteos de la cola van
   * como `null` (la vista pública, H08).
   */
  snapshot(options?: { includeQueue?: boolean }): NetworkHealth;
  /**
   * Si la versión del nodo permite entregarle sobres: sin mínima, siempre; con mínima, solo si su
   * versión conocida no es menor.
   */
  meetsMinimumVersion(node: Pick<DirectoryNode, 'id'>): boolean;
}

/** Dependencias del monitor. */
export interface NodeHealthDeps {
  directory: () => AuthorityDirectory;
  nodeUrl: (node: DirectoryNode) => string;
  fetch: FetchLike;
  now: () => Date;
  /** Versión mínima del software de los nodos, o `null`. */
  minimumVersion: string | null;
  /** Si el nodo se registró ante el enrutador y acepta sobres. */
  isRegistered: (nodeId: string) => boolean;
  /** Sobres que esperan en la cola para el nodo. */
  queued: (nodeId: string) => number;
  timeoutMs?: number;
  /** Aviso cuando un nodo queda por debajo de la versión mínima (por omisión, `console.error`). */
  warn?: (message: string) => void;
}

/** Crea el monitor. Lanza error si la versión mínima no tiene la forma `mayor.menor.parche`. */
export function createNodeHealthMonitor(deps: NodeHealthDeps): NodeHealthMonitor {
  if (deps.minimumVersion !== null) compareVersions(deps.minimumVersion, deps.minimumVersion);
  const states = new Map<string, NodeState>();
  const warned = new Set<string>();
  const warn = deps.warn ?? ((message: string) => console.error(message));
  let checkedAt: string | null = null;

  const meetsMinimumVersion = (node: Pick<DirectoryNode, 'id'>): boolean => {
    if (deps.minimumVersion === null) return true;
    const version = states.get(node.id)?.softwareVersion ?? null;
    return version !== null && compareVersions(version, deps.minimumVersion) >= 0;
  };

  const probe = async (node: DirectoryNode): Promise<NodeState> => {
    const previous = states.get(node.id);
    const now = deps.now();
    const down: NodeState = {
      status: 'down',
      softwareVersion: previous?.softwareVersion ?? null,
      standardVersion: previous?.standardVersion ?? null,
      lastCheckAt: toMinuteDate(now),
      lastContactAt: previous?.lastContactAt ?? null,
    };
    try {
      const response = await deps.fetch(`${deps.nodeUrl(node)}${NETWORK_ROUTES.nodeHealth}`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(deps.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (response.status !== 200) return down;
      const parsed = NodeHealthReportSchema.safeParse(await response.json());
      // Un nodo que dice ser otro no cuenta como arriba.
      if (!parsed.success || parsed.data.nodeId !== node.id) return down;
      return {
        status: 'up',
        softwareVersion: parsed.data.softwareVersion,
        standardVersion: parsed.data.standardVersion,
        lastCheckAt: toMinuteDate(now),
        lastContactAt: toMinuteDate(now),
      };
    } catch {
      return down;
    }
  };

  const nodeHealth = (node: DirectoryNode, includeQueue: boolean): NetworkHealthNode => {
    const state = states.get(node.id);
    const registered = deps.isRegistered(node.id);
    const meets = meetsMinimumVersion(node);
    const version = state?.softwareVersion ?? null;
    let warning: NetworkHealthNode['warning'] = null;
    if (deps.minimumVersion !== null && version !== null && !meets) {
      warning = 'below-minimum-version';
    } else if (state?.status === 'down') warning = 'unreachable';
    else if (!registered) warning = 'not-registered';
    else if (!meets) warning = 'unknown-version';
    return {
      nodeId: node.id,
      name: node.name,
      status: state?.status ?? 'unknown',
      softwareVersion: version,
      standardVersion: state?.standardVersion ?? null,
      lastCheckAt: state?.lastCheckAt ?? null,
      lastContactAt: state?.lastContactAt ?? null,
      registered,
      deliverable: registered && meets,
      warning,
      queued: includeQueue ? deps.queued(node.id) : null,
    };
  };

  const snapshot = (options: { includeQueue?: boolean } = {}): NetworkHealth => ({
    v: 1,
    checkedAt,
    minimumSoftwareVersion: deps.minimumVersion,
    nodes: deps.directory().nodes.map((node) => nodeHealth(node, options.includeQueue === true)),
  });

  return {
    meetsMinimumVersion,
    snapshot,
    async check() {
      const nodes = deps.directory().nodes;
      const results = await Promise.all(nodes.map(probe));
      nodes.forEach((node, index) => {
        const state = results[index];
        if (state !== undefined) states.set(node.id, state);
      });
      checkedAt = toMinuteDate(deps.now());
      // Aviso claro, una vez por nodo mientras siga por debajo: el enrutador no le entrega.
      for (const node of nodes) {
        const version = states.get(node.id)?.softwareVersion ?? null;
        const isBelow =
          deps.minimumVersion !== null &&
          version !== null &&
          compareVersions(version, deps.minimumVersion) < 0;
        if (isBelow && !warned.has(node.id)) {
          warned.add(node.id);
          warn(
            `Aviso: el nodo ${node.id} tiene la versión ${version}, menor que la mínima ${deps.minimumVersion ?? ''}. El enrutador no le entrega sobres hasta que se actualice; las denuncias con cola esperan.`,
          );
        } else if (!isBelow) warned.delete(node.id);
      }
      return snapshot({ includeQueue: true });
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const STATUS_LABELS: Record<NetworkHealthNode['status'], string> = {
  up: 'Arriba',
  down: 'Abajo',
  unknown: 'Sin consultar',
};

const WARNING_LABELS: Record<NonNullable<NetworkHealthNode['warning']>, string> = {
  unreachable: 'No responde',
  'not-registered': 'No se ha registrado',
  'below-minimum-version': 'Versión menor a la mínima: no se le entregan sobres',
  'unknown-version': 'Versión desconocida: no se le entregan sobres',
};

/**
 * Página HTML sencilla con la salud de la red, sin estilos ni scripts (la política de contenido
 * del enrutador no los permite). Todo texto se escapa.
 */
export function networkHealthHtml(health: NetworkHealth): string {
  const rows = health.nodes
    .map((node) => {
      const cells = [
        node.name,
        node.nodeId,
        STATUS_LABELS[node.status],
        node.softwareVersion ?? '—',
        node.standardVersion ?? '—',
        node.lastContactAt ?? 'Nunca',
        node.queued === null ? '—' : String(node.queued),
        node.deliverable ? 'Sí' : 'No',
        node.warning === null ? '—' : WARNING_LABELS[node.warning],
      ];
      return `<tr>${cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`;
    })
    .join('\n');
  const minimum = health.minimumSoftwareVersion ?? 'sin mínima';
  return `<!doctype html>
<html lang="es-MX">
<head><meta charset="utf-8"><title>Salud de los nodos de la red SIGILO</title></head>
<body>
<h1>Salud de los nodos de la red</h1>
<p>Última consulta: ${escapeHtml(health.checkedAt ?? 'todavía no')} (UTC). Versión mínima del software: ${escapeHtml(minimum)}.</p>
<p>Solo nodos, versiones y sobres cerrados en la cola de entrega: ninguna denuncia, autoridad ni contenido.</p>
<table>
<thead><tr><th scope="col">Nodo</th><th scope="col">Identificador</th><th scope="col">Estado</th><th scope="col">Software</th><th scope="col">Estándar</th><th scope="col">Último contacto (UTC)</th><th scope="col">En cola</th><th scope="col">Se le entrega</th><th scope="col">Aviso</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`;
}
