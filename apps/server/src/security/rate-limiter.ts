// Limitador de intentos en memoria con ventanas fijas por llave.

/** Regla: como máximo `limit` intentos por ventana de `windowMs` milisegundos. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

/** Limitador que registra un intento y responde si está permitido. */
export interface RateLimiter {
  consume(key: string): boolean;
}

interface Window {
  startedAt: number;
  count: number;
}

const SWEEP_THRESHOLD = 10_000;

/**
 * Crea un limitador con la regla dada y el reloj inyectado.
 * Seguridad: solo vive en memoria y las ventanas vencidas se descartan, así que no queda
 * un historial persistente de intentos.
 */
export function createRateLimiter(rule: RateLimitRule, now: () => Date): RateLimiter {
  const windows = new Map<string, Window>();

  function sweep(current: number): void {
    for (const [key, window] of windows) {
      if (current - window.startedAt >= rule.windowMs) windows.delete(key);
    }
  }

  return {
    consume: (key) => {
      const current = now().getTime();
      if (windows.size >= SWEEP_THRESHOLD) sweep(current);
      const window = windows.get(key);
      if (window === undefined || current - window.startedAt >= rule.windowMs) {
        windows.set(key, { startedAt: current, count: 1 });
        return rule.limit >= 1;
      }
      window.count += 1;
      return window.count <= rule.limit;
    },
  };
}
