// Mapas de homoglifos, puntuación parecida y formas de compatibilidad que sirven para marcar un
// texto. Los usa `invisible-characters.ts` para borrar marcas de «canario».

/**
 * Homoglifo → letra latina con la que se confunde a simple vista.
 *
 * Origen: subconjunto de `confusables.txt` del Unicode Technical Standard #39 (Unicode Security
 * Mechanisms, versión del 2026-08-06), tomando solo las entradas cuyo prototipo es una letra del
 * latín básico (a-z, A-Z), más `ë`/`ï` para la «ё»/«ї» cirílicas, que UTS #39 descompone en letra
 * + diéresis. Se usa la letra que se ve, no el prototipo literal: UTS #39 lleva «I» a «l», aquí
 * una «I» de otro alfabeto pasa a «I».
 *
 * Alcance:
 * - Cirílico, griego, armenio y cheroqui: las letras que en las tipografías comunes son
 *   indistinguibles de una latina (por ejemplo, «а» U+0430, «ο» U+03BF, «օ» U+0585, «Ꭺ» U+13AA).
 * - Lisu (U+A4D0-U+A4FF), silabario canadiense (U+1400-U+167F), copto (U+2C80-U+2CFF y
 *   U+03E2-U+03EF) y tifinagh (U+2D30-U+2D7F): todas sus entradas de UTS #39 con prototipo de una
 *   letra latina. Además, «ᑕ» U+1455 → «C», que UTS #39 no lista pero se lee como una «C».
 * - Latín extendido y fonético (IPA): las entradas de UTS #39 con prototipo de una letra latina
 *   («ɑ», «ɡ», «ı», «ʋ», «ꭇ», etc.) y las versalitas (U+1D00 «ᴀ», U+0299 «ʙ», U+0280 «ʀ», etc.).
 *   Las versalitas sin entrada en UTS #39 («ʀ», «ʟ», «ᴅ», «ᴇ», «ɢ», «ꜰ», «ᴊ», «ꞯ») se agregan aquí
 *   porque se leen como la minúscula correspondiente y sirven igual de canal.
 * - No incluye las formas que `MARKING_COMPATIBILITY_RANGES` ya resuelve con NFKC (ancho
 *   completo, letras matemáticas, formas encerradas). Cada clave es estable bajo NFC, porque el
 *   mapa se aplica después de NFC (lo verifica una prueba).
 * - No incluye letras válidas del español ni de las lenguas indígenas de México: á, é, í, ó, ú,
 *   ü, ñ, «ɨ» (wixárika), «ʉ», el saltillo «ꞌ»/«Ꞌ» (U+A78C/U+A78B) ni el apóstrofo «ʼ» (U+02BC).
 * - Es deliberadamente corto: un mapa completo de UTS #39 (más de 6 000 entradas) también
 *   convertiría símbolos y letras legítimas de otros idiomas. Lo que no está aquí y aparece
 *   en un contexto latino se sigue reportando como `mixed_script`.
 */
