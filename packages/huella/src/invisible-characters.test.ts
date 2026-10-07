// Pruebas de detección y eliminación de caracteres invisibles y homoglifos.
import { describe, expect, it } from 'vitest';
import { findInvisibleCharacters, stripInvisibleCharacters } from './invisible-characters.ts';

const kindsOf = (text: string): string[] =>
  findInvisibleCharacters(text).items.map((item) => item.kind);

describe('findInvisibleCharacters', () => {
  it('no reporta nada en texto limpio con acentos, eñes y saltos de línea', () => {
    expect(
      findInvisibleCharacters('Año de la denuncia.\nSegún el oficio,\tnadie respondió.'),
    ).toEqual({ count: 0, items: [] });
  });

  it('clasifica cada familia de caracteres', () => {
    expect(kindsOf('a​b‌c‍d⁠e﻿')).toEqual(Array(5).fill('zero_width'));
    expect(kindsOf('‪‫‬‭‮⁦⁧⁨⁩‎‏؜')).toEqual(Array(12).fill('bidi_control'));
    expect(kindsOf('of­icio')).toEqual(['soft_hyphen']);
    expect(kindsOf('x\u{E0041}\u{E007F}')).toEqual(['tag', 'tag']);
    expect(kindsOf('a️\u{E0100}')).toEqual(['variation_selector', 'variation_selector']);
    expect(kindsOf('a⁢b\u{110BD}')).toEqual(['other_format', 'other_format']);
  });

  it('reporta índices UTF-16 y puntos de código', () => {
    const report = findInvisibleCharacters('ñ😀​é\u{E0041}');
    expect(report.count).toBe(2);
    expect(report.items).toEqual([
      { index: 3, codePoint: 0x200b, kind: 'zero_width' },
      { index: 5, codePoint: 0xe0041, kind: 'tag' },
    ]);
  });

  it('detecta letras cirílicas o griegas dentro de palabras latinas', () => {
    // «Secretаría» con «а» cirílica (U+0430) y «οficio» con ómicron griega.
    const report = findInvisibleCharacters('La Secretаría envió el οficio.');
    expect(report.items).toEqual([
      { index: 9, codePoint: 0x0430, kind: 'mixed_script' },
      { index: 23, codePoint: 0x03bf, kind: 'mixed_script' },
    ]);
  });

  it('no confunde palabras completas en otro alfabeto con homoglifos', () => {
    expect(findInvisibleCharacters('Москва y Αθήνα son ciudades.').count).toBe(0);
  });
});

describe('stripInvisibleCharacters', () => {
  it('elimina invisibles, conserva saltos de línea y aplica NFKC', () => {
    const marked = 'Of​i­cio‮ 12\n﻿ﬁrma ＡＢＣ\u{E0041}\r\nfin\t.';
    expect(stripInvisibleCharacters(marked)).toBe('Oficio 12\nfirma ABC\r\nfin\t.');
  });

  it('sustituye homoglifos en palabras mixtas', () => {
    expect(stripInvisibleCharacters('Secretаría y οficio')).toBe('Secretaría y oficio');
  });

  it('el resultado ya no tiene hallazgos', () => {
    const cleaned = stripInvisibleCharacters('a‍b⁦c️d pаlabрa');
    expect(findInvisibleCharacters(cleaned).count).toBe(0);
  });

  it('compone acentos separados (NFC dentro de NFKC)', () => {
    expect(stripInvisibleCharacters('acción')).toBe('acción');
  });
});

// Caracteres que una revisión encontró sin detectar. Se escriben con escapes para que se vean.
const REVIEWED_CHARACTERS: readonly { codePoint: number; name: string; kind: string }[] = [
  { codePoint: 0x034f, name: 'unificador de grafemas (CGJ)', kind: 'default_ignorable' },
  { codePoint: 0x115f, name: 'relleno inicial Hangul', kind: 'filler' },
  { codePoint: 0x1160, name: 'relleno medial Hangul', kind: 'filler' },
  { codePoint: 0x3164, name: 'relleno Hangul', kind: 'filler' },
  { codePoint: 0xffa0, name: 'relleno Hangul de medio ancho', kind: 'filler' },
  { codePoint: 0x2800, name: 'Braille en blanco', kind: 'filler' },
  { codePoint: 0x17b4, name: 'vocal inherente jemer AQ', kind: 'default_ignorable' },
  { codePoint: 0x17b5, name: 'vocal inherente jemer AA', kind: 'default_ignorable' },
  { codePoint: 0x1d159, name: 'cabeza de nota nula musical', kind: 'filler' },
];

const NONSTANDARD_SPACES: readonly number[] = [
  0x00a0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009,
  0x200a, 0x202f, 0x205f, 0x3000,
];

