// Detección y eliminación de caracteres invisibles, controles, homoglifos y variantes tipográficas
// en el texto de la denuncia. Son la forma más barata de marcar un documento para saber a quién
// se le entregó («trampa del canario»).

import {
  CONFUSABLES,
  isMarkingCompatibilityForm,
  PUNCTUATION_CONFUSABLES,
  TYPOGRAPHIC_VARIANTS,
} from './confusables.ts';

/**
 * Categoría de un carácter sospechoso.
 *
 * Seguridad: quien filtra un oficio puede haber recibido una copia «marcada» con caracteres que no
 * se ven (espacios de ancho cero, controles de dirección, etiquetas Unicode, rellenos en blanco,
 * espacios de otro ancho, controles C0/C1), con letras de otro alfabeto que se ven iguales (la «а»
 * cirílica en lugar de la «a» latina) o con detalles visibles pero sutiles (dobles espacios,
 * guiones o comillas distintos). Cada destinatario recibe una combinación distinta; si la persona
 * denunciante copia y pega ese texto, la marca viaja con la denuncia y la delata.
 *
 * - `filler`: letras o símbolos que se dibujan en blanco (rellenos Hangul, Braille vacío).
 * - `default_ignorable`: resto de `\p{Default_Ignorable_Code_Point}` (por ejemplo, U+034F).
 * - `nonstandard_space`: espacio de la categoría Zs distinto de U+0020 (NBSP, espacio fino, etc.).
 * - `control`: control C0 o C1 (categoría Cc) distinto del salto de línea y el tabulador. El
 *   retorno de carro (U+000D) también cuenta: la limpieza lo convierte en salto de línea.
 * - `private_use`: carácter de uso privado (Co).
 * - `unassigned`: punto de código sin asignar (Cn), incluidos los no caracteres, o sustituto
 *   UTF-16 suelto (Cs).
 * - `line_separator`: separador de línea o de párrafo (U+2028, U+2029); se vuelve salto de línea.
 * - `combining_mark`: marca combinante (Mn o Me) suelta, sin una letra o número antes.
 * - `uncomposed_mark`: marca combinante después de una letra o número con la que no se compone en
 *   NFC (por ejemplo, «q» + U+0307). No se reportan los acentos del español, que sí se componen,
 *   ni una marca de `LEGITIMATE_MARKS` sobre una vocal latina (la «a̱» del otomí y el mazahua);
 *   una segunda marca de `LEGITIMATE_MARKS` sin componer sobre la misma base («a̰̲») sí.
 * - `compatibility_form`: forma de compatibilidad de `MARKING_COMPATIBILITY_RANGES` (ancho
 *   completo, letras matemáticas, formas encerradas, ligaduras). La limpieza aplica NFKC solo a
 *   ellas.
 * - `confusable`: homoglifo del mapa `CONFUSABLES` (UTS #39) en cualquier palabra (la limpieza
 *   solo lo convierte en contexto latino, ver `decideConfusables`), carácter que NFC sustituye por otro idéntico (por ejemplo, el punto y
 *   coma griego U+037E) o carácter sospechoso por su contexto (`findContextualLookalikes`):
 *   dígitos no ASCII, «〇», «º»/«ª» entre letras, superíndice dentro de una cifra, «ː», letras
 *   modificadoras en una palabra latina y el saltillo en un texto sin rasgos de ortografía
 *   indígena. Los tres últimos se avisan, pero la limpieza no los cambia (salvo «ː» como «:»).
 * - `mixed_script`: letra de un sistema de escritura distinto del latino (ni `Common` ni
 *   `Inherited`), sin equivalente en los mapas, dentro de una palabra mayoritariamente latina o
 *   en una palabra suelta entre palabras latinas. La limpieza no la cambia.
 * - `typographic_variant`: puntuación de `PUNCTUATION_CONFUSABLES` (siempre) o, si la
 *   normalización tipográfica está activa, guion o comilla de `TYPOGRAPHIC_VARIANTS`, espacio o
 *   tabulador repetido, espacio al final de la línea o más de dos saltos de línea seguidos.
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
  | 'control'
  | 'private_use'
  | 'unassigned'
  | 'line_separator'
  | 'combining_mark'
  | 'uncomposed_mark'
  | 'compatibility_form'
  | 'confusable'
  | 'mixed_script'
  | 'typographic_variant';

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

/** Opciones compartidas por `findInvisibleCharacters` y `stripInvisibleCharacters`. */
export interface InvisibleCharacterOptions {
  /**
   * Normalizar la tipografía de teclado: colapsar espacios y tabuladores repetidos y los saltos
   * de línea de más de dos, quitar espacios y tabuladores al final de la línea, y llevar los guiones y comillas de `TYPOGRAPHIC_VARIANTS` a
   * `-`, `"` y `'`. Por defecto, `true`. Con `false`, `findInvisibleCharacters` tampoco reporta
   * esas variantes; la puntuación de `PUNCTUATION_CONFUSABLES` se reporta y normaliza siempre.
   */
  shouldNormalizeTypography?: boolean;
  /**
   * Solo para `stripInvisibleCharacters`: eliminar también las marcas combinantes que no se
   * componen con su letra (`uncomposed_mark`). Por defecto, `false`, porque pueden ser parte de la
   * ortografía de una lengua indígena; pensado para la limpieza manual «Eliminar todo», que la
   * persona pide después de ver el aviso. Las marcas sobre números se eliminan siempre.
   */
  shouldRemoveUncomposedMarks?: boolean;
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
const CONTROL = /^\p{Cc}$/u;
const PRIVATE_USE = /^\p{Co}$/u;
// Seguridad: «sin asignar» depende de la versión de Unicode del navegador; un carácter más nuevo
// que el motor se elimina. Es preferible a dejar pasar un canal que no se puede interpretar.
const UNASSIGNED = /^[\p{Cn}\p{Cs}]$/u;
const LINE_SEPARATOR = /^[\p{Zl}\p{Zp}]$/u;
const NORMAL_SPACE = 0x0020;
const LINE_FEED = 0x000a;
const TAB = 0x0009;
const CARRIAGE_RETURN = 0x000d;
const COMBINING_MARK = /^[\p{Mn}\p{Me}]$/u;
// Lo que puede llevar un acento combinante: letras, números y otras marcas ya unidas a ellos.
const MARK_BASE = /^[\p{L}\p{N}\p{M}]$/u;
const LETTER = /^\p{L}$/u;
const WORD = /[\p{L}\p{M}]+/gu;
const LATIN_SCRIPT = /^\p{Script=Latin}$/u;
const NEUTRAL_SCRIPT = /^[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]$/u;

/**
 * Marcas combinantes que forman parte de ortografías de lenguas indígenas de México y se
 * conservan sobre una vocal latina aunque no tengan forma compuesta en NFC: grave, agudo,
 * circunflejo, tilde, macrón, diéresis, punto inferior, tilde inferior, macrón inferior (vocales
 * subrayadas del otomí y el mazahua, «a̱») y subrayado.
 */
export const LEGITIMATE_MARKS: ReadonlySet<number> = new Set([
  0x0300, 0x0301, 0x0302, 0x0303, 0x0304, 0x0308, 0x0323, 0x0330, 0x0331, 0x0332,
]);
// Vocales latinas, incluidas las de ortografías indígenas («ɨ» del wixárika, «ʉ», «ɛ», «ɔ»).
const LATIN_VOWEL = /^[aeiouAEIOUɨƗʉɄɛƐɔƆəƏʌɅæÆøØ]$/u;

/** Clasifica un carácter sin mirar su contexto. Las marcas combinantes se resuelven aparte. */
function classifyCodePoint(codePoint: number, character: string): InvisibleCharacterKind | null {
  if (codePoint === LINE_FEED || codePoint === TAB) return null;
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
  if (CONTROL.test(character)) return 'control';
  if (LINE_SEPARATOR.test(character)) return 'line_separator';
  if (PRIVATE_USE.test(character)) return 'private_use';
  if (UNASSIGNED.test(character)) return 'unassigned';
  if (codePoint !== NORMAL_SPACE && SPACE_SEPARATOR.test(character)) return 'nonstandard_space';
  return null;
}

interface ScannedCharacter {
  character: string;
  index: number;
  codePoint: number;
  kind: InvisibleCharacterKind | null;
  /** Para una marca combinante: si su base es una letra (y no un número). */
  isAfterLetter: boolean;
}

/** Marca de `LEGITIMATE_MARKS` sobre una vocal latina que todavía no la lleva. */
function isLegitimateMark(codePoint: number, base: string, cluster: string): boolean {
  return (
    LEGITIMATE_MARKS.has(codePoint) &&
    LATIN_VOWEL.test(base) &&
    !cluster.normalize('NFD').includes(String.fromCodePoint(codePoint))
  );
}

/**
 * Recorre el texto y clasifica cada carácter. Una marca combinante es legítima si sigue a una
 * letra, un número u otra marca legítima y se compone con ellos en NFC (así se escriben los
 * acentos en NFD), o si es de `LEGITIMATE_MARKS` y su base es una vocal latina. Los caracteres que
 * se eliminan no cortan esa unión; un espacio no estándar, un control o un separador de línea sí,
 * porque se vuelven espacio o salto de línea.
 */
function* scanCharacters(text: string): Generator<ScannedCharacter> {
  // Letra base más las marcas que ya se compusieron con ella, en NFC; `null` si no hay base.
  let cluster: string | null = null;
  // Marcas de `LEGITIMATE_MARKS` aceptadas sobre la base sin forma compuesta.
  let legitimateMarks = 0;
  let index = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    let kind = classifyCodePoint(codePoint, character);
    let isAfterLetter = false;
    if (kind === null && COMBINING_MARK.test(character)) {
      if (cluster === null) {
        kind = 'combining_mark';
      } else {
        const base = [...cluster.normalize('NFD')][0] ?? '';
        isAfterLetter = LETTER.test(base);
        const composed: string = (cluster + character).normalize('NFC');
        const isComposed = [...composed].length === [...cluster].length;
        // Seguridad: una sola marca legítima sin componer es ortografía («a̱»); apilar otra
        // distinta sobre la misma base («a̰̲») ya no lo es y puede ser una marca de canario.
        if (isComposed) {
          cluster = composed;
        } else if (isLegitimateMark(codePoint, base, cluster) && legitimateMarks === 0) {
          cluster = composed;
          legitimateMarks += 1;
        } else {
          kind = 'uncomposed_mark';
        }
      }
    } else if (kind === null && isMarkingCompatibilityForm(character)) {
      kind = 'compatibility_form';
      const compatible = character.normalize('NFKC');
      cluster = MARK_BASE.test(compatible) ? compatible : null;
      legitimateMarks = 0;
    } else if (kind === null) {
      cluster = MARK_BASE.test(character) ? character.normalize('NFC') : null;
      legitimateMarks = 0;
    } else if (kind === 'nonstandard_space' || kind === 'line_separator' || kind === 'control') {
      cluster = null;
      legitimateMarks = 0;
    }
    yield { character, index, codePoint, kind, isAfterLetter };
    index += character.length;
  }
}