export const CONFUSABLES: ReadonlyMap<string, string> = new Map(
  (
    [
      // Cirílico, minúsculas.
      [0x0430, 'a'],
      [0x0435, 'e'],
      [0x043e, 'o'],
      [0x0440, 'p'],
      [0x0441, 'c'],
      [0x0443, 'y'],
      [0x0445, 'x'],
      [0x0455, 's'],
      [0x0456, 'i'],
      [0x0458, 'j'],
      [0x04bb, 'h'],
      [0x0501, 'd'],
      [0x051b, 'q'],
      [0x051d, 'w'],
      [0x04cf, 'l'],
      [0x04af, 'y'],
      [0x0451, 'ë'],
      [0x0457, 'ï'],
      // Cirílico, mayúsculas.
      [0x0410, 'A'],
      [0x0412, 'B'],
      [0x0415, 'E'],
      [0x041a, 'K'],
      [0x041c, 'M'],
      [0x041d, 'H'],
      [0x041e, 'O'],
      [0x0420, 'P'],
      [0x0421, 'C'],
      [0x0422, 'T'],
      [0x0425, 'X'],
      [0x0423, 'Y'],
      [0x0406, 'I'],
      [0x0408, 'J'],
      [0x0405, 'S'],
      [0x051a, 'Q'],
      [0x051c, 'W'],
      [0x04ae, 'Y'],
      [0x04c0, 'l'],
      [0x0401, 'Ë'],
      [0x0407, 'Ï'],
      // Griego.
      [0x03b1, 'a'],
      [0x03bf, 'o'],
      [0x03bd, 'v'],
      [0x03c1, 'p'],
      [0x03c4, 't'],
      [0x03c5, 'u'],
      [0x03b9, 'i'],
      [0x03ba, 'k'],
      [0x03b3, 'y'],
      [0x03f3, 'j'],
      [0x03f2, 'c'],
      [0x03f8, 'p'],
      [0x0391, 'A'],
      [0x0392, 'B'],
      [0x0395, 'E'],
      [0x0396, 'Z'],
      [0x0397, 'H'],
      [0x0399, 'I'],
      [0x039a, 'K'],
      [0x039c, 'M'],
      [0x039d, 'N'],
      [0x039f, 'O'],
      [0x03a1, 'P'],
      [0x03a4, 'T'],
      [0x03a5, 'Y'],
      [0x03a7, 'X'],
      [0x037f, 'J'],
      [0x03f9, 'C'],
      [0x03fa, 'M'],
      // Armenio.
      [0x0585, 'o'],
      [0x057d, 'u'],
      [0x0581, 'g'],
      [0x0570, 'h'],
      [0x0578, 'n'],
      [0x0566, 'q'],
      [0x054f, 'S'],
      [0x0555, 'O'],
      [0x054d, 'U'],
      // Cheroqui (mayúsculas; las minúsculas U+AB70-U+ABBF no se parecen tanto al latín).
      [0x13a0, 'D'],
      [0x13a1, 'R'],
      [0x13a2, 'T'],
      [0x13a9, 'Y'],
      [0x13aa, 'A'],
      [0x13ab, 'J'],
      [0x13ac, 'E'],
      [0x13b3, 'W'],
      [0x13b7, 'M'],
      [0x13bb, 'H'],
      [0x13c0, 'G'],
      [0x13c3, 'Z'],
      [0x13cf, 'b'],
      [0x13d2, 'R'],
      [0x13d9, 'V'],
      [0x13da, 'S'],
      [0x13de, 'L'],
      [0x13df, 'C'],
      [0x13e2, 'P'],
      [0x13e6, 'K'],
      [0x13f4, 'B'],
      // Lisu.
      [0xa4d0, 'B'],
      [0xa4d1, 'P'],
      [0xa4d2, 'd'],
      [0xa4d3, 'D'],
      [0xa4d4, 'T'],
      [0xa4d6, 'G'],
      [0xa4d7, 'K'],
      [0xa4d9, 'J'],
      [0xa4da, 'C'],
      [0xa4dc, 'Z'],
      [0xa4dd, 'F'],
      [0xa4df, 'M'],
      [0xa4e0, 'N'],
      [0xa4e1, 'L'],
      [0xa4e2, 'S'],
      [0xa4e3, 'R'],
      [0xa4e6, 'V'],
      [0xa4e7, 'H'],
      [0xa4ea, 'W'],
      [0xa4eb, 'X'],
      [0xa4ec, 'Y'],
      [0xa4ee, 'A'],
      [0xa4f0, 'E'],
      [0xa4f2, 'I'],
      [0xa4f3, 'O'],
      [0xa4f4, 'U'],
      // Silabario canadiense.
      [0x1455, 'C'],
      [0x146d, 'P'],
      [0x146f, 'd'],
      [0x1472, 'b'],
      [0x148d, 'J'],
      [0x14aa, 'L'],
      [0x142f, 'V'],
      [0x144c, 'U'],
      [0x1541, 'x'],
      [0x157c, 'H'],
      [0x157d, 'x'],
      [0x1587, 'R'],
      [0x15af, 'b'],
      [0x15b4, 'F'],
      [0x15c5, 'A'],
      [0x15de, 'D'],
      [0x15ea, 'D'],
      [0x15f0, 'M'],
      [0x15f7, 'B'],
      [0x166d, 'X'],
      [0x166e, 'x'],
      // Copto.
      [0x2c82, 'B'],
      [0x2c8c, 'Z'],
      [0x2c8d, 'z'],
      [0x2c8e, 'H'],
      [0x2c92, 'I'],
      [0x2c93, 'i'],
      [0x2c94, 'K'],
      [0x2c98, 'M'],
      [0x2c9a, 'N'],
      [0x2c9e, 'O'],
      [0x2c9f, 'o'],
      [0x2ca2, 'P'],
      [0x2ca3, 'p'],
      [0x2ca4, 'C'],
      [0x2ca5, 'c'],
      [0x2ca6, 'T'],
      [0x2ca8, 'Y'],
      [0x2ca9, 'y'],
      [0x2cac, 'X'],
      [0x2cbd, 'w'],
      [0x2cce, 'P'],
      [0x2ccf, 'p'],
      [0x2cd0, 'L'],
      [0x03ed, 'o'],
      // Tifinagh.
      [0x2d38, 'V'],
      [0x2d39, 'E'],
      [0x2d4a, 'l'],
      [0x2d4f, 'l'],
      [0x2d54, 'O'],
      [0x2d55, 'Q'],
      [0x2d5d, 'X'],
      // Latín extendido e IPA.
      [0x0251, 'a'],
      [0xab64, 'a'],
      [0xab32, 'e'],
      [0xab35, 'f'],
      [0xa799, 'f'],
      [0x0284, 'f'],
      [0xa798, 'F'],
      [0x0261, 'g'],
      [0x0131, 'i'],
      [0x0269, 'i'],
      [0x026a, 'i'],
      [0x0237, 'j'],
      [0xa7b2, 'J'],
      [0x01c0, 'l'],
      [0xa7ae, 'I'],
      [0xa7fe, 'l'],
      [0xa781, 'l'],
      [0xab3d, 'o'],
      [0xab47, 'r'],
      [0xab48, 'r'],
      [0xa79f, 'u'],
      [0xab4e, 'u'],
      [0xab52, 'u'],
      [0x028b, 'u'],
      [0x026f, 'w'],
      [0xa7fa, 'w'],
      [0xa7b3, 'X'],
      [0x0263, 'y'],
      [0xab5a, 'y'],
      [0x028f, 'y'],
      [0xa7b4, 'B'],
      // Versalitas.
      [0x1d00, 'a'],
      [0x0299, 'b'],
      [0x1d04, 'c'],
      [0x1d05, 'd'],
      [0x1d07, 'e'],
      [0xa730, 'f'],
      [0x0262, 'g'],
      [0x029c, 'h'],
      [0x1d0a, 'j'],
      [0x1d0b, 'k'],
      [0x029f, 'l'],
      [0x1d0d, 'm'],
      [0x0274, 'n'],
      [0x1d0f, 'o'],
      [0x1d11, 'o'],
      [0x1d18, 'p'],
      [0xa7af, 'q'],
      [0x0280, 'r'],
      [0xa731, 's'],
      [0x1d1b, 't'],
      [0x1d1c, 'u'],
      [0x1d20, 'v'],
      [0x1d21, 'w'],
      [0x1d22, 'z'],
    ] as const
  ).map(([codePoint, latin]) => [String.fromCodePoint(codePoint), latin]),
);

