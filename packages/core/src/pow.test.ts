// Pruebas de la prueba de trabajo: bits en cero, solución, verificación, cabecera y manipulación.
import { describe, expect, it } from 'vitest';
import {
  formatPowHeader,
  isPowSolution,
  leadingZeroBits,
  parsePowHeader,
  powDigest,
  powSolveSeconds,
  SLOW_DEVICE_HASHES_PER_SECOND,
  solvePow,
} from './pow.ts';
import { toHex } from './encoding.ts';

const TOKEN = 'cmV0by1zaW50ZXRpY28.ZmlybWEtc2ludGV0aWNh';

describe('leadingZeroBits', () => {
  it('cuenta los bits en cero al inicio', () => {
    expect(leadingZeroBits(new Uint8Array([0x80]))).toBe(0);
    expect(leadingZeroBits(new Uint8Array([0x01]))).toBe(7);
    expect(leadingZeroBits(new Uint8Array([0x00, 0x00, 0x10]))).toBe(19);
    expect(leadingZeroBits(new Uint8Array([0, 0]))).toBe(16);
  });
});

describe('solvePow e isPowSolution', () => {
  it('fija el digesto del mensaje token:contador', () => {
    expect(toHex(powDigest('a', '0'))).toBe(
      '0ed32d3352f0cddd88b03a266c387e1a4683d5356ce381463b4b42cf9ccadfaf',
    );
  });

  it('encuentra una solución que el verificador acepta y rechaza otras', () => {
    const counter = solvePow(TOKEN, 10);
    expect(counter).not.toBeNull();
    if (counter === null) return;
    expect(isPowSolution(TOKEN, counter, 10)).toBe(true);
    expect(leadingZeroBits(powDigest(TOKEN, counter))).toBeGreaterThanOrEqual(10);
    // Es la primera solución: el contador anterior no resuelve el reto, y la misma no sirve con
    // otro reto (el resultado es determinista porque el reto es fijo).
    expect(isPowSolution(TOKEN, String(Number(counter) - 1), 10)).toBe(false);
    expect(isPowSolution(`${TOKEN}x`, counter, 10)).toBe(false);
    expect(isPowSolution(TOKEN, counter, 33)).toBe(false);
  });

  it('con 0 bits acepta cualquier contador bien formado', () => {
    expect(solvePow(TOKEN, 0)).toBe('0');
    expect(isPowSolution(TOKEN, '12345', 0)).toBe(true);
    for (const bad of ['', '01', '-1', '1.5', 'x', '1'.repeat(16)]) {
      expect(isPowSolution(TOKEN, bad, 0), bad).toBe(false);
    }
  });

  it('respeta el máximo de intentos, informa el avance y valida la dificultad', () => {
    const progress: number[] = [];
    expect(
      solvePow(TOKEN, 32, {
        maxAttempts: 10,
        progressEvery: 4,
        onProgress: (n) => progress.push(n),
      }),
    ).toBeNull();
    expect(progress).toEqual([4, 8]);
    expect(() => solvePow(TOKEN, 33)).toThrow('dificultad');
    expect(() => solvePow(TOKEN, 1.5)).toThrow('dificultad');
  });
});

describe('cabecera de la prueba', () => {
  it('ida y vuelta, y rechaza formas inválidas', () => {
    const header = formatPowHeader(TOKEN, '42');
    expect(parsePowHeader(header)).toEqual({ token: TOKEN, counter: '42' });
    expect(parsePowHeader('sin-separador')).toBeNull();
    expect(parsePowHeader(':42')).toBeNull();
    expect(parsePowHeader(`${TOKEN}:abc`)).toBeNull();
  });
});

describe('powSolveSeconds', () => {
  it('estima el cuantil de la geométrica para un celular lento', () => {
    // Percentil 95 a 20 bits y 50 mil hashes por segundo: ln(20) · 2^20 / 50 000 ≈ 62.8 s.
    expect(powSolveSeconds(20)).toBeCloseTo((Math.log(20) * 2 ** 20) / 50_000, 6);
    expect(powSolveSeconds(20)).toBeCloseTo(62.83, 1);
    // La mediana es ln(2) veces el promedio y cada bit duplica el tiempo.
    expect(powSolveSeconds(10, 0.5, 1)).toBeCloseTo(Math.log(2) * 1024, 6);
    expect(powSolveSeconds(19) * 2).toBeCloseTo(powSolveSeconds(20), 6);
    expect(powSolveSeconds(0)).toBeCloseTo(Math.log(20) / SLOW_DEVICE_HASHES_PER_SECOND, 9);
  });

  it('rechaza dificultades, cuantiles y velocidades inválidos', () => {
    expect(() => powSolveSeconds(33)).toThrow('dificultad');
    expect(() => powSolveSeconds(10, 1)).toThrow('cuantil');
    expect(() => powSolveSeconds(10, 0)).toThrow('cuantil');
    expect(() => powSolveSeconds(10, 0.5, 0)).toThrow('velocidad');
  });
});
