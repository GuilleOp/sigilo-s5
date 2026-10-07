// Pruebas del limitador de intentos con ventanas fijas.
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limiter.ts';

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
});