/**
 * Variantes de teclado → su equivalente simple: guiones, rayas, comillas y acentos sueltos que
 * producen el teclado en español y la corrección automática de los procesadores de textos. Sirven
 * para marcar copias igual que un carácter invisible, pero son muy comunes; por eso solo se
 * reportan y normalizan si `shouldNormalizeTypography` está activo.
 *
 * Las comillas angulares «» y los signos de apertura ¿¡ son del español y no están aquí. El
 * apóstrofo «ʼ» (U+02BC) tampoco: es el saltillo del mixteco y otras lenguas.
 */
export const TYPOGRAPHIC_VARIANTS: ReadonlyMap<string, string> = new Map(
  (
    [
      // Guiones, rayas y signo menos.
      [0x2010, '-'],
      [0x2011, '-'],
      [0x2012, '-'],
      [0x2013, '-'],
      [0x2014, '-'],
      [0x2015, '-'],
      [0x2212, '-'],
      // Comillas dobles.
      [0x201c, '"'],
      [0x201d, '"'],
      [0x201e, '"'],
      [0x201f, '"'],
      // Comillas simples, prima y acentos sueltos usados como apóstrofo.
      [0x2018, "'"],
      [0x2019, "'"],
      [0x201a, "'"],
      [0x201b, "'"],
      [0x2032, "'"],
      [0x0060, "'"],
      [0x00b4, "'"],
    ] as const
  ).map(([codePoint, simple]) => [String.fromCodePoint(codePoint), simple]),
);

