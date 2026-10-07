// Mapa compacto de homoglifos (letras de otro alfabeto o del latín extendido que se ven como una
// letra del latín básico). Lo usa `invisible-characters.ts` para borrar marcas de «canario».

/**
 * Homoglifo → letra latina con la que se confunde a simple vista.
 *
 * Origen: subconjunto de `confusables.txt` del Unicode Technical Standard #39 (Unicode Security
 * Mechanisms), tomando solo las entradas cuyo prototipo es una letra del latín básico (a-z, A-Z),
 * más `ë`/`ï` para la «ё»/«ї» cirílicas, que UTS #39 descompone en letra + diéresis.
 *
 * Alcance:
 * - Cirílico, griego, armenio y cheroqui: las letras que en las tipografías comunes son
 *   indistinguibles de una latina (por ejemplo, «а» U+0430, «ο» U+03BF, «օ» U+0585, «Ꭺ» U+13AA).
 * - Latín extendido y fonético (IPA): «ɑ» U+0251, «ɡ» U+0261, «ı» U+0131 y las versalitas
 *   (U+1D00 «ᴀ», U+0299 «ʙ», etc.). Las versalitas sin entrada en UTS #39 se agregan aquí porque
 *   se leen como la minúscula correspondiente y sirven igual de canal.
 * - No incluye lo que NFKC ya resuelve (ancho completo, letras matemáticas, «ſ», ligaduras):
 *   el mapa se aplica después de NFKC y cada clave es estable bajo NFKC (lo verifica una prueba).
 * - No incluye letras válidas del español: á, é, í, ó, ú, ü, ñ y sus mayúsculas no se tocan.
 * - Es deliberadamente corto: un mapa completo de UTS #39 (más de 6 000 entradas) también
 *   convertiría símbolos y letras legítimas de otros idiomas. Lo que no está aquí y aparece
 *   dentro de una palabra latina se sigue reportando como `mixed_script`.
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
      // Latín extendido, IPA y versalitas.
      [0x0251, 'a'],
      [0x0261, 'g'],
      [0x0131, 'i'],
      [0x0269, 'i'],
      [0x026a, 'i'],
      [0x0237, 'j'],
      [0x01c0, 'l'],
      [0x028f, 'y'],
      [0x1d00, 'a'],
      [0x0299, 'b'],
      [0x1d04, 'c'],
      [0x029c, 'h'],
      [0x1d0b, 'k'],
      [0x1d0d, 'm'],
      [0x0274, 'n'],
      [0x1d0f, 'o'],
      [0x1d18, 'p'],
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
 * Variantes tipográficas → su equivalente simple. Guiones y comillas distintos sirven para
 * marcar copias igual que un carácter invisible.
 *
 * Las comillas angulares «» y los signos de apertura ¿¡ son del español y no están aquí.
 * U+2011 (guion sin salto), U+FE58 y U+FF0D se cubren porque NFKC los lleva a U+2010, U+2014 y
 * «-», respectivamente.
 */
export const TYPOGRAPHIC_VARIANTS: ReadonlyMap<string, string> = new Map(
  (
    [
      // Guiones y signo menos.
      [0x2010, '-'],
      [0x2011, '-'],
      [0x2012, '-'],
      [0x2013, '-'],
      [0x2014, '-'],
      [0x2015, '-'],
      [0x2043, '-'],
      [0x2212, '-'],
      [0x02d7, '-'],
      [0xfe58, '-'],
      [0xfe63, '-'],
      // Comillas dobles.
      [0x201c, '"'],
      [0x201d, '"'],
      [0x201e, '"'],
      [0x201f, '"'],
      [0x301d, '"'],
      [0x301e, '"'],
      // Comillas simples, apóstrofos y primas.
      [0x2018, "'"],
      [0x2019, "'"],
      [0x201a, "'"],
      [0x201b, "'"],
      [0x2032, "'"],
      [0x02bc, "'"],
    ] as const
  ).map(([codePoint, simple]) => [String.fromCodePoint(codePoint), simple]),
);