/** Busca el reemplazo por el carácter o por su forma NFC, que es la que llega a los mapas. */
function lookup(map: ReadonlyMap<string, string>, character: string): string | undefined {
  return map.get(character) ?? map.get(character.normalize('NFC'));
}

/** Clasifica homoglifos, puntuación parecida y variantes de teclado. */
function classifyLookalike(
  character: string,
  shouldNormalizeTypography: boolean,
): InvisibleCharacterKind | null {
  if (lookup(CONFUSABLES, character) !== undefined) return 'confusable';
  if (lookup(PUNCTUATION_CONFUSABLES, character) !== undefined) return 'typographic_variant';
  if (lookup(TYPOGRAPHIC_VARIANTS, character) !== undefined) {
    return shouldNormalizeTypography ? 'typographic_variant' : null;
  }
  // Equivalentes canónicos de un solo carácter (U+037E «;», U+212A «K»): NFC los sustituye.
  if (!COMBINING_MARK.test(character) && character.normalize('NFC') !== character) {
    return 'confusable';
  }
  return null;
}

interface PositionedCharacter {
  character: string;
  index: number;
}

interface WordToken {
  start: number;
  end: number;
  isLatin: boolean;
  characters: PositionedCharacter[];
}

/** Separa el texto en palabras y marca las que tienen al menos tantas letras latinas como de otros sistemas. */
function scanWords(text: string): WordToken[] {
  const tokens: WordToken[] = [];
  for (const match of text.matchAll(WORD)) {
    let latin = 0;
    let nonLatin = 0;
    const characters: PositionedCharacter[] = [];
    let offset = match.index;
    for (const character of match[0]) {
      if (LETTER.test(character)) {
        if (LATIN_SCRIPT.test(character)) latin += 1;
        else if (!NEUTRAL_SCRIPT.test(character)) nonLatin += 1;
      }
      characters.push({ character, index: offset });
      offset += character.length;
    }
    tokens.push({
      start: match.index,
      end: offset,
      isLatin: latin > 0 && latin >= nonLatin,
      characters,
    });
  }
  return tokens;
}

