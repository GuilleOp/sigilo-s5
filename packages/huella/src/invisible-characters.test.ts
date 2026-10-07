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
