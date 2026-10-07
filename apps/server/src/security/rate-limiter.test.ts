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