/** Palabra suelta cuyas vecinas (la anterior y la siguiente que existan) son latinas. */
function isBetweenLatinWords(tokens: readonly WordToken[], position: number): boolean {
  const previous = tokens[position - 1];
  const next = tokens[position + 1];
  return (
    (previous !== undefined || next !== undefined) &&
    (previous?.isLatin ?? true) &&
    (next?.isLatin ?? true)
  );
}

/** Letra de otro sistema de escritura (ni latina, ni `Common`, ni `Inherited`). */
function isForeignLetter(character: string): boolean {
  return LETTER.test(character) && !NEUTRAL_SCRIPT.test(character);
}

/**
 * Letras de otro sistema de escritura sin equivalente en los mapas, en un contexto latino: dentro
 * de una palabra con al menos tantas letras latinas como de otros sistemas, o en una palabra
 * suelta cuyas vecinas (la anterior y la siguiente que existan) son latinas. Una frase entera en
 * otro alfabeto no se reporta. `reported` son las posiciones que ya tienen otro hallazgo.
 */
function findMixedScriptLetters(
  tokens: readonly WordToken[],
  reported: ReadonlySet<number>,
): InvisibleCharacter[] {
  const items: InvisibleCharacter[] = [];
  tokens.forEach((token, position) => {
    if (!token.isLatin && !isBetweenLatinWords(tokens, position)) return;
    for (const { character, index } of token.characters) {
      if (!isForeignLetter(character) || reported.has(index)) continue;
      items.push({ index, codePoint: character.codePointAt(0) ?? 0, kind: 'mixed_script' });
    }
  });
  return items;
}

