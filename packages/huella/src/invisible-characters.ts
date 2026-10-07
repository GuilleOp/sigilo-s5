// Detección y eliminación de caracteres invisibles y homoglifos en el texto de la denuncia.
// Son la forma más barata de marcar un documento para saber a quién se le entregó.

/**
 * Categoría de un carácter sospechoso.
 *
 * Seguridad: quien filtra un oficio puede haber recibido una copia «marcada» con caracteres que no
 * se ven (espacios de ancho cero, controles de dirección, etiquetas Unicode, rellenos en blanco,
 * espacios de otro ancho) o con letras de otro alfabeto que se ven iguales (la «а» cirílica en
 * lugar de la «a» latina). Cada destinatario recibe una combinación distinta; si la persona
 * denunciante copia y pega ese texto, la marca viaja con la denuncia y la delata.
 *
 * - `filler`: letras o símbolos que se dibujan en blanco (rellenos Hangul, Braille vacío).
 * - `default_ignorable`: resto de `\p{Default_Ignorable_Code_Point}` (por ejemplo, U+034F).
 * - `nonstandard_space`: espacio de la categoría Zs distinto de U+0020 (NBSP, espacio fino, etc.).
 * - `combining_mark`: marca combinante (Mn o Me) suelta, sin una letra o número antes.
 */
export type InvisibleCharacterKind =
  | 'zero_width'
  | 'bidi_control'
  | 'soft_hyphen'
  | 'tag'
  | 'variation_selector'
  | 'other_format'
  | 'filler'
  | 'default_ignorable'
  | 'nonstandard_space'
  | 'combining_mark'
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
// Se dibujan como un hueco aunque no son espacios: rellenos Hangul (U+115F, U+1160, U+3164,
// U+FFA0), Braille en blanco (U+2800) y la cabeza de nota nula musical (U+1D159).
const FILLER = new Set([0x115f, 0x1160, 0x3164, 0xffa0, 0x2800, 0x1d159]);
const DEFAULT_IGNORABLE = /^\p{Default_Ignorable_Code_Point}$/u;
const SPACE_SEPARATOR = /^\p{Zs}$/u;
const NORMAL_SPACE = 0x0020;
const COMBINING_MARK = /^[\p{Mn}\p{Me}]$/u;
// Lo que puede llevar un acento combinante: letras, números y otras marcas ya unidas a ellos.
const MARK_BASE = /^[\p{L}\p{N}\p{M}]$/u;
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

/** Clasifica un carácter sin mirar su contexto. Las marcas combinantes se resuelven aparte. */
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
  if (FILLER.has(codePoint)) return 'filler';
  if (DEFAULT_IGNORABLE.test(character)) return 'default_ignorable';
  if (codePoint !== NORMAL_SPACE && SPACE_SEPARATOR.test(character)) return 'nonstandard_space';
  return null;
}

interface ScannedCharacter {
  character: string;
  index: number;
  codePoint: number;
  kind: InvisibleCharacterKind | null;
}

/**
 * Recorre el texto y clasifica cada carácter. Una marca combinante es legítima si sigue a una
 * letra, un número u otra marca legítima (así se escriben los acentos en NFD); los caracteres que
 * se eliminan no cortan esa unión, pero un espacio no estándar sí, porque se vuelve espacio.
 */
function* scanCharacters(text: string): Generator<ScannedCharacter> {
  let afterBase = false;
  let index = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    let kind = classifyCodePoint(codePoint, character);
    if (kind === null && COMBINING_MARK.test(character) && !afterBase) kind = 'combining_mark';
    if (kind === null) afterBase = MARK_BASE.test(character);
    else if (kind === 'nonstandard_space') afterBase = false;
    yield { character, index, codePoint, kind };
    index += character.length;
  }
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
 * Localiza caracteres invisibles, de formato (categoría Unicode Cf), ignorables por defecto,
 * rellenos que se ven en blanco, espacios distintos del normal, marcas combinantes sueltas,
 * selectores de variante y letras de otro alfabeto mezcladas con latín en una misma palabra.
 * Una letra seguida de su acento combinante (NFD) no se reporta. Se ordenan por posición.
 */
export function findInvisibleCharacters(text: string): InvisibleCharacterReport {
  const items: InvisibleCharacter[] = [];
  for (const { index, codePoint, kind } of scanCharacters(text)) {
    if (kind !== null) items.push({ index, codePoint, kind });
  }
  items.push(...findMixedScriptLetters(text));
  items.sort((a, b) => a.index - b.index);
  return { count: items.length, items };
}

function removeInvisibleCharacters(text: string): string {
  let output = '';
  for (const { character, kind } of scanCharacters(text)) {
    if (kind === null) output += character;
    else if (kind === 'nonstandard_space') output += ' ';
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
 * Los espacios no estándar se convierten en espacio normal (U+0020) y las marcas combinantes
 * sueltas se eliminan; los acentos unidos a su letra se conservan y NFKC los compone.
 *
 * Seguridad: los saltos de línea, tabuladores y espacios normales se conservan; NFKC además
 * unifica variantes de ancho completo, ligaduras y otras formas de compatibilidad que también
 * sirven como marca. Una letra cirílica o griega sin equivalente conocido se conserva para no
 * alterar palabras legítimas; `findInvisibleCharacters` la seguirá reportando.
 * Al quitar el unificador de ancho cero (U+200D) algunos emojis compuestos se separan, y los
 * emojis de teclado («#» + U+20E3) pierden su marco.
 */
export function stripInvisibleCharacters(text: string): string {
  // Segunda pasada: NFKC puede producir marcas sueltas (por ejemplo, «´» pasa a espacio + U+0301).
  const normalized = removeInvisibleCharacters(removeInvisibleCharacters(text).normalize('NFKC'));
  return replaceHomoglyphs(normalized);
}
