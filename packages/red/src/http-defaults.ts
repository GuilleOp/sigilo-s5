// Tiempos límite comunes de los servicios de la red (H12): las peticiones salientes no esperan para
// siempre ni siguen redirecciones, y los servidores HTTP no aceptan cabeceras o cuerpos lentos.
import type { FetchLike } from './node-client.ts';

/** Tiempo máximo por omisión de una petición saliente, en milisegundos. */
export const OUTBOUND_TIMEOUT_MS = 30_000;

/**
 * Envuelve `fetch` para que toda petición sin `signal` propia venza a los `timeoutMs` y ninguna siga
 * redirecciones (`redirect: 'error'`), salvo que la llamada pida otra cosa.
 * Seguridad: un nodo o servicio lento ya no deja colgadas las conexiones del enrutador o del nodo,
 * y una redirección no puede mandar el token o el sobre a otro destino.
 */
export function withOutboundDefaults(
  fetchImpl: FetchLike,
  timeoutMs: number = OUTBOUND_TIMEOUT_MS,
): FetchLike {
  return (input, init) =>
    fetchImpl(input, {
      redirect: 'error',
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
}

/**
 * Opciones de `http.createServer` para los servicios de la red: 60 s por petición completa (el
 * sobre mayor, de unos 22 MB, cabe con holgura en un enlace lento), 15 s para las cabeceras y 16 KiB
 * de cabeceras. Las de Node permiten 300 s por petición.
 */
export const HTTP_SERVER_OPTIONS = {
  requestTimeout: 60_000,
  headersTimeout: 15_000,
  keepAliveTimeout: 5_000,
  maxHeaderSize: 16 * 1024,
} as const;