// Sistemas con homoglifos en `CONFUSABLES`, para saber si el texto usa uno de verdad.
const CONFUSABLE_SCRIPTS: readonly RegExp[] = [
  /^\p{Script=Cyrillic}$/u,
  /^\p{Script=Greek}$/u,
  /^\p{Script=Armenian}$/u,
  /^\p{Script=Cherokee}$/u,
  /^\p{Script=Lisu}$/u,
  /^\p{Script=Canadian_Aboriginal}$/u,
  /^\p{Script=Coptic}$/u,
  /^\p{Script=Tifinagh}$/u,
];
const GREEK_SCRIPT = /^\p{Script=Greek}$/u;
// Signos junto a los que una letra griega es un símbolo de fórmula («α = 0.05», «2π»).
const FORMULA_SIGN = /[\p{Sm}\p{N}^*/]/u;

function scriptOf(character: string): RegExp | undefined {
  return CONFUSABLE_SCRIPTS.find((script) => script.test(character));
}

/** Sistemas de `CONFUSABLE_SCRIPTS` con alguna letra en el texto que no es homoglifo. */
function findGenuineScripts(tokens: readonly WordToken[]): Set<RegExp> {
  const scripts = new Set<RegExp>();
  for (const token of tokens) {
    for (const { character } of token.characters) {
      if (!isForeignLetter(character) || lookup(CONFUSABLES, character) !== undefined) continue;
      const script = scriptOf(character);
      if (script !== undefined) scripts.add(script);
    }
  }
  return scripts;
}

/** Una letra griega pegada (salvo espacios) a un signo matemático o a un número. */
function isFormulaToken(text: string, token: WordToken): boolean {
  const before = text.slice(0, token.start).trimEnd().at(-1) ?? '';
  const after = text.slice(token.end).trimStart().at(0) ?? '';
  return FORMULA_SIGN.test(before) || FORMULA_SIGN.test(after);
}

/**
 * Decide, para cada homoglifo de `CONFUSABLES`, si la limpieza automática lo convierte (`true`) o
 * lo conserva (`false`). Se convierte dentro de una palabra mayoritariamente latina, o en una
 * palabra suelta entre palabras latinas salvo que su sistema de escritura aparezca en el texto con
 * letras que no son homoglifos («coeficiente α y β») o que sea griega y esté en una fórmula
 * («sea α = 0.05»).
 *
 * Seguridad: una palabra entera en otro alfabeto («ООО Ромашка», «Москва») se conserva, porque
 * transliterarla a medias la deforma; `findInvisibleCharacters` sigue reportando sus homoglifos
 * como `confusable` para que la persona decida. Un canario que se esconda así sigue avisado.
 */
