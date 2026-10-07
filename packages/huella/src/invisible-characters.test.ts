// Pruebas de detección y eliminación de caracteres invisibles y homoglifos.
import { describe, expect, it } from 'vitest';
import { CONFUSABLES, TYPOGRAPHIC_VARIANTS } from './confusables.ts';
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

  it('detecta homoglifos cirílicos o griegos dentro de palabras latinas', () => {
    // «Secretаría» con «а» cirílica (U+0430) y «οficio» con ómicron griega.
    const report = findInvisibleCharacters('La Secretаría envió el οficio.');
    expect(report.items).toEqual([
      { index: 9, codePoint: 0x0430, kind: 'confusable' },
      { index: 23, codePoint: 0x03bf, kind: 'confusable' },
    ]);
  });

  it('reporta como mezcla las letras de otro alfabeto sin equivalente latino', () => {
    // «л» (U+043B) no se parece a ninguna letra latina: no se cambia, pero se avisa.
    expect(findInvisibleCharacters('Secretлría').items).toEqual([
      { index: 6, codePoint: 0x043b, kind: 'mixed_script' },
    ]);
  });

  it('también reporta homoglifos en palabras sin letras latinas', () => {
    // Decisión: el mapa se aplica a todo token, así que una palabra rusa genuina se reporta.
    expect(kindsOf('Москва')).toEqual(['confusable', 'confusable', 'confusable', 'confusable']);
  });
});

