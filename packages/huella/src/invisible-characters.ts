// Detección y eliminación de caracteres invisibles, controles, homoglifos y variantes tipográficas
// en el texto de la denuncia. Son la forma más barata de marcar un documento para saber a quién
// se le entregó («trampa del canario»).

import { CONFUSABLES, TYPOGRAPHIC_VARIANTS } from './confusables.ts';

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
 * - `uncomposed_mark`: marca combinante después de una letra con la que no se compone en NFC
 *   (por ejemplo, «q» + U+0307). Los acentos del español sí se componen y no se reportan.
 * - `confusable`: homoglifo del mapa `CONFUSABLES` (UTS #39), en cualquier palabra.
 * - `mixed_script`: letra cirílica o griega sin equivalente en `CONFUSABLES` dentro de una
 *   palabra latina. La limpieza no la cambia.
 * - `typographic_variant`: guion o comilla tipográfica, espacio repetido o espacio al final de la
 *   línea. Solo se reporta si la normalización tipográfica está activa.
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
   * Normalizar la tipografía: colapsar espacios repetidos, quitar espacios y tabuladores al final
   * de la línea, y llevar guiones y comillas tipográficas a `-`, `"` y `'`. Por defecto, `true`.
   * Con `false`, `findInvisibleCharacters` tampoco reporta `typographic_variant`.
   */
  shouldNormalizeTypography?: boolean;
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
const WORD = /[\p{L}\p{M}]+/gu;
const LATIN = /\p{Script=Latin}/u;
const CONFUSABLE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

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
}

/**
 * Recorre el texto y clasifica cada carácter. Una marca combinante es legítima solo si sigue a
 * una letra, un número u otra marca legítima y además se compone con ellos en NFC (así se
 * escriben los acentos en NFD). Los caracteres que se eliminan no cortan esa unión; un espacio no
 * estándar, un control o un separador de línea sí, porque se vuelven espacio o salto de línea.
 */
function* scanCharacters(text: string): Generator<ScannedCharacter> {
  // Letra base más las marcas que ya se compusieron con ella, en NFC; `null` si no hay base.
  let cluster: string | null = null;
  let index = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    let kind = classifyCodePoint(codePoint, character);
    if (kind === null && COMBINING_MARK.test(character)) {
      if (cluster === null) {
        kind = 'combining_mark';
      } else {
        const composed: string = (cluster + character).normalize('NFC');
        if ([...composed].length === [...cluster].length) cluster = composed;
        else kind = 'uncomposed_mark';
      }
    } else if (kind === null) {
      cluster = MARK_BASE.test(character) ? character.normalize('NFC') : null;
    } else if (kind === 'nonstandard_space' || kind === 'line_separator' || kind === 'control') {
      cluster = null;
    }
    yield { character, index, codePoint, kind };
    index += character.length;
  }
}

/** Busca el reemplazo por el carácter o por su forma NFKC, que es la que llega a la limpieza. */
function lookup(map: ReadonlyMap<string, string>, character: string): string | undefined {
  return map.get(character) ?? map.get(character.normalize('NFKC'));
}

/** Letras cirílicas o griegas sin equivalente en `CONFUSABLES` dentro de palabras latinas. */
function findMixedScriptLetters(text: string): InvisibleCharacter[] {
  const items: InvisibleCharacter[] = [];
  for (const match of text.matchAll(WORD)) {
    const word = match[0];
    if (!LATIN.test(word) || !CONFUSABLE_SCRIPT.test(word)) continue;
    let offset = match.index;
    for (const character of word) {
      if (CONFUSABLE_SCRIPT.test(character) && lookup(CONFUSABLES, character) === undefined) {
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
 * no se componen, selectores de variante, homoglifos de `CONFUSABLES` y, si la normalización
 * tipográfica está activa (por defecto), guiones, comillas y espacios sobrantes.
 * No se reportan las letras del español con su acento (en NFC o NFD) ni «¿», «¡», «« »».
 * Los hallazgos se ordenan por posición.
 */
export function findInvisibleCharacters(
  text: string,
  options: InvisibleCharacterOptions = {},
): InvisibleCharacterReport {
  const shouldNormalizeTypography = options.shouldNormalizeTypography ?? true;
  const scanned = [...scanCharacters(text)];
  const items: InvisibleCharacter[] = [];
  for (const { character, index, codePoint, kind } of scanned) {
    if (kind !== null) {
      items.push({ index, codePoint, kind });
    } else if (lookup(CONFUSABLES, character) !== undefined) {
      items.push({ index, codePoint, kind: 'confusable' });
    } else if (shouldNormalizeTypography && lookup(TYPOGRAPHIC_VARIANTS, character) !== undefined) {
      items.push({ index, codePoint, kind: 'typographic_variant' });
    }
  }
  items.push(...findMixedScriptLetters(text));
  if (shouldNormalizeTypography) items.push(...findSpacingVariants(scanned));
  items.sort((a, b) => a.index - b.index);
  return { count: items.length, items };
}

function removeInvisibleCharacters(text: string): string {
  let output = '';
  for (const { character, kind } of scanCharacters(text)) {
    if (kind === null) output += character;
    else if (kind === 'nonstandard_space') output += ' ';
    else if (kind === 'line_separator') output += '\n';
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
 * Elimina lo que detecta `findInvisibleCharacters`, aplica NFKC, sustituye los homoglifos de
 * `CONFUSABLES` en todo el texto (también en palabras de una letra o sin letras latinas) y, por
 * defecto, normaliza la tipografía. El resultado queda en NFC.
 *
 * - Los retornos de carro (`\r\n` o `\r`) y los separadores U+2028/U+2029 pasan a `\n`.
 * - Los espacios no estándar se convierten en espacio normal (U+0020).
 * - Las marcas combinantes sueltas o que no se componen con su letra en NFC se eliminan; los
 *   acentos del español unidos a su letra se conservan compuestos (á, é, í, ó, ú, ü, ñ).
 *
 * Seguridad: los saltos de línea, tabuladores y espacios normales se conservan; NFKC además
 * unifica variantes de ancho completo, ligaduras y otras formas de compatibilidad que también
 * sirven como marca. Una letra cirílica o griega sin equivalente conocido se conserva para no
 * alterar palabras legítimas; `findInvisibleCharacters` la seguirá reportando como `mixed_script`.
 * Costos conocidos: al quitar U+200D algunos emojis compuestos se separan; los emojis de teclado
 * («#» + U+20E3) pierden su marco; las palabras rusas o griegas quedan transliteradas en parte;
 * las letras con marcas sin forma precompuesta (por ejemplo, vocales subrayadas de algunas
 * ortografías indígenas, o la escritura devanagari y árabe) pierden la marca.
 */
export function stripInvisibleCharacters(
  text: string,
  options: InvisibleCharacterOptions = {},
): string {
  const shouldNormalizeTypography = options.shouldNormalizeTypography ?? true;
  const unixLines = text.replace(/\r\n?/gu, '\n');
  // Segunda pasada: NFKC puede producir marcas sueltas (por ejemplo, «´» pasa a espacio + U+0301)
  // y la primera pudo quitar una marca que bloqueaba la composición de otra.
  const cleaned = removeInvisibleCharacters(removeInvisibleCharacters(unixLines).normalize('NFKC'));
  const latin = replaceFromMap(cleaned, CONFUSABLES);
  return (shouldNormalizeTypography ? normalizeTypography(latin) : latin).normalize('NFC');
}