function decideConfusables(text: string, tokens: readonly WordToken[]): Map<number, boolean> {
  const decisions = new Map<number, boolean>();
  const genuineScripts = findGenuineScripts(tokens);
  tokens.forEach((token, position) => {
    const confusables = token.characters.filter(
      ({ character }) => lookup(CONFUSABLES, character) !== undefined,
    );
    if (confusables.length === 0) return;
    let shouldConvert = token.isLatin;
    if (!shouldConvert && isBetweenLatinWords(tokens, position)) {
      shouldConvert = confusables.every(({ character }) => {
        const script = scriptOf(character);
        if (script !== undefined && genuineScripts.has(script)) return false;
        return !(GREEK_SCRIPT.test(character) && isFormulaToken(text, token));
      });
    }
    for (const { index } of confusables) decisions.set(index, shouldConvert);
  });
  return decisions;
}

function replaceConfusables(text: string): string {
  const decisions = decideConfusables(text, scanWords(text));
  let output = '';
  let index = 0;
  for (const character of text) {
    const latin = decisions.get(index) === true ? CONFUSABLES.get(character) : undefined;
    output += latin ?? character;
    index += character.length;
  }
  return output;
}

// Seguridad: tonos y saltillo de las ortografías de México; no se avisan como letra modificadora.
const PROTECTED_MODIFIERS: ReadonlySet<number> = new Set([0x02bc, 0x02c9, 0x02ca, 0x02cb]);
const MODIFIER_LETTER = /^\p{Lm}$/u;
const DECIMAL_DIGIT = /^\p{Nd}$/u;
const ASCII_DIGIT = /^[0-9]$/u;
const LETTER_OR_MARK = /^[\p{L}\p{M}]$/u;
const SALTILLOS: ReadonlySet<number> = new Set([0x02bc, 0xa78c, 0xa78b]);
const TRIANGULAR_COLON = 0x02d0;
const IDEOGRAPHIC_ZERO = 0x3007;
const SUPERSCRIPT_DIGITS: ReadonlyMap<string, string> = new Map([
  ['⁰', '0'],
  ['¹', '1'],
  ['²', '2'],
  ['³', '3'],
  ['⁴', '4'],
  ['⁵', '5'],
  ['⁶', '6'],
  ['⁷', '7'],
  ['⁸', '8'],
  ['⁹', '9'],
]);
const ORDINAL_LETTERS: ReadonlyMap<string, string> = new Map([
  ['º', 'o'],
  ['ª', 'a'],
]);
// Letras propias de ortografías indígenas (no del español).
const INDIGENOUS_LETTER = /[ɨƗʉɄɛƐɔƆəƏʌɅŋŊʔɁɂɇɆ]/u;
// Tono en superíndice después de una letra («ni³», no «m²») o tonos modificadores («jnɨˊ»).
const TONE = /[^\P{L}mM][¹²³⁴⁵]|[ˉˊˋ]/u;

function isModifierInRange(codePoint: number): boolean {
  return (
    (codePoint >= 0x02b0 && codePoint <= 0x02ff) || (codePoint >= 0x1d2c && codePoint <= 0x1d6a)
  );
}

/** Valor de un dígito `\p{Nd}`: Unicode los asigna en rachas contiguas de diez, del 0 al 9. */
function digitValue(codePoint: number): string {
  let zero = codePoint;
  while (DECIMAL_DIGIT.test(String.fromCodePoint(zero - 1))) zero -= 1;
  return String((codePoint - zero) % 10);
}

/**
 * Heurística de ortografía indígena: el texto tiene una letra de `INDIGENOUS_LETTER`, un tono
 * (`TONE`) o una vocal con una marca de `LEGITIMATE_MARKS` que el español no usa (todo salvo el
 * agudo sobre vocal, la tilde sobre «n» y la diéresis sobre «u»). El saltillo no cuenta.
 */
function hasIndigenousFeatures(text: string): boolean {
  if (INDIGENOUS_LETTER.test(text) || TONE.test(text)) return true;
  let base = '';
  for (const character of text.normalize('NFD')) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (!COMBINING_MARK.test(character)) {
      base = character;
      continue;
    }
    if (!LEGITIMATE_MARKS.has(codePoint) || !LATIN_VOWEL.test(base)) continue;
    const isSpanish =
      codePoint === 0x0301 || (codePoint === 0x0308 && (base === 'u' || base === 'U'));
    if (!isSpanish) return true;
  }
  return false;
}

