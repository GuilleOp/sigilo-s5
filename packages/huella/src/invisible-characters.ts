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
 *   ni las marcas de `LEGITIMATE_MARKS` sobre una vocal latina (la «a̱» del otomí y el mazahua).
 * - `compatibility_form`: forma de compatibilidad de `MARKING_COMPATIBILITY_RANGES` (ancho
 *   completo, letras matemáticas, formas encerradas, ligaduras). La limpieza aplica NFKC solo a
 *   ellas.
 * - `confusable`: homoglifo del mapa `CONFUSABLES` (UTS #39), en cualquier palabra, o carácter
 *   que NFC sustituye por otro idéntico (por ejemplo, el punto y coma griego U+037E).
 * - `mixed_script`: letra de un sistema de escritura distinto del latino (ni `Common` ni
 *   `Inherited`), sin equivalente en los mapas, dentro de una palabra mayoritariamente latina o
 *   en una palabra suelta entre palabras latinas. La limpieza no la cambia.
 * - `typographic_variant`: puntuación de `PUNCTUATION_CONFUSABLES` (siempre) o, si la
 *   normalización tipográfica está activa, guion o comilla de `TYPOGRAPHIC_VARIANTS`, espacio
 *   repetido o espacio al final de la línea.
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
   * Normalizar la tipografía de teclado: colapsar espacios repetidos, quitar espacios y
   * tabuladores al final de la línea, y llevar los guiones y comillas de `TYPOGRAPHIC_VARIANTS` a
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
        if (isComposed || isLegitimateMark(codePoint, base, cluster)) cluster = composed;
        else kind = 'uncomposed_mark';
      }
    } else if (kind === null && isMarkingCompatibilityForm(character)) {
      kind = 'compatibility_form';
      const compatible = character.normalize('NFKC');
      cluster = MARK_BASE.test(compatible) ? compatible : null;
    } else if (kind === null) {
      cluster = MARK_BASE.test(character) ? character.normalize('NFC') : null;
    } else if (kind === 'nonstandard_space' || kind === 'line_separator' || kind === 'control') {
      cluster = null;
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

interface WordToken {
  isLatin: boolean;
  foreign: InvisibleCharacter[];
}

/**
 * Letras de otro sistema de escritura sin equivalente en los mapas, en un contexto latino: dentro
 * de una palabra con al menos tantas letras latinas como de otros sistemas, o en una palabra
 * suelta cuyas vecinas (la anterior y la siguiente que existan) son latinas. Una frase entera en
 * otro alfabeto no se reporta. `reported` son las posiciones que ya tienen otro hallazgo.
 */
function findMixedScriptLetters(text: string, reported: ReadonlySet<number>): InvisibleCharacter[] {
  const tokens: WordToken[] = [];
  for (const match of text.matchAll(WORD)) {
    let latin = 0;
    let nonLatin = 0;
    const foreign: InvisibleCharacter[] = [];
    let offset = match.index;
    for (const character of match[0]) {
      if (LETTER.test(character)) {
        if (LATIN_SCRIPT.test(character)) {
          latin += 1;
        } else if (!NEUTRAL_SCRIPT.test(character)) {
          nonLatin += 1;
          if (!reported.has(offset)) {
            foreign.push({
              index: offset,
              codePoint: character.codePointAt(0) ?? 0,
              kind: 'mixed_script',
            });
          }
        }
      }
      offset += character.length;
    }
    tokens.push({ isLatin: latin > 0 && latin >= nonLatin, foreign });
  }
  const items: InvisibleCharacter[] = [];
  tokens.forEach((token, position) => {
    if (token.foreign.length === 0) return;
    const previous = tokens[position - 1];
    const next = tokens[position + 1];
    const isBetweenLatin =
      (previous !== undefined || next !== undefined) &&
      (previous?.isLatin ?? true) &&
      (next?.isLatin ?? true);
    if (token.isLatin || isBetweenLatin) items.push(...token.foreign);
  });
  return items;
}

/**
 * Espacios repetidos y espacios o tabuladores al final de la línea, tal como se ven en el
 * original. Un carácter eliminado entre dos espacios corta la racha: se reporta él y no el
 * espacio, para no contar dos veces la misma marca.
 */
function findSpacingVariants(scanned: readonly ScannedCharacter[]): InvisibleCharacter[] {
  const items: InvisibleCharacter[] = [];
  let trailing: InvisibleCharacter[] = [];
  let isAfterSpace = false;
  for (const { index, codePoint, kind } of scanned) {
    if (codePoint === LINE_FEED || codePoint === CARRIAGE_RETURN || kind === 'line_separator') {
      items.push(...trailing);
      trailing = [];
      isAfterSpace = false;
      continue;
    }
    const isPlainBlank = (codePoint === NORMAL_SPACE || codePoint === TAB) && kind === null;
    const isSpace = (codePoint === NORMAL_SPACE && kind === null) || kind === 'nonstandard_space';
    if (codePoint === NORMAL_SPACE && kind === null && isAfterSpace) {
      items.push({ index, codePoint, kind: 'typographic_variant' });
    } else if (isPlainBlank) {
      trailing.push({ index, codePoint, kind: 'typographic_variant' });
    } else if (!isSpace) {
      trailing = [];
    }
    isAfterSpace = isSpace;
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
 * No se reportan las letras del español con su acento (en NFC o NFD), «¿», «¡», «« »», «º», «ª»,
 * superíndices, fracciones, el saltillo (U+02BC, U+A78C) ni las vocales con marcas de
 * `LEGITIMATE_MARKS`. Los hallazgos se ordenan por posición.
 */
export function findInvisibleCharacters(
  text: string,
  options: InvisibleCharacterOptions = {},
): InvisibleCharacterReport {
  const shouldNormalizeTypography = options.shouldNormalizeTypography ?? true;
  const scanned = [...scanCharacters(text)];
  const items: InvisibleCharacter[] = [];
  const reported = new Set<number>();
  for (const { character, index, codePoint, kind } of scanned) {
    const found = kind ?? classifyLookalike(character, shouldNormalizeTypography);
    if (found === null) continue;
    items.push({ index, codePoint, kind: found });
    reported.add(index);
  }
  items.push(...findMixedScriptLetters(text, reported));
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
    .replace(/ {2,}/gu, ' ');
}

/**
 * Elimina o corrige lo que detecta `findInvisibleCharacters` y deja el resultado en NFC.
 *
 * - Los retornos de carro (`\r\n` o `\r`) y los separadores U+2028/U+2029 pasan a `\n`.
 * - Los espacios no estándar se convierten en espacio normal (U+0020).
 * - Las formas de compatibilidad de `MARKING_COMPATIBILITY_RANGES` pasan a su forma NFKC; el resto
 *   del texto solo se normaliza con NFC, así que «3º», «1ª», «m²», «ni³» y «½» no cambian.
 * - Los homoglifos de `CONFUSABLES` y la puntuación de `PUNCTUATION_CONFUSABLES` se sustituyen en
 *   todo el texto (también en palabras de una letra o sin letras latinas).
 * - Las marcas combinantes sueltas, o sin componer sobre un número, se eliminan. Las que no se
 *   componen con su letra se conservan salvo con `shouldRemoveUncomposedMarks`; las de
 *   `LEGITIMATE_MARKS` sobre una vocal latina y los acentos del español se conservan siempre.
 * - Por defecto, normaliza la tipografía de teclado (`shouldNormalizeTypography`).
 *
 * Seguridad: los saltos de línea, tabuladores, espacios normales, el saltillo (U+02BC, U+A78C) y
 * los superíndices tonales se conservan. Una letra de otro alfabeto sin equivalente conocido se
 * conserva para no alterar palabras legítimas; `findInvisibleCharacters` la seguirá reportando
 * como `mixed_script`, igual que las marcas sin componer que se conservan (`uncomposed_mark`).
 * Costos conocidos: al quitar U+200D algunos emojis compuestos se separan; los emojis de teclado
 * («#» + U+20E3) pierden su marco; las palabras rusas o griegas quedan transliteradas en parte; el
 * ideograma «一» y la marca «ー» se vuelven `-` también en textos chinos o japoneses.
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
  const replaced = replaceFromMap(replaceFromMap(cleaned, CONFUSABLES), PUNCTUATION_CONFUSABLES);
  return (shouldNormalizeTypography ? normalizeTypography(replaced) : replaced).normalize('NFC');
}