describe('stripInvisibleCharacters', () => {
  it('elimina invisibles, conserva saltos de línea y aplica NFKC', () => {
    const marked = 'Of​i­cio‮ 12\n﻿ﬁrma ＡＢＣ\u{E0041}\r\nfin\t.';
    expect(stripInvisibleCharacters(marked)).toBe('Oficio 12\nfirma ABC\nfin\t.');
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
    expect(findInvisibleCharacters('uno dos\ttres\ncuatro\ncinco').count).toBe(0);
  });

  it('reporta el retorno de carro como control y lo convierte en salto de línea', () => {
    expect(kindsOf('uno\r\ndos\rtres')).toEqual(['control', 'control']);
    expect(stripInvisibleCharacters('uno\r\ndos\rtres')).toBe('uno\ndos\ntres');
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

  it('acepta varios acentos sobre la misma letra si se componen', () => {
    // e + circunflejo + agudo = «ế» (U+1EBF); en el orden inverso no existe forma compuesta.
    expect(findInvisibleCharacters('e\u0302\u0301').count).toBe(0);
    expect(stripInvisibleCharacters('e\u0302\u0301')).toBe('\u1EBF');
    expect(kindsOf('e\u0301\u0302')).toEqual(['uncomposed_mark']);
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
    expect(cleaned).toBe('hola acción y niño');
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

// Marcas de «canario» que una segunda revisión encontró sin limpiar. Se escriben con escapes.
describe('trampa del canario: homoglifos', () => {
  it('limpia letras cirílicas sueltas que funcionan como palabras de una letra', () => {
    // «а», «о» y «у» cirílicas (U+0430, U+043E, U+0443) entre nombres latinos.
    const marked = 'Juan а Pedro о Luis у Ana';
    expect(findInvisibleCharacters(marked).items).toEqual([
      { index: 5, codePoint: 0x0430, kind: 'confusable' },
      { index: 13, codePoint: 0x043e, kind: 'confusable' },
      { index: 20, codePoint: 0x0443, kind: 'confusable' },
    ]);
    const cleaned = stripInvisibleCharacters(marked);
    expect(cleaned).toBe('Juan a Pedro o Luis y Ana');
    expect(findInvisibleCharacters(cleaned).count).toBe(0);
  });

  const HOMOGLYPHS: readonly { codePoint: number; latin: string; name: string }[] = [
    { codePoint: 0x0585, latin: 'o', name: 'o armenia' },
    { codePoint: 0x13aa, latin: 'A', name: 'a cheroqui' },
    { codePoint: 0x0251, latin: 'a', name: 'alfa latina' },
    { codePoint: 0x0261, latin: 'g', name: 'g de guion IPA' },
    { codePoint: 0x0131, latin: 'i', name: 'i sin punto' },
    { codePoint: 0x1d00, latin: 'a', name: 'versalita A' },
  ];

  for (const { codePoint, latin, name } of HOMOGLYPHS) {
    const character = String.fromCodePoint(codePoint);

    it(`limpia ${hex(codePoint)} (${name}) dentro de una palabra y como palabra suelta`, () => {
      expect(kindsOf(`ofi${character}cio`)).toEqual(['confusable']);
      expect(kindsOf(`y ${character} no`)).toEqual(['confusable']);
      expect(stripInvisibleCharacters(`ofi${character}cio ${character}`)).toBe(
        `ofi${latin}cio ${latin}`,
      );
    });
  }

  it('el mapa no cambia letras del español y sus claves son estables bajo NFKC', () => {
    for (const letter of 'áéíóúüñÁÉÍÓÚÜÑ') expect(CONFUSABLES.has(letter)).toBe(false);
    for (const [key, latin] of CONFUSABLES) {
      expect(key.normalize('NFKC')).toBe(key);
      expect(latin).toMatch(/^[a-zA-ZëïËÏ]$/u);
    }
  });
});

describe('trampa del canario: controles y caracteres no imprimibles', () => {
  const CASES: readonly { codePoint: number; kind: string }[] = [
    { codePoint: 0x001f, kind: 'control' },
    { codePoint: 0x000b, kind: 'control' },
    { codePoint: 0x000c, kind: 'control' },
    { codePoint: 0x0000, kind: 'control' },
    { codePoint: 0x007f, kind: 'control' },
    { codePoint: 0x0085, kind: 'control' },
    { codePoint: 0x0090, kind: 'control' },
    { codePoint: 0xe000, kind: 'private_use' },
    { codePoint: 0xf8ff, kind: 'private_use' },
    { codePoint: 0xf0000, kind: 'private_use' },
    { codePoint: 0x0378, kind: 'unassigned' },
    { codePoint: 0xffff, kind: 'unassigned' },
    { codePoint: 0xfdd0, kind: 'unassigned' },
  ];

  for (const { codePoint, kind } of CASES) {
    const character = String.fromCodePoint(codePoint);

    it(`detecta y elimina ${hex(codePoint)} como ${kind}`, () => {
      expect(findInvisibleCharacters(`ofi${character}cio`).items).toEqual([
        { index: 3, codePoint, kind },
      ]);
      const cleaned = stripInvisibleCharacters(`ofi${character}cio`);
      expect(cleaned).toBe('oficio');
      expect(findInvisibleCharacters(cleaned).count).toBe(0);
    });
  }

  it('elimina sustitutos UTF-16 sueltos', () => {
    expect(kindsOf('a\uD800b')).toEqual(['unassigned']);
    expect(stripInvisibleCharacters('a\uD800b\uDC00')).toBe('ab');
  });

  it('convierte U+2028 y U+2029 en salto de línea', () => {
    expect(findInvisibleCharacters('uno dos tres').items).toEqual([
      { index: 3, codePoint: 0x2028, kind: 'line_separator' },
      { index: 7, codePoint: 0x2029, kind: 'line_separator' },
    ]);
    expect(stripInvisibleCharacters('uno dos tres')).toBe('uno\ndos\ntres');
  });
});

describe('trampa del canario: marcas combinantes que no se componen', () => {
  it('detecta y elimina marcas sin forma compuesta después de una letra', () => {
    expect(findInvisibleCharacters('q̇ueja').items).toEqual([
      { index: 1, codePoint: 0x0307, kind: 'uncomposed_mark' },
    ]);
    expect(kindsOf('oficio̸')).toEqual(['uncomposed_mark']);
    const cleaned = stripInvisibleCharacters('q̇ueja del oficio̸');
    expect(cleaned).toBe('queja del oficio');
    expect(findInvisibleCharacters(cleaned).count).toBe(0);
  });

  it('una marca que no se compone no impide que la siguiente sí lo haga', () => {
    // U+0346 no se compone con «a» y bloquearía a U+0301 en NFC; al quitarla queda «á».
    expect(kindsOf('a͆́')).toEqual(['uncomposed_mark']);
    expect(stripInvisibleCharacters('a͆́')).toBe('á');
  });
});

describe('trampa del canario: canales tipográficos', () => {
  it('detecta y normaliza dobles espacios y espacios al final de la línea', () => {
    const marked = 'uno  dos   tres \ncuatro\t\ncinco ';
    expect(findInvisibleCharacters(marked).items).toEqual([
      { index: 4, codePoint: 0x20, kind: 'typographic_variant' },
      { index: 9, codePoint: 0x20, kind: 'typographic_variant' },
      { index: 10, codePoint: 0x20, kind: 'typographic_variant' },
      { index: 15, codePoint: 0x20, kind: 'typographic_variant' },
      { index: 23, codePoint: 0x09, kind: 'typographic_variant' },
      { index: 30, codePoint: 0x20, kind: 'typographic_variant' },
    ]);
    const cleaned = stripInvisibleCharacters(marked);
    expect(cleaned).toBe('uno dos tres\ncuatro\ncinco');
    expect(findInvisibleCharacters(cleaned).count).toBe(0);
  });

  it('un espacio no estándar junto a uno normal también se colapsa', () => {
    expect(kindsOf('a  b')).toEqual(['nonstandard_space', 'typographic_variant']);
    expect(stripInvisibleCharacters('a  b')).toBe('a b');
  });

  it('normaliza guiones variantes y comillas tipográficas', () => {
    const marked = 'pre‐pago, 5 − 3, 2020–2026, “cita” y ‘otra’';
    expect(kindsOf(marked)).toEqual(Array(7).fill('typographic_variant'));
    const cleaned = stripInvisibleCharacters(marked);
    expect(cleaned).toBe('pre-pago, 5 - 3, 2020-2026, "cita" y \'otra\'');
    expect(findInvisibleCharacters(cleaned).count).toBe(0);
  });

  it('cubre el guion sin salto, que NFKC lleva a U+2010', () => {
    expect(kindsOf('pre‑pago')).toEqual(['typographic_variant']);
    expect(stripInvisibleCharacters('pre‑pago')).toBe('pre-pago');
  });

  it('la normalización tipográfica se puede desactivar', () => {
    const options = { shouldNormalizeTypography: false };
    const text = 'uno  dos – “tres” ';
    expect(findInvisibleCharacters(text, options).count).toBe(0);
    expect(stripInvisibleCharacters(text, options)).toBe(text);
    // El resto de la limpieza sigue activa.
    expect(stripInvisibleCharacters('a​а  b', options)).toBe('aa  b');
  });

  it('las variantes tipográficas no incluyen signos propios del español', () => {
    for (const sign of '«»¿¡') expect(TYPOGRAPHIC_VARIANTS.has(sign)).toBe(false);
  });
});

describe('texto largo en español', () => {
  const SPANISH_TEXT = [
    '¿Quién autorizó el pago? ¡Nadie lo sabe! Según el oficio 123/2026, la Secretaría de',
    'Obras Públicas pagó $1,250,000.00 a una empresa sin experiencia. El señor Muñoz, jefe',
    'del área, dijo: «no hay ningún problema». La cigüeña del logotipo y el pingüino de la',
    'campaña costaron más que la obra. ÁRBOL, ÉPOCA, ÍNDICE, ÓRGANO, ÚLTIMO, PINGÜINO, AÑO.',
    'Las facturas llegaron en junio; el contrato, en julio (fuera de plazo). ¿Por qué?',
    '\tLa auditoría encontró 3 irregularidades: sobreprecio, obra incompleta y pagos dobles.',
  ].join('\n');

  it('no tiene falsos positivos ni cambia con la limpieza', () => {
    expect(findInvisibleCharacters(SPANISH_TEXT)).toEqual({ count: 0, items: [] });
    expect(stripInvisibleCharacters(SPANISH_TEXT)).toBe(SPANISH_TEXT);
    expect(stripInvisibleCharacters(SPANISH_TEXT.normalize('NFD'))).toBe(SPANISH_TEXT);
  });

  it('solo cambia la tipografía cuando el texto trae guiones y comillas tipográficas', () => {
    const typographic = `${SPANISH_TEXT}\n—Es un “error”, dijo el director—.`;
    expect(stripInvisibleCharacters(typographic)).toBe(
      `${SPANISH_TEXT}\n-Es un "error", dijo el director-.`,
    );
    expect(stripInvisibleCharacters(typographic, { shouldNormalizeTypography: false })).toBe(
      typographic,
    );
  });
});
