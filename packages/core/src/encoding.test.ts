// Pruebas de codificaciones Base64URL, hexadecimal y UTF-8.
import { describe, expect, it } from 'vitest';
import { fromBase64Url, fromHex, toBase64Url, toHex, utf8Decode, utf8Encode } from './encoding.ts';

describe('Base64URL', () => {
  it('coincide con los vectores de RFC 4648 sin relleno', () => {
    const cases: [string, string][] = [
      ['', ''],
      ['f', 'Zg'],
      ['fo', 'Zm8'],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg'],
      ['fooba', 'Zm9vYmE'],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of cases) {
      expect(toBase64Url(utf8Encode(plain))).toBe(encoded);
      expect(utf8Decode(fromBase64Url(encoded))).toBe(plain);
    }
  });

  it('usa el alfabeto URL', () => {
    expect(toBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]))).toBe('-_-_');
    expect(fromBase64Url('-_-_')).toEqual(new Uint8Array([0xfb, 0xff, 0xbf]));
  });

  it('hace ida y vuelta con todos los valores de byte', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  it('rechaza relleno, caracteres inválidos, longitud imposible y bits sobrantes', () => {
    for (const invalid of ['Zg==', 'Zm9v+', 'Zm/v', 'Z', 'Zm9vY', 'Zh', 'Zm9']) {
      expect(() => fromBase64Url(invalid)).toThrow('Base64URL inválido');
    }
  });
});

describe('hexadecimal', () => {
  it('hace ida y vuelta en minúsculas', () => {
    const bytes = new Uint8Array([0, 1, 0xab, 0xff]);
    expect(toHex(bytes)).toBe('0001abff');
    expect(fromHex('0001ABff')).toEqual(bytes);
  });

  it('rechaza longitud impar o caracteres inválidos', () => {
    expect(() => fromHex('abc')).toThrow('hexadecimal inválido');
    expect(() => fromHex('zz')).toThrow('hexadecimal inválido');
  });
});

describe('UTF-8', () => {
  it('hace ida y vuelta con acentos y eñe', () => {
    const text = 'Denuncia: año, acción, pingüino';
    expect(utf8Decode(utf8Encode(text))).toBe(text);
    expect(utf8Encode('ñ')).toEqual(new Uint8Array([0xc3, 0xb1]));
  });

  it('rechaza secuencias inválidas', () => {
    expect(() => utf8Decode(new Uint8Array([0xc3]))).toThrow('UTF-8 válido');
  });
});
