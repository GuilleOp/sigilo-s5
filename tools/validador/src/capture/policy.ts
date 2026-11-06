// Política ética de peticiones: solo GET en modo pasivo, sin rutas de autenticación ni APIs
// privadas, sin terceros, sin saltos a IP privadas y con un solo tope de peticiones por corrida
// que comparten el navegador, los `fetch` de cabeceras y el cliente de la API.
import type { Party } from '../types.ts';
import { isLocalHost } from './party.ts';

/** Decisión sobre una petición. */
export type RequestDecision = { isAllowed: true } | { isAllowed: false; reason: string };

/** Petición a decidir. */
export interface RequestCandidate {
  method: string;
  url: string;
  resourceType: string;
  party: Party;
  /** Navegación de documento o marco (no un recurso de la página). */
  isNavigation?: boolean;
}

/** Contador único de peticiones de una corrida. */
export interface RequestBudget {
  /** Cuenta una petición; `false` si ya se alcanzó el tope (y no la cuenta). */
  take(): boolean;
  count(): number;
  isLimitReached(): boolean;
  max(): number;
}

/** Crea el contador de una corrida. */
export function createRequestBudget(maxRequests: number): RequestBudget {
  let used = 0;
  let isLimitReached = false;
  return {
    take: () => {
      if (used >= maxRequests) {
        isLimitReached = true;
        return false;
      }
      used += 1;
      return true;
    },
    count: () => used,
    isLimitReached: () => isLimitReached,
    max: () => maxRequests,
  };
}

/** Opciones de la política. */
export interface RequestPolicyOptions {
  budget: RequestBudget;
  /** Sitio validado: decide si las IP privadas o locales son legítimas. */
  target: URL;
  /** URL que el validador pidió visitar: se permiten aunque su ruta parezca privada. */
  targetPages?: readonly string[];
  /** En modo conformidad se permiten métodos distintos de GET hacia el propio origen. */
  allowNonGet: boolean;
  /** Si se dejan salir las peticiones a terceros (por omisión se bloquean y se registran). */
  allowThirdParty: boolean;
}

/**
 * Rutas que el validador nunca toca en modo pasivo aunque la página las pida o redirija a ellas:
 * autenticación, sesiones, paneles internos y APIs privadas.
 */
const PRIVATE_PATH_PATTERN =
  /\/(?:auth|login|logout|signin|signup|session|sessions|oauth|token|admin|autoridad|authority|private|privada)(?:\/|$|\?|\.)/i;

/** Tipos de recurso que corresponden a llamadas de datos (no a archivos estáticos). */
const DATA_REQUEST_TYPES: ReadonlySet<string> = new Set([
  'fetch',
  'xhr',
  'eventsource',
  'websocket',
]);

/** Indica si la ruta de la URL parece de autenticación o privada. */
export function isPrivatePath(url: string): boolean {
  try {
    return PRIVATE_PATH_PATTERN.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/** Indica si el host es una IP privada, local o de enlace local (IPv4 o IPv6). */
export function isPrivateAddress(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (isLocalHost(host) || host === '0.0.0.0' || host === '::') return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(host);
  if (ipv4 !== null) {
    const first = Number(ipv4[1]);
    const second = Number(ipv4[2]);
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254) ||
      (first === 100 && second >= 64 && second <= 127)
    );
  }
  return /^(?:fc|fd|fe80)/.test(host) || host.endsWith('.local');
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function normalize(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

/** Crea la política sobre el contador compartido. */
export function createRequestPolicy(options: RequestPolicyOptions): {
  decide(candidate: RequestCandidate): RequestDecision;
  budget: RequestBudget;
} {
  const targetPages = new Set((options.targetPages ?? []).map(normalize));
  const isTargetLocal = isPrivateAddress(options.target.hostname);
  return {
    budget: options.budget,
    decide: (candidate) => {
      if (candidate.party === 'incrustado') return { isAllowed: true };
      if (candidate.party === 'tercero' && !options.allowThirdParty) {
        return { isAllowed: false, reason: 'petición a un tercero: se registra y no se envía' };
      }
      const host = hostnameOf(candidate.url);
      if (host === null) return { isAllowed: false, reason: 'URL no interpretable' };
      // Seguridad: un sitio público no puede usar al validador para alcanzar la red interna.
      if (!isTargetLocal && isPrivateAddress(host)) {
        return { isAllowed: false, reason: 'IP privada, local o de enlace local' };
      }
      if (!options.allowNonGet && candidate.method !== 'GET') {
        return {
          isAllowed: false,
          reason: `método ${candidate.method}: el modo pasivo solo usa GET`,
        };
      }
      const isData = DATA_REQUEST_TYPES.has(candidate.resourceType);
      const isOtherNavigation =
        candidate.isNavigation === true && !targetPages.has(normalize(candidate.url));
      if (!options.allowNonGet && (isData || isOtherNavigation) && isPrivatePath(candidate.url)) {
        return { isAllowed: false, reason: 'ruta de autenticación o privada' };
      }
      if (!options.budget.take()) {
        return { isAllowed: false, reason: 'se alcanzó el tope de peticiones' };
      }
      return { isAllowed: true };
    },
  };
}
