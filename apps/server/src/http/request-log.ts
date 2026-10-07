// Registro de peticiones: contadores agregados por hora (producción) o una línea por petición
// (solo desarrollo). Nunca IP, agente de usuario, cabeceras, cuerpos ni identificadores.
import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import { ROUTES } from '@sigilo/contracts';
import { toHourDate } from '@sigilo/core';

/**
 * `aggregate`: contadores por hora, sin las rutas de la persona denunciante; `requests`: una
 * línea por petición (solo desarrollo); `off`: nada.
 */
export type RequestLogMode = 'off' | 'aggregate' | 'requests';

/** Modos válidos de `SIGILO_REQUEST_LOG`. */
export const REQUEST_LOG_MODES: readonly RequestLogMode[] = ['off', 'aggregate', 'requests'];

/** Entrada de una petición (modo `requests`): sin IP, agente, cuerpo ni folio. */
export interface RequestLogEntry {
  method: string;
  route: string;
  status: number;
  durationMs: number;
}

/** Contador de una combinación de método, ruta normalizada y estatus en una hora. */
export interface RequestCount {
  method: string;
  route: string;
  status: number;
  count: number;
}

/** Resumen de una hora (modo `aggregate`). */
export interface HourlyRequestCounts {
  hour: string;
  counts: RequestCount[];
}

/** Línea que se escribe en el registro. */
export type RequestLogLine = RequestLogEntry | HourlyRequestCounts;

/** Registro de peticiones de la aplicación. */
export interface RequestLog {
  middleware: MiddlewareHandler;
  /** Escribe y vacía los contadores acumulados (modo `aggregate`); en otros modos no hace nada. */
  flush(): void;
}

/** Opciones del registro. */
export interface RequestLogOptions {
  mode: RequestLogMode;
  now: () => Date;
  write: (line: RequestLogLine) => void;
}

/**
 * Rutas que en modo `aggregate` no se registran ni se cuentan: las de la persona denunciante (y el
 * reto que las precede) y las públicas que ella consulta para verificar (llaves y bitácora).
 */
export const UNCOUNTED_ROUTES: ReadonlySet<string> = new Set([
  ROUTES.complaints,
  ROUTES.evidenceUpload,
  ROUTES.tracking,
  ROUTES.trackingMessages,
  ROUTES.powChallenge,
  ROUTES.keys,
  ROUTES.ledgerHead,
  ROUTES.ledgerEvents,
]);

/**
 * Crea el registro de peticiones.
 * Seguridad: aun sin datos, una línea por petición con su orden y duración permite correlacionar
 * la hora de un envío con otras fuentes (proxy, red). Por eso en producción solo hay contadores
 * por hora, ordenados por ruta y no por llegada, y las rutas de la persona denunciante no se
 * cuentan: su volumen por hora también acotaría cuándo llegó una denuncia. Tampoco se cuentan
 * `GET keys` ni la bitácora, que la web consulta justo antes y después de enviar y al seguir.
 */
export function createRequestLog(options: RequestLogOptions): RequestLog {
  const { mode, now, write } = options;
  let hour: string | null = null;
  const counts = new Map<string, RequestCount>();

  function flush(): void {
    if (hour === null || counts.size === 0) return;
    const sorted = [...counts.values()].sort(
      (left, right) =>
        left.route.localeCompare(right.route) ||
        left.method.localeCompare(right.method) ||
        left.status - right.status,
    );
    write({ hour, counts: sorted });
    counts.clear();
  }

  function count(method: string, route: string, status: number): void {
    const current = toHourDate(now());
    if (hour !== current) {
      flush();
      hour = current;
    }
    const key = `${method} ${route} ${status}`;
    const existing = counts.get(key);
    if (existing === undefined) counts.set(key, { method, route, status, count: 1 });
    else existing.count += 1;
  }

  const middleware: MiddlewareHandler = async (c, next) => {
    if (mode === 'off') return next();
    const startedAt = performance.now();
    await next();
    const route = routePath(c);
    if (mode === 'requests') {
      write({
        method: c.req.method,
        route,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return;
    }
    if (UNCOUNTED_ROUTES.has(route)) return;
    count(c.req.method, route, c.res.status);
  };

  return { middleware, flush: mode === 'aggregate' ? flush : () => undefined };
}
