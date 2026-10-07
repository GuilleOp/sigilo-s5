// Pruebas del limitador de intentos con ventanas fijas y del freno global.
import { describe, expect, it } from 'vitest';
import { createRateLimiter, createThrottle } from './rate-limiter.ts';

describe('createRateLimiter', () => {
  it('permite hasta el límite por llave y reinicia al vencer la ventana', () => {
    let now = new Date('2026-10-20T00:00:00Z');
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 }, () => now);
    expect([limiter.consume('a'), limiter.consume('a'), limiter.consume('a')]).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.consume('b')).toBe(true);
    now = new Date(now.getTime() + 1000);
    expect(limiter.consume('a')).toBe(true);
  });

  it('consulta si una llave está limitada sin registrar intentos', () => {
    let now = new Date('2026-10-20T00:00:00Z');
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 }, () => now);
    expect(limiter.isLimited('a')).toBe(false);
    limiter.consume('a');
    expect(limiter.isLimited('a')).toBe(false);
    limiter.consume('a');
    expect(limiter.isLimited('a')).toBe(true);
    expect(limiter.isLimited('a')).toBe(true);
    now = new Date(now.getTime() + 1000);
    expect(limiter.isLimited('a')).toBe(false);
  });
});

describe('createThrottle', () => {
  it('no retrasa bajo el límite y frena de forma creciente hasta el máximo', () => {
    let now = new Date('2026-10-20T00:00:00Z');
    const throttle = createThrottle(
      { limit: 2, windowMs: 1000, stepMs: 100, maxDelayMs: 250 },
      () => now,
    );
    const delays: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      delays.push(throttle.delayMs());
      throttle.record();
    }
    expect(delays).toEqual([0, 0, 0, 100, 200, 250]);
    now = new Date(now.getTime() + 1000);
    expect(throttle.delayMs()).toBe(0);
  });
});

describe('capacidad del limitador', () => {
  it('nunca guarda más llaves que el tope y olvida las usadas hace más tiempo', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 }, () => now, { maxKeys: 10 });
    for (let index = 0; index < 10; index += 1) limiter.consume(`k${index}`);
    // Usar "k0" la vuelve la más reciente; al entrar otra se olvidan las dos más antiguas (k1, k2).
    expect(limiter.isLimited('k0')).toBe(true);
    limiter.consume('k0');
    limiter.consume('nueva');
    expect(limiter.size()).toBe(9);
    expect(limiter.isLimited('k1')).toBe(false);
    expect(limiter.isLimited('k2')).toBe(false);
    expect(limiter.isLimited('k3')).toBe(true);
    expect(limiter.isLimited('k0')).toBe(true);
    expect(limiter.isLimited('nueva')).toBe(true);
  });

  it('barre las ventanas vencidas a lo más una vez por intervalo', () => {
    let now = new Date('2026-10-20T00:00:00Z');
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000 }, () => now, {
      maxKeys: 1000,
      sweepIntervalMs: 10_000,
    });
    for (let index = 0; index < 100; index += 1) limiter.consume(`k${index}`);
    // Las ventanas vencieron, pero el primer barrido ya ocurrió: hasta el siguiente intervalo se
    // conservan (y cuentan como nuevas al volver a usarse).
    now = new Date(now.getTime() + 2000);
    limiter.consume('nueva');
    expect(limiter.size()).toBe(101);
    expect(limiter.isLimited('k0')).toBe(false);
    now = new Date(now.getTime() + 10_000);
    limiter.consume('otra');
    expect(limiter.size()).toBe(1);
  });

  it('procesa muchas llaves distintas en tiempo lineal y con memoria acotada', () => {
    let tick = 0;
    const limiter = createRateLimiter(
      { limit: 10, windowMs: 60 * 60 * 1000 },
      () => new Date(1_790_000_000_000 + tick),
      { maxKeys: 50_000 },
    );
    const startedAt = performance.now();
    for (let index = 0; index < 200_000; index += 1) {
      tick += 1;
      limiter.consume(`llave-${index}`);
    }
    const elapsedMs = performance.now() - startedAt;
    expect(limiter.size()).toBeLessThanOrEqual(50_000);
    expect(limiter.size()).toBeGreaterThanOrEqual(45_000);
    // Holgado para máquinas lentas de CI; con un barrido por intento tardaría minutos.
    expect(elapsedMs).toBeLessThan(2000);
  });
});