/** Hay una letra latina (que no sea modificadora) en la palabra alrededor de `position`. */
function isInLatinWord(characters: readonly PositionedCharacter[], position: number): boolean {
  for (const step of [-1, 1]) {
    for (let at = position + step; at >= 0 && at < characters.length; at += step) {
      const { character } = characters[at] ?? { character: '' };
      if (!LETTER_OR_MARK.test(character)) break;
      if (LATIN_SCRIPT.test(character) && !MODIFIER_LETTER.test(character)) return true;
    }
  }
  return false;
}

interface ContextualLookalike {
  index: number;
  codePoint: number;
  /** Reemplazo inequívoco; `null` si solo se avisa. */
  replacement: string | null;
}

/**
 * Caracteres que solo son sospechosos por su contexto; se reportan como `confusable`:
 *
 * - Dígitos `\p{Nd}` que no son ASCII («०», «০», «๐») y el cero ideográfico «〇»: pasan al
 *   dígito ASCII.
 * - «º» y «ª» entre dos letras («cºntrato»): pasan a «o» y «a». El ordinal «3º» no cambia.
 * - Un superíndice seguido de un dígito («¹05»): pasa al dígito. Los tonos («ni³») no cambian.
 * - «ː» (U+02D0): se avisa siempre; pasa a «:» si no sigue a una letra («10ː30»), porque tras una
 *   vocal puede marcar vocal larga.
 * - Letras modificadoras (U+02B0-U+02FF, U+1D2C-U+1D6A, como «ᵃ» o «ˢ») dentro de una palabra
 *   con letras latinas, salvo los tonos «ˉ», «ˊ», «ˋ» y el saltillo: se avisan y no cambian.
 * - El saltillo «ʼ», «ꞌ» o «Ꞌ» si el resto del texto no tiene rasgos de ortografía indígena
 *   (`hasIndigenousFeatures`): se avisa y no cambia, porque puede ser legítimo igualmente.
 *
 * `skip` son las posiciones que ya tienen otro hallazgo.
 */
function findContextualLookalikes(text: string, skip: ReadonlySet<number>): ContextualLookalike[] {
  const characters: PositionedCharacter[] = [];
  let offset = 0;
  for (const character of text) {
    characters.push({ character, index: offset });
    offset += character.length;
  }
  let isIndigenous: boolean | undefined;
  const items: ContextualLookalike[] = [];
  characters.forEach(({ character, index }, position) => {
    if (skip.has(index)) return;
    const codePoint = character.codePointAt(0) ?? 0;
    const previous = characters[position - 1]?.character ?? '';
    const next = characters[position + 1]?.character ?? '';
    let replacement: string | null | undefined;
    if (DECIMAL_DIGIT.test(character) && !ASCII_DIGIT.test(character)) {
      replacement = digitValue(codePoint);
    } else if (codePoint === IDEOGRAPHIC_ZERO) {
      replacement = '0';
    } else if (ORDINAL_LETTERS.has(character)) {
      if (LETTER.test(previous) && LETTER.test(next)) replacement = ORDINAL_LETTERS.get(character);
    } else if (SUPERSCRIPT_DIGITS.has(character)) {
      if (DECIMAL_DIGIT.test(next)) replacement = SUPERSCRIPT_DIGITS.get(character);
    } else if (codePoint === TRIANGULAR_COLON) {
      replacement = LETTER_OR_MARK.test(previous) ? null : ':';
    } else if (SALTILLOS.has(codePoint)) {
      isIndigenous ??= hasIndigenousFeatures(text);
      if (!isIndigenous) replacement = null;
    } else if (
      MODIFIER_LETTER.test(character) &&
      isModifierInRange(codePoint) &&
      !PROTECTED_MODIFIERS.has(codePoint) &&
      isInLatinWord(characters, position)
    ) {
      replacement = null;
    }
    if (replacement !== undefined) items.push({ index, codePoint, replacement });
  });
  return items;
}

function replaceContextualLookalikes(text: string): string {
  let output = text;
  // De atrás hacia adelante para que los índices sigan valiendo.
  for (const { index, codePoint, replacement } of findContextualLookalikes(
    text,
    new Set(),
  ).reverse()) {
    if (replacement === null) continue;
    const length = String.fromCodePoint(codePoint).length;
    output = output.slice(0, index) + replacement + output.slice(index + length);
  }
  return output;
}

/**
 * Espacios y tabuladores repetidos, espacios o tabuladores al final de la línea y saltos de línea
 * después del segundo seguido (las líneas con solo espacios no cortan la racha), tal como se ven
 * en el original. Un carácter eliminado entre dos espacios corta la racha: se reporta él y no el
 * espacio, para no contar dos veces la misma marca.
 */
