// Cliente HTTP del modo conformidad: registra cada intercambio (para API-01 y API-02), presenta el
// User-Agent del validador y respeta el tope de peticiones de la corrida.
import { readLimitedText } from '../capture/limited-body.ts';
import type { RequestBudget } from '../capture/policy.ts';
import type { HttpExchange } from '../types.ts';
import { USER_AGENT } from '../version.ts';

/** Cuerpo de respuesta máximo que se conserva como texto por intercambio. */
const MAX_BODY_CHARS = 64 * 1024;
/** Cuerpo máximo que se lee de la red (el JSON se interpreta completo hasta este tope). */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Opciones de una petición. */
export interface ApiRequest {
  purpose: string;
  method: 'GET' | 'POST';
  /** Ruta con consulta, relativa al origen del nodo. */
  path: string;
  /** Objeto que se envía como JSON. */
  json?: unknown;
  /** Cuerpo literal (para probar JSON mal formado o tipos de contenido inválidos). */
  rawBody?: string;
  contentType?: string;
  headers?: Record<string, string>;
}

/** Cliente con registro de intercambios. */
export interface ApiClient {
  send(request: ApiRequest): Promise<HttpExchange>;
  exchanges(): readonly HttpExchange[];
  count(): number;
}

/**
 * Crea el cliente para el origen `baseUrl` sobre el contador único de la corrida. Lanza error al
 * agotarlo para que la verificación en curso se reporte como no evaluada en lugar de seguir.
 */
export function createApiClient(
  baseUrl: string,
  budget: RequestBudget,
  timeoutMs: number,
): ApiClient {
  const recorded: HttpExchange[] = [];
  return {
    send: async (request) => {
      if (!budget.take()) {
        throw new Error('Se alcanzó el tope de peticiones del modo conformidad.');
      }
      const url = new URL(request.path, baseUrl);
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT, ...request.headers };
      let body: string | undefined;
      if (request.json !== undefined) {
        body = JSON.stringify(request.json);
        headers['Content-Type'] = request.contentType ?? 'application/json';
      } else if (request.rawBody !== undefined) {
        body = request.rawBody;
        headers['Content-Type'] = request.contentType ?? 'application/json';
      }
      const started = performance.now();
      const response = await fetch(url, {
        method: request.method,
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        ...(body === undefined ? {} : { body }),
      });
      const { text } = await readLimitedText(response, MAX_BODY_BYTES);
      let bodyJson: unknown;
      try {
        bodyJson = JSON.parse(text) as unknown;
      } catch {
        bodyJson = undefined;
      }
      const durationMs = Math.round(performance.now() - started);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        responseHeaders[name.toLowerCase()] = value;
      });
      const exchange: HttpExchange = {
        purpose: request.purpose,
        method: request.method,
        url: url.href,
        path: url.pathname,
        ...(headers['Content-Type'] === undefined
          ? {}
          : { requestContentType: headers['Content-Type'] }),
        status: response.status,
        headers: responseHeaders,
        contentType: responseHeaders['content-type'] ?? '',
        bodyText: text.slice(0, MAX_BODY_CHARS),
        ...(bodyJson === undefined ? {} : { bodyJson }),
        durationMs,
      };
      recorded.push(exchange);
      return exchange;
    },
    exchanges: () => recorded,
    count: () => recorded.length,
  };
}

/** Interpreta el cuerpo como JSON; `undefined` si no lo es. */
export function jsonBodyOf(exchange: HttpExchange): unknown {
  if (exchange.bodyJson !== undefined) return exchange.bodyJson;
  try {
    return JSON.parse(exchange.bodyText) as unknown;
  } catch {
    return undefined;
  }
}