/**
 * Puntuación de otros sistemas que se ve igual que la común → su equivalente simple. Ningún
 * teclado en español la produce, así que siempre se reporta (como `typographic_variant`) y se
 * normaliza, aunque `shouldNormalizeTypography` esté desactivado.
 *
 * Origen: entradas de `confusables.txt` (UTS #39) cuyo prototipo es `-`, `ー`, `:`, `.`, `,`,
 * `'`, `''`, `/`, `<` o `>`, limitadas a los sistemas de escritura que no se usan en México. Se
 * agregan la raya doble y triple (U+2E3A, U+2E3B), «‥» (U+2025) y la comilla CJK de cierre
 * (U+301F). Las comillas «‹ ›» van a `'` por su función de comilla simple, no a `<`/`>`.
 *
 * Exclusiones deliberadas: «ʼ» U+02BC y «ꞌ»/«Ꞌ» (saltillo), «ː» U+02D0 (marca de vocal larga en
 * transcripciones de lenguas indígenas), «⁄» U+2044 (barra de fracción) y las letras de
 * escrituras índicas, árabe y hebrea que UTS #39 lista como puntuación.
 */
export const PUNCTUATION_CONFUSABLES: ReadonlyMap<string, string> = new Map(
  (
    [
      // Guiones y rayas.
      [0x2043, '-'],
      [0x02d7, '-'],
      [0x2796, '-'],
      [0x2cba, '-'],
      [0x2cbb, '-'],
      [0x2500, '-'],
      [0x2501, '-'],
      [0x2e3a, '-'],
      [0x2e3b, '-'],
      [0x30fc, '-'],
      [0x4e00, '-'],
      [0x31d0, '-'],
      [0x3192, '-'],
      [0x3161, '-'],
      [0x1173, '-'],
      [0xa7f7, '-'],
      // Dos puntos.
      [0x0589, ':'],
      [0x05c3, ':'],
      [0x0703, ':'],
      [0x0704, ':'],
      [0x1361, ':'],
      [0x16ec, ':'],
      [0x1803, ':'],
      [0x1809, ':'],
      [0x205a, ':'],
      [0x02f8, ':'],
      [0x2236, ':'],
      [0xa789, ':'],
      [0xa4fd, ':'],
      // Puntos y comas.
      [0x2024, '.'],
      [0x2025, '..'],
      [0xa4f8, '.'],
      [0xa4f9, ','],
      [0x2e12, ','],
      // Apóstrofos y comillas simples.
      [0x02b9, "'"],
      [0x02bb, "'"],
      [0x02bd, "'"],
      [0x02be, "'"],
      [0x02c8, "'"],
      [0x02ca, "'"],
      [0x02cb, "'"],
      [0x02f4, "'"],
      [0x0384, "'"],
      [0x055a, "'"],
      [0x055b, "'"],
      [0x055d, "'"],
      [0x05f3, "'"],
      [0x07f4, "'"],
      [0x07f5, "'"],
      [0x144a, "'"],
      [0x16cc, "'"],
      [0x1fbd, "'"],
      [0x1fbf, "'"],
      [0x1ffe, "'"],
      [0x2035, "'"],
      [0x2cff, "'"],
      [0x2039, "'"],
      [0x203a, "'"],
      // Comillas dobles y primas dobles.
      [0x02ba, '"'],
      [0x02dd, '"'],
      [0x02ee, '"'],
      [0x02f6, '"'],
      [0x05f4, '"'],
      [0x2033, '"'],
      [0x2036, '"'],
      [0x3003, '"'],
      [0x301d, '"'],
      [0x301e, '"'],
      [0x301f, '"'],
      // Barras.
      [0x2215, '/'],
      [0x29f8, '/'],
    ] as const
  ).map(([codePoint, simple]) => [String.fromCodePoint(codePoint), simple]),
);

