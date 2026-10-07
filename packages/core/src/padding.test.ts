// Pruebas del relleno a bloques con prefijo de longitud.
import { describe, expect, it } from 'vitest';
import { padToBlock, unpad } from './padding.ts';

describe('padToBlock y unpad', () => {
  it('rellena a múltiplos del bloque con prefijo big endian', () => {
    const padded = padToBlock(new Uint8Array([7, 8, 9]), 16);
    expect(padded).toEqual(new Uint8Array([0, 0, 0, 3, 7, 8, 9, ...Array<number>(9).fill(0)]));
    expect(unpad(padded)).toEqual(new Uint8Array([7, 8, 9]));
  });

  it('hace ida y vuelta en los bordes de bloque', () => {
    for (const length of [0, 1, 507, 508, 509, 1020, 1021]) {
      const bytes = Uint8Array.from({ length }, (_, index) => (index % 255) + 1);
      const padded = padToBlock(bytes, 512);
      expect(padded.length % 512).toBe(0);
      expect(padded.length).toBe(Math.ceil((length + 4) / 512) * 512);
      expect(unpad(padded)).toEqual(bytes);
    }
  });

  it('funciona con vistas desplazadas', () => {
    const padded = padToBlock(new Uint8Array([1, 2]), 8);
    const shifted = new Uint8Array(padded.length + 3);
    shifted.set(padded, 3);
    expect(unpad(shifted.subarray(3))).toEqual(new Uint8Array([1, 2]));
  });

  it('rechaza tamaños de bloque inválidos', () => {
    expect(() => padToBlock(new Uint8Array(1), 0)).toThrow();
    expect(() => padToBlock(new Uint8Array(1), 1.5)).toThrow();
  });

  it('rechaza relleno corrupto', () => {
    expect(() => unpad(new Uint8Array(3))).toThrow('Relleno inválido');
    expect(() => unpad(new Uint8Array([0, 0, 0, 9, 1, 2]))).toThrow('Relleno inválido');
    const padded = padToBlock(new Uint8Array([1]), 16);
    padded[15] = 1;
    expect(() => unpad(padded)).toThrow('Relleno inválido');
  });
});
