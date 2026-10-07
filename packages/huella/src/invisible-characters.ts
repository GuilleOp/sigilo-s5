// Detección y eliminación de caracteres invisibles y homoglifos en el texto de la denuncia.
// Son la forma más barata de marcar un documento para saber a quién se le entregó.

/**
 * Categoría de un carácter sospechoso.
 *
 * Seguridad: quien filtra un oficio puede haber recibido una copia "marcada" con caracteres que no
 * se ven (espacios de ancho cero, controles de dirección, etiquetas Unicode) o con letras de otro
 * alfabeto que se ven iguales (la "а" cirílica en lugar de la "a" latina). Cada destinatario
 * recibe una combinación distinta; si la persona denunciante copia y pega ese texto, la marca
 * viaja con la denuncia y la delata.
 */
export type InvisibleCharacterKind =
  | 'zero_width'
  | 'bidi_control'
  | 'soft_hyphen'
  | 'tag'
  | 'variation_selector'
  | 'other_format'
  | 'mixed_script';

/** Un carácter sospechoso. `index` es la posición en unidades UTF-16 del texto original. */
export interface InvisibleCharacter {
  index: number;
  codePoint: number;
  kind: InvisibleCharacterKind;
}

/** Resultado de `findInvisibleCharacters`. `count` siempre es igual a `items.length`. */
export interface InvisibleCharacterReport {
  count: number;
  items: InvisibleCharacter[];
}

const ZERO_WIDTH = new Set([0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);
const BIDI_CONTROL = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069, 0x200e, 0x200f, 0x061c,
]);
const SOFT_HYPHEN = 0x00ad;
const FORMAT_CHARACTER = /^\p{Cf}$/u;
const WORD = /[\p{L}\p{M}]+/gu;
const LATIN = /\p{Script=Latin}/u;
const CONFUSABLE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

// Homoglifos cirílicos y griegos más comunes con su equivalente latino visual.
const HOMOGLYPHS: Readonly<Record<string, string>> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  һ: 'h',
  ԁ: 'd',
  ԛ: 'q',
  ԝ: 'w',
  ӏ: 'l',
  А: 'A',
  В: 'B',
  Е: 'E',
  К: 'K',
  М: 'M',
  Н: 'H',
  О: 'O',
  Р: 'P',
  С: 'C',
  Т: 'T',
  Х: 'X',
  У: 'Y',
  І: 'I',
  Ј: 'J',
  Ѕ: 'S',
  α: 'a',
  ο: 'o',
  ν: 'v',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  ι: 'i',
  κ: 'k',
  Α: 'A',
  Β: 'B',
  Ε: 'E',
  Ζ: 'Z',
  Η: 'H',
  Ι: 'I',
  Κ: 'K',
  Μ: 'M',
  Ν: 'N',
  Ο: 'O',
  Ρ: 'P',
  Τ: 'T',
  Υ: 'Y',
  Χ: 'X',
};

function classifyCodePoint(codePoint: number, character: string): InvisibleCharacterKind | null {
  if (ZERO_WIDTH.has(codePoint)) return 'zero_width';
  if (BIDI_CONTROL.has(codePoint)) return 'bidi_control';
  if (codePoint === SOFT_HYPHEN) return 'soft_hyphen';
  if (codePoint >= 0xe0000 && codePoint <= 0xe007f) return 'tag';
  if (
    (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
    (codePoint >= 0xe0100 && codePoint <= 0xe01ef)
  ) {
    return 'variation_selector';
  }
  if (FORMAT_CHARACTER.test(character)) return 'other_format';
  return null;
}

/** Devuelve la posición de cada letra cirílica o griega dentro de palabras que también usan latín. */
function findMixedScriptLetters(text: string): InvisibleCharacter[] {
  const items: InvisibleCharacter[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (!LATIN.test(word) || !CONFUSABLE_SCRIPT.test(word)) continue;
    let offset = match.index;
    for (const character of word) {
      if (CONFUSABLE_SCRIPT.test(character)) {
        items.push({
          index: offset,
          codePoint: character.codePointAt(0) ?? 0,
          kind: 'mixed_script',
        });
      }
      offset += character.length;
    }
  }
  return items;
}

/**
 * Localiza caracteres invisibles, de formato (categoría Unicode Cf), selectores de variante y
 * letras de otro alfabeto mezcladas con latín dentro de una misma palabra.
 * Los resultados se ordenan por posición.
 */
export function findInvisibleCharacters(text: string): InvisibleCharacterReport {
  const items: InvisibleCharacter[] = [];
  let index = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    const kind = classifyCodePoint(codePoint, character);
    if (kind !== null) items.push({ index, codePoint, kind });
    index += character.length;
  }
  items.push(...findMixedScriptLetters(text));
  items.sort((a, b) => a.index - b.index);
  return { count: items.length, items };
}

function removeFormatCharacters(text: string): string {
  let output = '';
  for (const character of text) {
    if (classifyCodePoint(character.codePointAt(0) ?? 0, character) === null) output += character;
  }
  return output;
}

function replaceHomoglyphs(text: string): string {
  return text.replace(WORD, (word) => {
    if (!LATIN.test(word) || !CONFUSABLE_SCRIPT.test(word)) return word;
    let output = '';
    for (const character of word) output += HOMOGLYPHS[character] ?? character;
    return output;
  });
}

/**
 * Elimina los caracteres que detecta `findInvisibleCharacters`, aplica NFKC y sustituye los
 * homoglifos conocidos por su letra latina dentro de palabras mixtas.
 *
 * Seguridad: los saltos de línea, tabuladores y espacios normales se conservan; NFKC además
 * unifica variantes de ancho completo, ligaduras y otras formas de compatibilidad que también
 * sirven como marca. Una letra cirílica o griega sin equivalente conocido se conserva para no
 * alterar palabras legítimas; `findInvisibleCharacters` la seguirá reportando.
 * Al quitar el unificador de ancho cero (U+200D) algunos emojis compuestos se separan.
 */
export function stripInvisibleCharacters(text: string): string {
  const normalized = removeFormatCharacters(removeFormatCharacters(text).normalize('NFKC'));
  return replaceHomoglyphs(normalized);
}