/**
 * Bloques de formas de compatibilidad que se usan como marca y que la limpieza lleva a su forma
 * NFKC (inicio, fin y descripción). Fuera de estos bloques no se aplica NFKC.
 *
 * Seguridad: NFKC completo cambia en silencio usos legítimos del español y de las lenguas
 * indígenas de México: ordinales «º» y «ª», superíndices («m²», tonos del triqui y el chinanteco
 * como «ni³»), subíndices, fracciones («½»), letras modificadoras («ʰ», «ᵃ»), «µ», «…», «™»,
 * «№» y los acentos sueltos «¨», «¯», «¸». Todos ellos se conservan y no se reportan.
 */
export const MARKING_COMPATIBILITY_RANGES: readonly (readonly [number, number, string])[] = [
  [0x0132, 0x0133, 'ligadura «ĳ»'],
  [0x013f, 0x0140, '«ŀ» con punto medio'],
  [0x0149, 0x0149, '«ŉ»'],
  [0x017f, 0x017f, 's larga «ſ»'],
  [0x01c4, 0x01cc, 'dígrafos «ǆ», «ǉ», «ǌ»'],
  [0x01f1, 0x01f3, 'dígrafo «ǳ»'],
  [0x2100, 0x214f, 'símbolos de letra que equivalen a una sola letra («ℓ», «ℎ», «ℂ»)'],
  [0x2160, 0x217f, 'números romanos («Ⅻ»)'],
  [0x2460, 0x24ff, 'alfanuméricos encerrados («①», «ⓐ», «⑴», «⒈»)'],
  [0x2f00, 0x2fdf, 'radicales Kangxi'],
  [0x3200, 0x33ff, 'formas CJK encerradas y en cuadro («㈠», «㎏»)'],
  [0xfb00, 0xfb06, 'ligaduras latinas («ﬁ», «ﬂ»)'],
  [0xfe10, 0xfe19, 'formas verticales'],
  [0xfe30, 0xfe4f, 'formas de compatibilidad CJK'],
  [0xfe50, 0xfe6f, 'variantes pequeñas («﹘», «﹣»)'],
  [0xff00, 0xffef, 'formas de ancho completo y medio ancho («Ａ», «＂», «ｰ»)'],
  [0x1d400, 0x1d7ff, 'letras y dígitos matemáticos («𝐚», «𝔞», «𝟙»)'],
  [0x1f100, 0x1f1ff, 'alfanuméricos encerrados suplementarios («🄐», «🄰»)'],
  [0x1fbf0, 0x1fbf9, 'dígitos segmentados'],
];

const LETTERLIKE_START = 0x2100;
const LETTERLIKE_END = 0x214f;
const SINGLE_LETTER = /^\p{L}$/u;

/**
 * Indica si un carácter (un punto de código) es una forma de compatibilidad de
 * `MARKING_COMPATIBILITY_RANGES` que NFKC cambia. En los símbolos de letra (U+2100-U+214F) solo
 * cuenta si NFKC da una sola letra, para no tocar «№», «™», «℃» ni «℅».
 */
export function isMarkingCompatibilityForm(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  const compatible = character.normalize('NFKC');
  if (compatible === character) return false;
  if (codePoint >= LETTERLIKE_START && codePoint <= LETTERLIKE_END) {
    return SINGLE_LETTER.test(compatible);
  }
  return MARKING_COMPATIBILITY_RANGES.some(
    ([start, end]) => codePoint >= start && codePoint <= end,
  );
}
