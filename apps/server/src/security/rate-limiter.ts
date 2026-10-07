// Limitadores en memoria con ventanas fijas por llave: uno que rechaza al agotarse y un freno que
// solo retrasa las respuestas cuando hay abuso global. El mapa de ventanas está acotado.

/** Regla: como máximo `limit` intentos por ventana de `windowMs` milisegundos. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/** Límites de memoria del limitador. */
export interface LimiterCapacity {
  /** Máximo de llaves vivas; al excederse se descartan las usadas hace más tiempo (LRU). */
  maxKeys: number;
  /** Intervalo mínimo entre dos barridos de ventanas vencidas (por omisión, `windowMs`). */
  sweepIntervalMs?: number;
}

/** Limitador por llave. */
export interface RateLimiter {
  /** Registra un intento y responde si sigue dentro del límite. */
  consume(key: string): boolean;
  /** Indica si la llave ya agotó su límite en la ventana vigente, sin registrar nada. */
  isLimited(key: string): boolean;
  /** Llaves que conserva en memoria (para pruebas y métricas). */
  size(): number;
}

/** Regla del freno: a partir de `limit` eventos por ventana, cada uno suma `stepMs` de espera. */
export interface ThrottleRule extends RateLimitRule {
  stepMs: number;
  maxDelayMs: number;
}

/** Freno global: registra eventos y calcula cuánto retrasar la siguiente respuesta. */
export interface Throttle {
  record(): void;
  /** Milisegundos de espera según el exceso sobre el límite; 0 si no hay exceso. */
  delayMs(): number;
}

interface Window {
  startedAt: number;
  count: number;
}

/** Tope de llaves por omisión: unas decenas de MB en el peor caso. */
export const DEFAULT_MAX_KEYS = 100_000;
const THROTTLE_KEY = 'global';

function createWindows(rule: RateLimitRule, now: () => Date, capacity: LimiterCapacity) {
  const windows = new Map<string, Window>();
  const sweepIntervalMs = capacity.sweepIntervalMs ?? rule.windowMs;
  let lastSweepAt = Number.NEGATIVE_INFINITY;

  function isExpired(window: Window, time: number): boolean {
    return time - window.startedAt >= rule.windowMs;
  }

  // Seguridad: el barrido recorre todo el mapa, así que se amortiza a lo más una vez por
  // intervalo; si no, un ataque con muchas llaves haría cuadrático el costo de cada intento.
  function maybeSweep(time: number): void {
    if (time - lastSweepAt < sweepIntervalMs) return;
    lastSweepAt = time;
    for (const [key, window] of windows) {
      if (isExpired(window, time)) windows.delete(key);
    }
  }

  // Se descarta de una vez el 10 % más antiguo: borrar una llave por intento desde el inicio del
  // mapa obliga a recorrer los huecos que deja cada borrado y vuelve cuadrático el costo.
  function evictOldest(): void {
    const target = Math.floor(capacity.maxKeys * 0.9);
    for (const key of windows.keys()) {
      if (windows.size <= target) break;
      windows.delete(key);
    }
  }

  function current(key: string): Window | undefined {
    const window = windows.get(key);
    if (window === undefined || isExpired(window, now().getTime())) return undefined;
    return window;
  }

  function add(key: string): number {
    const time = now().getTime();
    maybeSweep(time);
    const existing = windows.get(key);
    if (existing !== undefined) windows.delete(key);
    const window =
      existing === undefined || isExpired(existing, time)
        ? { startedAt: time, count: 0 }
        : existing;
    window.count += 1;
    // Reinsertar mueve la llave al final: el mapa queda ordenado de menos a más reciente.
    windows.set(key, window);
    if (windows.size > capacity.maxKeys) evictOldest();
    return window.count;
  }

  return { current, add, size: () => windows.size };
}

/**
 * Crea un limitador con la regla dada y el reloj inyectado.
 * Seguridad: solo vive en memoria y las ventanas vencidas se descartan, así que no queda un
 * historial persistente de intentos. Con el mapa lleno se olvida la llave usada hace más tiempo:
 * un atacante que inunde de llaves puede reiniciar contadores ajenos, pero no agotar la memoria;
 * los frenos globales siguen activos.
 */
export function createRateLimiter(
  rule: RateLimitRule,
  now: () => Date,
  capacity: LimiterCapacity = { maxKeys: DEFAULT_MAX_KEYS },
): RateLimiter {
  const windows = createWindows(rule, now, capacity);
  return {
    consume: (key) => windows.add(key) <= rule.limit,
    isLimited: (key) => (windows.current(key)?.count ?? 0) >= rule.limit,
    size: windows.size,
  };
}

/**
 * Crea un freno global. Nunca rechaza: cuando los eventos de la ventana superan `limit`, cada
 * evento de exceso agrega `stepMs` de espera, hasta `maxDelayMs`.
 * Seguridad: así el abuso de una sola fuente no deja fuera a todas las personas denunciantes; a
 * cambio, durante un ataque todas esperan hasta `maxDelayMs` (ver docs/interfaces.md).
 */
export function createThrottle(rule: ThrottleRule, now: () => Date): Throttle {
  const windows = createWindows(rule, now, { maxKeys: 1 });
  return {
    record: () => {
      windows.add(THROTTLE_KEY);
    },
    delayMs: () => {
      const excess = (windows.current(THROTTLE_KEY)?.count ?? 0) - rule.limit;
      return excess <= 0 ? 0 : Math.min(rule.maxDelayMs, excess * rule.stepMs);
    },
  };
}
