// Pruebas de la forma canónica JSON y del digesto SHA-256.
import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { utf8Encode } from './encoding.ts';

describe('canonicalize', () => {
  it('ordena llaves, omite undefined y no deja espacios', () => {
    const value = { b: [1, 'x', null, true], a: { d: 2, c: undefined } };
    expect(canonicalize(value)).toBe('{"a":{"d":2},"b":[1,"x",null,true]}');
  });

  it('ordena por unidades de código UTF-16', () => {
    expect(canonicalize({ b: 1, B: 2, á: 3, a: 4, '\u{1F600}': 5, '￿': 6 })).toBe(
      '{"B":2,"a":4,"b":1,"á":3,"\u{1F600}":5,"￿":6}',
    );
  });

  it('serializa enteros seguros y cadenas como JSON', () => {
    expect(canonicalize([0, -0, 42, -7, Number.MAX_SAFE_INTEGER, 'a"b\n'])).toBe(
      '[0,0,42,-7,9007199254740991,"a\\"b\\n"]',
    );
    expect(canonicalize(Object.create(null) as object)).toBe('{}');
  });

  it('rechaza decimales y enteros fuera del rango seguro', () => {
    for (const invalid of [1.5, 1e21, Number.MAX_SAFE_INTEGER + 1, -(2 ** 60)]) {
      expect(() => canonicalize({ n: invalid })).toThrow('enteros seguros');
    }
  });

  it('rechaza tipos no admitidos', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    for (const invalid of [
      undefined,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      10n,
      Symbol('x'),
      () => 1,
      new Date(0),
      new Map(),
      new Uint8Array(1),
      [undefined],
      circular,
    ]) {
      expect(() => canonicalize(invalid)).toThrow();
    }
  });

  it('admite referencias repetidas que no son circulares', () => {
    const shared = { x: 1 };
    expect(canonicalize({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });
});

describe('sha256Hex', () => {
  it('coincide con los vectores conocidos', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex(utf8Encode('abc'))).toBe(sha256Hex('abc'));
  });

  it('fija el digesto de una forma canónica', () => {
    const value = { b: [1, 'x', null, true], a: { d: 2, c: undefined } };
    expect(sha256Hex(canonicalize(value))).toBe(
      '91868938c0f71d76392791d1c28dbf1dc1253e7707c4965175d1dee1b6118e5e',
    );
  });
});