function findSpacingVariants(scanned: readonly ScannedCharacter[]): InvisibleCharacter[] {
  const items: InvisibleCharacter[] = [];
  let trailing: InvisibleCharacter[] = [];
  let isAfterSpace = false;
  let isAfterTab = false;
  let lineBreaks = 0;
  let isAfterCarriageReturn = false;
  for (const { index, codePoint, kind } of scanned) {
    if (codePoint === LINE_FEED || codePoint === CARRIAGE_RETURN || kind === 'line_separator') {
      // «\r\n» es un solo salto.
      if (!(codePoint === LINE_FEED && isAfterCarriageReturn)) lineBreaks += 1;
      if (codePoint === LINE_FEED && kind === null && lineBreaks > 2) {
        items.push({ index, codePoint, kind: 'typographic_variant' });
      }
      isAfterCarriageReturn = codePoint === CARRIAGE_RETURN;
      items.push(...trailing);
      trailing = [];
      isAfterSpace = false;
      isAfterTab = false;
      continue;
    }
    isAfterCarriageReturn = false;
    const isPlainBlank = (codePoint === NORMAL_SPACE || codePoint === TAB) && kind === null;
    const isSpace = (codePoint === NORMAL_SPACE && kind === null) || kind === 'nonstandard_space';
    const isTab = codePoint === TAB && kind === null;
    if ((codePoint === NORMAL_SPACE && kind === null && isAfterSpace) || (isTab && isAfterTab)) {
      items.push({ index, codePoint, kind: 'typographic_variant' });
    } else if (isPlainBlank) {
      trailing.push({ index, codePoint, kind: 'typographic_variant' });
    } else if (!isSpace) {
      trailing = [];
    }
    if (!isPlainBlank && !isSpace) lineBreaks = 0;
    isAfterSpace = isSpace;
    isAfterTab = isTab;
  }
  items.push(...trailing);
  return items;
}

/**
 * Localiza caracteres invisibles, de formato (Cf), controles (Cc) salvo `\n` y `\t`, de uso
 * privado (Co), sin asignar (Cn), separadores de línea y párrafo, ignorables por defecto,
 * rellenos que se ven en blanco, espacios distintos del normal, marcas combinantes sueltas o que
 * no se componen, selectores de variante, formas de compatibilidad usadas como marca, homoglifos
 * de `CONFUSABLES`, letras de otro alfabeto en contexto latino, puntuación de otros sistemas y, si
 * la normalización tipográfica está activa (por defecto), guiones, comillas y espacios sobrantes.
 *
 * No se reportan las letras del español con su acento (en NFC o NFD), «¿», «¡», «« »», los
 * ordinales «3º» y «1ª», superíndices fuera de una cifra, fracciones, los tonos «ˉ», «ˊ», «ˋ», el
 * saltillo (U+02BC, U+A78C) en un texto con rasgos de ortografía indígena ni las vocales con una
 * marca de `LEGITIMATE_MARKS`. Los hallazgos se ordenan por posición.
 */
export function findInvisibleCharacters(
  text: string,
  options: InvisibleCharacterOptions = {},
): InvisibleCharacterReport {
  const shouldNormalizeTypography = options.shouldNormalizeTypography ?? true;
  const scanned = [...scanCharacters(text)];
  const tokens = scanWords(text);
  const items: InvisibleCharacter[] = [];
  const reported = new Set<number>();
  for (const { character, index, codePoint, kind } of scanned) {
    const found = kind ?? classifyLookalike(character, shouldNormalizeTypography);
    if (found === null) continue;
    items.push({ index, codePoint, kind: found });
    reported.add(index);
  }
  for (const { index, codePoint } of findContextualLookalikes(text, reported)) {
    items.push({ index, codePoint, kind: 'confusable' });
    reported.add(index);
  }
  items.push(...findMixedScriptLetters(tokens, reported));
  if (shouldNormalizeTypography) items.push(...findSpacingVariants(scanned));
  items.sort((a, b) => a.index - b.index);
  return { count: items.length, items };
}

function removeInvisibleCharacters(text: string, shouldRemoveUncomposedMarks: boolean): string {
  let output = '';
  for (const { character, kind, isAfterLetter } of scanCharacters(text)) {
    if (kind === null) output += character;
    else if (kind === 'nonstandard_space') output += ' ';
    else if (kind === 'line_separator') output += '\n';
    else if (kind === 'compatibility_form') output += character.normalize('NFKC');
    else if (kind === 'uncomposed_mark' && isAfterLetter && !shouldRemoveUncomposedMarks) {
      output += character;
    }
  }
  return output;
}

