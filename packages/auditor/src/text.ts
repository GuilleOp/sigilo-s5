// Texto de los acuerdos: palabras con su posición, normalización (sin expedientes, fechas, números,
// mayúsculas ni acentos), shingles de palabras, similitud de Jaccard y fragmentos que se repiten.

/** Palabra del texto original con su posición y su forma normalizada. */
export interface Token {
  /** Forma normalizada; `#` para expedientes, números y fechas. */
  norm: string;
  start: number;
  end: number;
}

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[-/.][\p{L}\p{N}]+)*/gu;

const MONTHS = new Set([
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
]);

/** Quita acentos y diéresis y pasa a minúsculas; conserva la eñe como `n`. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Busca la primera raíz de `terms` en el texto plegado y devuelve la oración ORIGINAL que la
 * contiene, o `null`. Pliega carácter por carácter para conservar las posiciones del original.
 */
export function sentenceMentioning(text: string, terms: readonly string[]): string | null {
  let folded = '';
  const origin: number[] = [];
  let offset = 0;
  for (const char of text) {
    const piece = foldText(char);
    folded += piece;
    for (let index = 0; index < piece.length; index += 1) origin.push(offset);
    offset += char.length;
  }
  for (const term of terms) {
    const index = folded.indexOf(term);
    if (index < 0) continue;
    const at = origin[index] ?? 0;
    const previous = text.lastIndexOf('. ', at);
    const end = text.indexOf('. ', at);
    return text.slice(previous < 0 ? 0 : previous + 2, end < 0 ? undefined : end + 1).trim();
  }
  return null;
}

/**
 * Divide el texto en palabras normalizadas. Toda palabra con dígitos (expedientes como
 * `OIC-IFFE-INV-0001`, artículos, montos, fechas) y los nombres de mes se vuelven `#`, para que
 * dos acuerdos que solo difieren en el expediente o la fecha se vean iguales.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(WORD_PATTERN)) {
    const raw = foldText(match[0]);
    const start = match.index;
    const norm = /\d/u.test(raw) || MONTHS.has(raw) ? '#' : raw;
    tokens.push({ norm, start, end: start + match[0].length });
  }
  return tokens;
}

/** Shingles de `size` palabras consecutivas (con un texto más corto, un solo shingle con todo). */
export function shingles(tokens: readonly Token[], size: number): Set<string> {
  const result = new Set<string>();
  if (tokens.length === 0) return result;
  if (tokens.length < size) {
    result.add(tokens.map((token) => token.norm).join(' '));
    return result;
  }
  for (let index = 0; index + size <= tokens.length; index += 1) {
    result.add(
      tokens
        .slice(index, index + size)
        .map((token) => token.norm)
        .join(' '),
    );
  }
  return result;
}

/** Índice de Jaccard entre dos conjuntos: |A ∩ B| / |A ∪ B| (0 si ambos están vacíos). */
export function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let shared = 0;
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  for (const item of small) if (large.has(item)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** Fragmento del texto original. */
export interface Fragment {
  text: string;
  start: number;
  end: number;
}

/**
 * Marca las palabras cubiertas por los shingles de `covered` y devuelve la proporción de palabras
 * cubiertas y los fragmentos contiguos del texto ORIGINAL (no del normalizado), en orden.
 */
export function coveredFragments(
  text: string,
  tokens: readonly Token[],
  size: number,
  covered: ReadonlySet<string>,
): { ratio: number; fragments: Fragment[] } {
  if (tokens.length === 0) return { ratio: 0, fragments: [] };
  const marks = new Array<boolean>(tokens.length).fill(false);
  const width = Math.min(size, tokens.length);
  for (let index = 0; index + width <= tokens.length; index += 1) {
    const key = tokens
      .slice(index, index + width)
      .map((token) => token.norm)
      .join(' ');
    if (covered.has(key))
      for (let offset = 0; offset < width; offset += 1) marks[index + offset] = true;
  }
  const fragments: Fragment[] = [];
  let runStart = -1;
  for (let index = 0; index <= tokens.length; index += 1) {
    const isMarked = index < tokens.length && marks[index] === true;
    if (isMarked && runStart < 0) runStart = index;
    if (!isMarked && runStart >= 0) {
      const first = tokens[runStart];
      const last = tokens[index - 1];
      if (first !== undefined && last !== undefined) {
        fragments.push({
          text: text.slice(first.start, last.end),
          start: first.start,
          end: last.end,
        });
      }
      runStart = -1;
    }
  }
  const markedCount = marks.filter(Boolean).length;
  return { ratio: markedCount / tokens.length, fragments };
}

/** Proporción como entero en milésimas (la forma canónica de la bitácora solo admite enteros). */
export function toPermille(ratio: number): number {
  return Math.round(ratio * 1000);
}

/** Porcentaje legible en español: «83 %». */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

/** Indica si `fragment` aparece en `text` (sin distinguir mayúsculas, acentos ni espacios). */
export function containsFragment(text: string, fragment: string): boolean {
  const squash = (value: string): string => foldText(value).replace(/\s+/gu, ' ').trim();
  const needle = squash(fragment);
  return needle.length > 0 && squash(text).includes(needle);
}
