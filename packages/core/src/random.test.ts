// Pruebas de la fuente de aleatoriedad.
import { describe, expect, it } from 'vitest';
import { randomBytes, randomInt, shuffle } from './random.ts';

describe('randomBytes', () => {
  it('devuelve la longitud pedida, incluso mayor al límite por llamada', () => {
    expect(randomBytes(0)).toHaveLength(0);
    expect(randomBytes(32)).toHaveLength(32);
    const large = randomBytes(70000);
    expect(large).toHaveLength(70000);
    // La probabilidad de que el último tramo quede en ceros es despreciable.
    expect(large.subarray(65536).some((byte) => byte !== 0)).toBe(true);
  });

  it('produce valores distintos', () => {
    expect(randomBytes(16)).not.toEqual(randomBytes(16));
  });

  it('rechaza longitudes inválidas', () => {
    expect(() => randomBytes(-1)).toThrow();
    expect(() => randomBytes(1.5)).toThrow();
  });
});

describe('randomInt y shuffle', () => {
  it('devuelve enteros dentro del rango y cubre todos los valores', () => {
    const seen = new Set<number>();
    for (let index = 0; index < 400; index += 1) {
      const value = randomInt(6);
      expect(Number.isInteger(value) && value >= 0 && value < 6).toBe(true);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
    expect(randomInt(1)).toBe(0);
  });

  it('rechaza máximos inválidos', () => {
    for (const bad of [0, -1, 1.5, 2 ** 32 + 1])
      expect(() => randomInt(bad), String(bad)).toThrow();
  });

  it('baraja sin perder ni repetir elementos y sin modificar la entrada', () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    const shuffled = shuffle(items);
    expect(items).toEqual(Array.from({ length: 50 }, (_, index) => index));
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    // La probabilidad de que 50 elementos queden en su lugar es despreciable.
    expect(shuffled).not.toEqual(items);
    expect(shuffle([])).toEqual([]);
  });
});