function replaceFromMap(text: string, map: ReadonlyMap<string, string>): string {
  let output = '';
  for (const character of text) output += map.get(character) ?? character;
  return output;
}

function normalizeTypography(text: string): string {
  return replaceFromMap(text, TYPOGRAPHIC_VARIANTS)
    .replace(/[ \t]+$/gmu, '')
    .replace(/ {2,}/gu, ' ')
    .replace(/\t{2,}/gu, '\t')
    .replace(/\n{3,}/gu, '\n\n');
}

/**
 * Elimina o corrige lo que detecta `findInvisibleCharacters` y deja el resultado en NFC.
 *
 * - Los retornos de carro (`\r\n` o `\r`) y los separadores U+2028/U+2029 pasan a `\n`.
 * - Los espacios no estándar se convierten en espacio normal (U+0020).
 * - Las formas de compatibilidad de `MARKING_COMPATIBILITY_RANGES` pasan a su forma NFKC; el resto
 *   del texto solo se normaliza con NFC, así que «3º», «1ª», «m²», «ni³» y «½» no cambian.
 * - Los homoglifos de `CONFUSABLES` se sustituyen dentro de palabras mayoritariamente latinas y en
 *   palabras sueltas entre palabras latinas (`decideConfusables`); las palabras enteras en otro
 *   alfabeto se conservan. La puntuación de `PUNCTUATION_CONFUSABLES` se sustituye en todo el
 *   texto.
 * - Los dígitos no ASCII, «〇», «º»/«ª» entre letras, los superíndices dentro de una cifra y «ː»
 *   que no sigue a una letra pasan a su equivalente (`findContextualLookalikes`).
 * - Las marcas combinantes sueltas, o sin componer sobre un número, se eliminan. Las que no se
 *   componen con su letra se conservan salvo con `shouldRemoveUncomposedMarks`; las de
 *   `LEGITIMATE_MARKS` sobre una vocal latina y los acentos del español se conservan siempre.
 * - Por defecto, normaliza la tipografía de teclado (`shouldNormalizeTypography`).
 *
 * Seguridad: los saltos de línea, tabuladores, espacios normales, el saltillo (U+02BC, U+A78C),
 * los tonos «ˉ», «ˊ», «ˋ», las letras modificadoras y los superíndices tonales se conservan. Una letra de otro alfabeto sin equivalente conocido se
 * conserva para no alterar palabras legítimas; `findInvisibleCharacters` la seguirá reportando
 * como `mixed_script`, igual que las marcas sin componer que se conservan (`uncomposed_mark`).
 * Costos conocidos: al quitar U+200D algunos emojis compuestos se separan; los emojis de teclado
 * («#» + U+20E3) pierden su marco; una letra rusa o griega suelta entre palabras latinas se
 * translitera si el texto no usa ese alfabeto en otra parte; los dígitos de otros sistemas pasan a
 * ASCII; el ideograma «一» y la marca «ー» se vuelven `-` también en textos chinos o japoneses.
 */
export function stripInvisibleCharacters(
  text: string,
  options: InvisibleCharacterOptions = {},
): string {
  const shouldNormalizeTypography = options.shouldNormalizeTypography ?? true;
  const shouldRemoveUncomposedMarks = options.shouldRemoveUncomposedMarks ?? false;
  const unixLines = text.replace(/\r\n?/gu, '\n');
  // Segunda pasada: NFKC puede producir marcas sueltas (por ejemplo, «￣» pasa a espacio + U+0304)
  // y la primera pudo quitar una marca que bloqueaba la composición de otra.
  const firstPass = removeInvisibleCharacters(unixLines, shouldRemoveUncomposedMarks);
  // NFC antes de los mapas: lleva los equivalentes canónicos (U+0374, U+1FEF) a la clave del mapa.
  const cleaned = removeInvisibleCharacters(firstPass, shouldRemoveUncomposedMarks).normalize(
    'NFC',
  );
  const replaced = replaceContextualLookalikes(
    replaceFromMap(replaceConfusables(cleaned), PUNCTUATION_CONFUSABLES),
  );
  return (shouldNormalizeTypography ? normalizeTypography(replaced) : replaced).normalize('NFC');
}
