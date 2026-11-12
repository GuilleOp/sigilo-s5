// Frentes del nodo (H03): qué rutas publica cada escucha según el perfil. En producción el nodo
// estatal NO recibe denuncias directas: la persona denuncia en la ventanilla única de la SESNA y el
// sobre llega cerrado por el buzón de red. Así el operador del nodo nunca ve la IP de quien denuncia.
//
//   red        lo que pide la SESNA: buzón, /oauth/token, estadística PDN (/v1/*) y salud.
//   publico    lecturas públicas que usan el enrutador, los testigos y la ventanilla: llaves,
//              bitácora, datos abiertos, directorio, calendario de días inhábiles
//              (`/datos/dias-inhabiles.json`) y la solicitud de alta de una institución.
//   panel      el panel de la autoridad: /autoridad (la web), /api/v1/{auth,authority,operation} y
//              el paso del relevo, que el turnado a otro nodo usa desde el navegador (el sobre va
//              cifrado hacia el nodo destino). Por eso el panel va detrás de VPN o lista de IP.
//   ventanilla la recepción directa: denuncias, pruebas, seguimiento, retos de denuncia y mensaje,
//              paso de la cola y pasos del evaluador y del corte nacional.
//
// Las peticiones que el propio buzón de red despacha por dentro (`app.request`) siempre pasan: así
// una denuncia que llegó cerrada por la red se atiende aunque la ventanilla esté apagada.
import type { MiddlewareHandler } from 'hono';
import {
  API_PREFIX,
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  PDN_ROUTES,
  REST_DAYS_PATH,
  ROUTES,
} from '@sigilo/contracts';
import { errorResponse } from './errors.ts';

/** Frentes del nodo. */
export const NODE_FRONTS = ['red', 'publico', 'panel', 'ventanilla'] as const;
export type NodeFront = (typeof NODE_FRONTS)[number];

/** Perfiles del nodo (`SIGILO_NODE_PROFILE`). */
export const NODE_PROFILES = ['completo', 'nodo'] as const;
export type NodeProfile = (typeof NODE_PROFILES)[number];

/** Todos los frentes: el perfil `completo` (desarrollo, pruebas E2E, nodo único). */
export const ALL_FRONTS: ReadonlySet<NodeFront> = new Set(NODE_FRONTS);

/** Perfil `nodo`: red, lecturas públicas y panel; sin recepción directa. */
export const NODE_PROFILE_FRONTS: ReadonlySet<NodeFront> = new Set(['red', 'publico', 'panel']);

const PANEL_PREFIXES = [
  `${API_PREFIX}/auth/`,
  `${API_PREFIX}/authority/`,
  `${API_PREFIX}/operation/`,
];

const PUBLIC_READS = new Set<string>([
  ROUTES.keys,
  ROUTES.ledgerHead,
  ROUTES.ledgerEvents,
  ROUTES.openDataCsv,
  NETWORK_ROUTES.directory,
]);

const RED_READS = new Set<string>([NETWORK_ROUTES.nodeHealth]);

const VENTANILLA_PATHS = new Set<string>([
  ROUTES.evidenceUpload,
  ROUTES.complaints,
  ROUTES.tracking,
  ROUTES.trackingMessages,
  ROUTES.trackingAppeal,
  NETWORK_ROUTES.queueChallenge,
  NETWORK_ROUTES.nationalOpenData,
  CORROBORATION_ROUTES.evaluatorChallenge,
  CORROBORATION_ROUTES.evaluations,
]);

function isApi(path: string): boolean {
  return (
    path === API_PREFIX ||
    path.startsWith(`${API_PREFIX}/`) ||
    path === PDN_ROUTES.token ||
    path.startsWith('/v1/')
  );
}

/**
 * Frente al que pertenece una petición, o `null` si la ruta no es de ninguno. Seguridad: una ruta
 * de la API que no está en la lista no pertenece a ningún frente y se responde como inexistente en
 * los perfiles restringidos (lista positiva: una ruta nueva no queda publicada por accidente).
 */
export function frontOf(
  method: string,
  path: string,
  purpose: string | undefined,
): NodeFront | null {
  const isRead = method === 'GET' || method === 'HEAD';
  // El calendario de días inhábiles es público: con él cualquiera recalcula los plazos del nodo.
  if (isRead && path === REST_DAYS_PATH) return 'publico';
  if (!isApi(path)) return isRead ? 'panel' : null;
  if (method === 'POST' && path === NETWORK_ROUTES.nodeInbox) return 'red';
  if (method === 'POST' && path === PDN_ROUTES.token) return 'red';
  if (path.startsWith('/v1/')) return 'red';
  if (isRead && RED_READS.has(path)) return 'red';
  if (PANEL_PREFIXES.some((prefix) => path.startsWith(prefix))) return 'panel';
  // El turnado a otro nodo sube las pruebas y la denuncia re-cifradas por el relevo del nodo.
  if (method === 'POST' && path === NETWORK_ROUTES.relay) return 'panel';
  if (isRead && PUBLIC_READS.has(path)) return 'publico';
  // La solicitud de alta de una institución llega por el paso de la ventanilla de la SESNA.
  if (method === 'POST' && path === ROUTES.registrationRequests) return 'publico';
  if (isRead && path === ROUTES.powChallenge) {
    return purpose === 'registration' ? 'publico' : 'ventanilla';
  }
  if (VENTANILLA_PATHS.has(path)) return 'ventanilla';
  return null;
}

/**
 * Frentes de la escucha que recibió la petición. Solo `main.ts` lo escribe, sobre las peticiones de
 * cada servidor HTTP, para separar el puerto de la red del puerto del panel.
 */
const LISTENER_FRONTS = new WeakMap<Request, ReadonlySet<NodeFront>>();

/** Envuelve el `fetch` de una escucha para que solo atienda los frentes dados. */
export function restrictToFronts<T extends unknown[]>(
  fetchImpl: (request: Request, ...rest: T) => Response | Promise<Response>,
  fronts: ReadonlySet<NodeFront>,
): (request: Request, ...rest: T) => Response | Promise<Response> {
  return (request, ...rest) => {
    LISTENER_FRONTS.set(request, fronts);
    return fetchImpl(request, ...rest);
  };
}

/**
 * Middleware que responde `not_found` (igual que una ruta inexistente) a las rutas fuera de los
 * frentes vigentes. Los frentes vigentes son los de la escucha (`restrictToFronts`) o, si no hay,
 * `defaults`. Las peticiones que despacha el buzón (`isRouted`) siempre pasan.
 */
export function exposureGuard(
  defaults: ReadonlySet<NodeFront>,
  isRouted: (request: Request) => boolean,
): MiddlewareHandler {
  return async (c, next) => {
    const fronts = LISTENER_FRONTS.get(c.req.raw) ?? defaults;
    if (fronts.size === NODE_FRONTS.length || isRouted(c.req.raw)) return next();
    const front = frontOf(c.req.method, c.req.path, c.req.query('purpose'));
    if (front === null || !fronts.has(front)) return errorResponse(c, 'not_found');
    return next();
  };
}