const hex = (codePoint: number): string =>
  `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;

describe('caracteres que antes no se detectaban', () => {
  for (const { codePoint, name, kind } of REVIEWED_CHARACTERS) {
    const character = String.fromCodePoint(codePoint);

    it(`detecta ${hex(codePoint)} (${name}) dentro y fuera de una palabra`, () => {
      expect(findInvisibleCharacters(`ofi${character}cio`).items).toEqual([
        { index: 3, codePoint, kind },
      ]);
      expect(kindsOf(`fin ${character} del oficio`)).toEqual([kind]);
    });

    it(`elimina ${hex(codePoint)} (${name})`, () => {
      const cleaned = stripInvisibleCharacters(`ofi${character}cio y fin${character}`);
      expect(cleaned).toBe('oficio y fin');
      expect(findInvisibleCharacters(cleaned).count).toBe(0);
    });
  }

  it('detecta el resto de los ignorables por defecto (selector mongol, sin asignar)', () => {
    expect(kindsOf('a\u180Bb\u2065c\uFFF0d')).toEqual([
      'default_ignorable',
      'default_ignorable',
      'default_ignorable',
    ]);
    expect(stripInvisibleCharacters('a\u180Bb\u2065c\uFFF0d')).toBe('abcd');
  });
});

describe('espacios no estándar', () => {
  for (const codePoint of NONSTANDARD_SPACES) {
    const space = String.fromCodePoint(codePoint);

    it(`detecta ${hex(codePoint)} y lo cambia por un espacio normal`, () => {
      expect(findInvisibleCharacters(`Oficio${space}12`).items).toEqual([
        { index: 6, codePoint, kind: 'nonstandard_space' },
      ]);
      const cleaned = stripInvisibleCharacters(`Oficio${space}12`);
      expect(cleaned).toBe('Oficio 12');
      expect(findInvisibleCharacters(cleaned).count).toBe(0);
    });
  }

  it('no reporta el espacio normal, los tabuladores ni los saltos de línea', () => {
    expect(findInvisibleCharacters('uno dos\ttres\ncuatro\r\ncinco').count).toBe(0);
  });
});

describe('marcas combinantes', () => {
  const NFD_TEXT = 'Según el señor Muñoz, la acción ocurrió en Güémez; el pingüino ÁÉÍÓÚ Ñ Ü.';

  it('no da falsos positivos con español en NFC ni en NFD', () => {
    expect(findInvisibleCharacters(NFD_TEXT.normalize('NFC')).count).toBe(0);
    expect(findInvisibleCharacters(NFD_TEXT.normalize('NFD')).count).toBe(0);
  });

  it('la limpieza conserva acentos, eñes y diéresis y los deja en NFC', () => {
    expect(stripInvisibleCharacters(NFD_TEXT.normalize('NFD'))).toBe(NFD_TEXT.normalize('NFC'));
    expect(stripInvisibleCharacters(NFD_TEXT)).toBe(NFD_TEXT);
  });

  it('acepta varios acentos sobre la misma letra', () => {
    expect(findInvisibleCharacters('e\u0301\u0302').count).toBe(0);
  });

  it('detecta marcas sueltas al inicio, tras un espacio o tras puntuación', () => {
    expect(findInvisibleCharacters('\u0301hola').items).toEqual([
      { index: 0, codePoint: 0x0301, kind: 'combining_mark' },
    ]);
    expect(kindsOf('hola \u0308 adiós')).toEqual(['combining_mark']);
    expect(kindsOf('fin.\u20DD')).toEqual(['combining_mark']);
    expect(kindsOf('a \u0301\u0301')).toEqual(['combining_mark', 'combining_mark']);
  });

  it('una marca tras un espacio no estándar también queda suelta', () => {
    expect(kindsOf('a\u00A0\u0301')).toEqual(['nonstandard_space', 'combining_mark']);
  });

  it('elimina las marcas sueltas sin tocar las que acompañan a una letra', () => {
    const cleaned = stripInvisibleCharacters('\u0301hola \u0308 acción y nin\u0303o');
    expect(cleaned).toBe('hola  acción y niño');
    expect(findInvisibleCharacters(cleaned).count).toBe(0);
  });

  it('un carácter eliminado entre la letra y su acento no lo separa', () => {
    expect(kindsOf('n\u200B\u0303')).toEqual(['zero_width']);
    expect(stripInvisibleCharacters('n\u200B\u0303o')).toBe('ño');
  });

  it('quita la marca suelta que NFKC genera a partir del acento agudo aislado', () => {
    const cleaned = stripInvisibleCharacters('nota\u00B4 final');
    expect(findInvisibleCharacters(cleaned).count).toBe(0);
  });
});
