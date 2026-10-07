// Limitadores en memoria con ventanas fijas por llave: uno que rechaza al agotarse y un freno que
// solo retrasa las respuestas cuando hay abuso global.

/** Regla: como máximo `limit` intentos por ventana de `windowMs` milisegundos. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/** Limitador por llave. */
export interface RateLimiter {
  /** Registra un intento y responde si sigue dentro del límite. */
  consume(key: string): boolean;
  /** Indica si la llave ya agotó su límite en la ventana vigente, sin registrar nada. */
  isLimited(key: string): boolean;
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

const SWEEP_THRESHOLD = 10_000;
const THROTTLE_KEY = 'global';

function createWindows(rule: RateLimitRule, now: () => Date) {
  const windows = new Map<string, Window>();

  function sweep(current: number): void {
    for (const [key, window] of windows) {
      if (current - window.startedAt >= rule.windowMs) windows.delete(key);
    }
  }

  function current(key: string): Window | undefined {
    const window = windows.get(key);
    if (window === undefined || now().getTime() - window.startedAt >= rule.windowMs) {
      return undefined;
    }
    return window;
  }

  function add(key: string): number {
    const time = now().getTime();
    if (windows.size >= SWEEP_THRESHOLD) sweep(time);
    const window = current(key);
    if (window === undefined) {
      windows.set(key, { startedAt: time, count: 1 });
      return 1;
    }
    window.count += 1;
    return window.count;
  }

  return { current, add };
}

/**
 * Crea un limitador con la regla dada y el reloj inyectado.
 * Seguridad: solo vive en memoria y las ventanas vencidas se descartan, así que no queda
 * un historial persistente de intentos.
 */
export function createRateLimiter(rule: RateLimitRule, now: () => Date): RateLimiter {
  const windows = createWindows(rule, now);
  return {
    consume: (key) => windows.add(key) <= rule.limit,
    isLimited: (key) => (windows.current(key)?.count ?? 0) >= rule.limit,
  };
}

/**
 * Crea un freno global. Nunca rechaza: cuando los eventos de la ventana superan `limit`, cada
 * evento de exceso agrega `stepMs` de espera, hasta `maxDelayMs`.
 * Seguridad: así el abuso de una sola fuente no deja fuera a todas las personas denunciantes; a
 * cambio, durante un ataque todas esperan hasta `maxDelayMs` (ver docs/interfaces.md).
 */
export function createThrottle(rule: ThrottleRule, now: () => Date): Throttle {
  const windows = createWindows(rule, now);
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
