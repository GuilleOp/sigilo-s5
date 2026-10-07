// Pruebas de la fuente de aleatoriedad.
import { describe, expect, it } from 'vitest';
import { randomBytes } from './random.ts';

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
