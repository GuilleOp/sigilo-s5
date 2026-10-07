// Revisor de reidentificación: señala datos del texto que podrían delatar a la persona denunciante.
// Es una ayuda heurística, no una garantía; la persona decide qué cambiar.

import { SPANISH_MONTHS } from './months.ts';

/** Tipo de dato potencialmente identificante. */
export type TextFindingKind =
  | 'email'
  | 'phone'
  | 'curp'
  | 'rfc'
  | 'exact_date'
  | 'exact_time'
  | 'uniqueness'
  | 'self_role'
  | 'proper_name';

/** Gravedad del hallazgo. */
export type TextFindingSeverity = 'low' | 'medium' | 'high';

/** Un hallazgo. `start` y `end` son posiciones UTF-16 del texto original (`end` exclusivo). */
export interface TextFinding {
  kind: TextFindingKind;
  start: number;
  end: number;
  excerpt: string;
  severity: TextFindingSeverity;
  suggestion: string;
}

interface FoldedText {
  /** Texto en minúsculas y sin diacríticos. */
  value: string;
  /** Para cada unidad de `value`, su posición en el texto original. */
  map: number[];
  originalLength: number;
}

interface RawMatch {
  start: number;
  end: number;
  groups: (string | undefined)[];
}

type Rule = {
  kind: TextFindingKind;
  severity: TextFindingSeverity;
  pattern: RegExp;
  suggest: (match: RawMatch) => string;
};

const SEVERITY_RANK: Readonly<Record<TextFindingSeverity, number>> = { low: 0, medium: 1, high: 2 };

const MONTH_PATTERN = `(${SPANISH_MONTHS.join('|')}|setiembre)`;
const WEEKDAY_PATTERN = '(lunes|martes|miercoles|jueves|viernes|sabado|domingo)';
const HOUR_WORDS = [
  'una',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
];
// Límites de palabra con Unicode: `\b` de JavaScript solo entiende ASCII.
const B_START = '(?<![\\p{L}\\p{N}])';
const B_END = '(?![\\p{L}\\p{N}])';

const STATE_CODES =
  'as|bc|bs|cc|cl|cm|cs|ch|df|dg|gt|gr|hg|jc|mc|mn|ms|nt|nl|oc|pl|qt|qr|sp|sl|sr|tc|ts|tl|vz|yn|zs|ne';
const DATE_6 = '\\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])';

const ROLE_WORDS =
  'jef[ea]|subjef[ea]|auxiliar|director[a]?|subdirector[a]?|coordinador[a]?|secretari[oa]|' +
  'asistente|analista|supervisor[a]?|gerente|encargad[oa]|titular|responsable|contador[a]?|' +
  'administrador[a]?|tesorer[oa]|chofer|vigilante|recepcionista|enlace|asesor[a]?|' +
  'jefe de departamento|jefa de departamento|ejecutiv[oa]|tecnic[oa]|oficial|capturista|' +
  'operador[a]?|inspector[a]?|auditor[a]?|abogad[oa]|notificador[a]?|intendente|almacenista|' +
  'cajer[oa]|promotor[a]?|delegad[oa]|regidor[a]?|sindic[oa]';
const MY_WORDS =
  'jef[ea]|area|oficina|escritorio|turno|departamento|unidad|coordinacion|direccion|puesto|' +
  'cubiculo|supervisor[a]?|superior|plaza|guardia|caja|ventanilla|modulo|equipo de trabajo';

function rx(source: string): RegExp {
  return new RegExp(source, 'gu');
}

function hourPeriod(hour: number): string {
  if (hour >= 5 && hour < 12) return 'por la mañana';
  if (hour >= 12 && hour < 19) return 'por la tarde';
  return 'por la noche';
}

function hourFromWord(word: string | undefined): number | null {
  if (word === undefined) return null;
  const numeric = Number.parseInt(word, 10);
  if (!Number.isNaN(numeric)) return numeric;
  const index = HOUR_WORDS.indexOf(word);
  return index === -1 ? null : index + 1;
}

function monthName(value: string | undefined): string | null {
  if (value === undefined) return null;
  const month = Number.parseInt(value, 10);
  return SPANISH_MONTHS[month - 1] ?? null;
}

function fullYear(value: string | undefined): string | null {
  if (value === undefined) return null;
  return value.length === 2 ? `20${value}` : value;
}

const RULES: readonly Rule[] = [
  {
    kind: 'email',
    severity: 'high',
    pattern: rx(`${B_START}[a-z0-9._%+-]+@[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.[a-z]{2,}${B_END}`),
    suggest: () =>
      'Quita el correo electrónico. Para darle seguimiento usa el buzón anónimo y tu frase de recibo.',
  },
  {
    kind: 'phone',
    severity: 'high',
    pattern: rx(
      '(?<![\\d+])(?:\\+?\\s?52[\\s.-]*(?:1[\\s.-]*)?)?' +
        '(?:(?:\\(\\d{2,3}\\)\\s?|\\d{2,3}[\\s.-]?)\\d{3,4}[\\s.-]?\\d{4}|\\d{2}(?:[\\s.-]\\d{2}){4})(?!\\d)',
    ),
    suggest: () => 'Quita el número de teléfono. El seguimiento se hace en el buzón anónimo.',
  },
  {
    kind: 'curp',
    severity: 'high',
    pattern: rx(
      `${B_START}[a-z][aeioux][a-z]{2}${DATE_6}[hmx](?:${STATE_CODES})[b-df-hj-np-tv-z]{3}[a-z\\d]\\d${B_END}`,
    ),
    suggest: () => 'Quita la CURP. Ningún dato oficial tuyo es necesario para denunciar.',
  },
  {
    kind: 'rfc',
    severity: 'high',
    pattern: rx(`(?<![\\p{L}\\p{N}&])[a-z&]{3,4}${DATE_6}(?:[a-z\\d]{2}[a\\d])?${B_END}`),
    suggest: () =>
      'Quita el RFC. Si es de una empresa involucrada, basta con su nombre comercial; si es tuyo, elimínalo.',
  },
  {
    kind: 'exact_date',
    severity: 'medium',
    pattern: rx(
      '(?<!\\d)(?:0?[1-9]|[12]\\d|3[01])[/.-](0?[1-9]|1[0-2])[/.-](\\d{4}|\\d{2})(?!\\d)',
    ),
    suggest: (match) => {
      const month = monthName(match.groups[0]);
      const year = fullYear(match.groups[1]);
      return month !== null && year !== null
        ? `Escribe solo el mes: ${month} de ${year}`
        : 'Escribe solo el mes y el año, sin el día exacto.';
    },
  },
  {
    kind: 'exact_date',
    severity: 'medium',
    pattern: rx(
      `${B_START}(?:${WEEKDAY_PATTERN}\\s+)?(?:\\d{1,2}|primero)\\s+de\\s+${MONTH_PATTERN}(?:\\s+(?:de|del)\\s+(\\d{4}))?${B_END}`,
    ),
    suggest: (match) => {
      const month = match.groups[1] === 'setiembre' ? 'septiembre' : match.groups[1];
      const year = match.groups[2];
      return year !== undefined
        ? `Escribe solo el mes: ${month ?? ''} de ${year}`
        : `Escribe solo el mes: ${month ?? ''}`;
    },
  },
  {
    kind: 'exact_date',
    severity: 'medium',
    pattern: rx(`${B_START}(?:el\\s+)?${WEEKDAY_PATTERN}\\s+\\d{1,2}(?!\\d|:)${B_END}`),
    suggest: () => 'Menciona solo la semana o el mes, por ejemplo: a principios de mes.',
  },
  {
    kind: 'exact_time',
    severity: 'medium',
    pattern: rx(
      '(?<![\\d:])([01]?\\d|2[0-3]):[0-5]\\d(?:\\s*(?:hrs|horas|h|am|pm|a\\.\\s?m\\.|p\\.\\s?m\\.))?(?![\\d:])',
    ),
    suggest: (match) => {
      const hour = hourFromWord(match.groups[0]);
      return hour === null
        ? 'Usa un periodo amplio: por la mañana, por la tarde o por la noche.'
        : `Usa un periodo amplio, por ejemplo: ${hourPeriod(hour)}.`;
    },
  },
  {
    kind: 'exact_time',
    severity: 'medium',
    pattern: rx(
      `${B_START}a\\s+las?\\s+(\\d{1,2}|${HOUR_WORDS.join('|')})(?::[0-5]\\d)?(?:\\s+y\\s+(?:media|cuarto|\\d{1,2}))?` +
        '(?:\\s+(?:de\\s+la\\s+(manana|tarde|noche|madrugada)|en\\s+punto|horas|hrs|am|pm))?' +
        B_END,
    ),
    suggest: (match) => {
      const part = match.groups[1];
      if (part === 'manana') return 'Usa un periodo amplio, por ejemplo: por la mañana.';
      if (part === 'tarde') return 'Usa un periodo amplio, por ejemplo: por la tarde.';
      if (part === 'noche' || part === 'madrugada') {
        return 'Usa un periodo amplio, por ejemplo: por la noche.';
      }
      return 'Usa un periodo amplio: por la mañana, por la tarde o por la noche.';
    },
  },
  {
    kind: 'uniqueness',
    severity: 'high',
    pattern: rx(
      `${B_START}(?:soy\\s+(?:el|la)\\s+unic[oa]|(?:solo|solamente|unicamente)\\s+yo|` +
        `(?:la|el)\\s+unic[ao]\\s+persona\\s+que|nadie\\s+mas\\s+que\\s+yo)${B_END}`,
    ),
    suggest: () =>
      'Evita decir que solo tú tienes ese acceso o conocimiento. Escribe, por ejemplo: «varias personas del área lo saben».',
  },
  {
    kind: 'self_role',
    severity: 'high',
    pattern: rx(`${B_START}soy\\s+(?:el|la|un|una)\\s+(?:${ROLE_WORDS})${B_END}`),
    suggest: () => 'No menciones tu cargo. Describe lo que viste sin decir qué puesto ocupas.',
  },
  {
    kind: 'self_role',
    severity: 'high',
    pattern: rx(`${B_START}mis?\\s+(${MY_WORDS})${B_END}`),
    suggest: (match) => {
      const word = match.groups[0] ?? '';
      if (/^(?:jef[ea]|supervisor[a]?|superior)$/u.test(word)) {
        return `Cambia «mi ${word}» por algo neutro, por ejemplo: «la persona titular del área».`;
      }
      return 'No digas dónde trabajas. Escribe algo neutro, por ejemplo: «en la dependencia».';
    },
  },
];

// Palabras capitalizadas comunes en textos institucionales que no son nombres de persona.
const INSTITUTIONAL_WORDS = new Set(
  (
    'secretaria subsecretaria direccion subdireccion coordinacion departamento unidad oficina ' +
    'gobierno estado estados unidos mexicanos municipio municipal ayuntamiento instituto comision ' +
    'fiscalia general federal nacional estatal tribunal congreso senado camara diputados ' +
    'presidencia universidad hospital plataforma digital mexico ciudad publico publica funcion ' +
    'hacienda credito salud educacion recursos humanos materiales obras servicios administracion ' +
    'finanzas desarrollo social seguridad contraloria auditoria superior organo interno control ' +
    'sistema anticorrupcion transparencia juzgado poder judicial ejecutivo legislativo procuraduria ' +
    'consejo delegacion alcaldia junta registro civil centro programa fondo licitacion contrato ' +
    'dependencia entidad area jefatura gerencia ley reglamento articulo norma oficial lunes martes ' +
    'miercoles jueves viernes sabado domingo enero febrero marzo abril mayo junio julio agosto ' +
    'septiembre octubre noviembre diciembre lic licenciado licenciada ing ingeniero ingeniera dr ' +
    'dra doctor doctora mtro mtra maestro maestra sr sra srta senor senora c ciudadano ciudadana'
  ).split(' '),
);
const NAME_CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
const CAPITALIZED_SEQUENCE =
  /\p{Lu}[\p{Ll}\p{M}]+(?:\s+(?:(?:de|del|la|las|los|y)\s+)*\p{Lu}[\p{Ll}\p{M}]+)+/gu;

function foldWord(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function isSentenceStart(text: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const character = text[i] ?? '';
    if (/\s/u.test(character)) {
      if (character === '\n') return true;
      continue;
    }
    return /[.!?¿¡:;"«“(]/u.test(character);
  }
  return true;
}

function findProperNames(text: string): TextFinding[] {
  const findings: TextFinding[] = [];
  for (const match of text.matchAll(CAPITALIZED_SEQUENCE)) {
    const words: { start: number; end: number; value: string }[] = [];
    for (const word of match[0].matchAll(/\p{L}[\p{L}\p{M}]*/gu)) {
      words.push({
        start: match.index + word.index,
        end: match.index + word.index + word[0].length,
        value: foldWord(word[0]),
      });
    }
    // Quita conectores, palabras institucionales y la primera palabra si inicia oración.
    let first = 0;
    let last = words.length - 1;
    const isTrimmable = (position: number): boolean => {
      const word = words[position];
      if (word === undefined) return false;
      if (NAME_CONNECTORS.has(word.value) || INSTITUTIONAL_WORDS.has(word.value)) return true;
      return position === first && isSentenceStart(text, word.start);
    };
    while (first <= last && isTrimmable(first)) first++;
    while (last >= first && isTrimmable(last)) last--;
    const kept = words.slice(first, last + 1);
    const capitalized = kept.filter(
      (word) => !NAME_CONNECTORS.has(word.value) && !INSTITUTIONAL_WORDS.has(word.value),
    );
    const head = kept[0];
    const tail = kept[kept.length - 1];
    if (capitalized.length < 2 || head === undefined || tail === undefined) continue;
    findings.push({
      kind: 'proper_name',
      start: head.start,
      end: tail.end,
      excerpt: text.slice(head.start, tail.end),
      severity: 'low',
      suggestion:
        'Si es el nombre de alguien cercano a ti, como tu familia, colegas o testigos, mejor quítalo. El nombre de la persona denunciada puede quedarse.',
    });
  }
  return findings;
}

/** Pasa el texto a minúsculas sin diacríticos, conservando el mapa hacia las posiciones originales. */
function foldText(text: string): FoldedText {
  let value = '';
  const map: number[] = [];
  let index = 0;
  for (const character of text) {
    const folded = character.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    for (let i = 0; i < folded.length; i++) map.push(index);
    value += folded;
    index += character.length;
  }
  return { value, map, originalLength: text.length };
}

function toOriginal(folded: FoldedText, start: number, end: number): [number, number] {
  const originalStart = folded.map[start] ?? folded.originalLength;
  const originalEnd =
    end < folded.map.length ? (folded.map[end] ?? folded.originalLength) : folded.originalLength;
  return [originalStart, originalEnd];
}

function isValidPhone(candidate: string): boolean {
  // Diez dígitos nacionales, con o sin lada internacional (+52 y el antiguo 1 de celulares).
  const digits = candidate.replace(/\D/gu, '');
  if (digits.length === 10) return true;
  if (digits.length === 12) return digits.startsWith('52');
  if (digits.length === 13) return digits.startsWith('521');
  return false;
}

function trimEnd(text: string, start: number, end: number): number {
  let result = end;
  while (result > start && /\s/u.test(text[result - 1] ?? '')) result--;
  return result;
}

function selectNonOverlapping(findings: TextFinding[]): TextFinding[] {
  const ranked = [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  );
  const accepted: TextFinding[] = [];
  for (const finding of ranked) {
    const overlaps = accepted.some(
      (other) => finding.start < other.end && other.start < finding.end,
    );
    if (!overlaps) accepted.push(finding);
  }
  return accepted.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Revisa el texto y devuelve hallazgos ordenados por posición, sin solapamientos: cuando dos
 * hallazgos se cruzan se conserva el de mayor gravedad y, a igual gravedad, el más largo.
 * La detección ignora mayúsculas y acentos; `start` y `end` apuntan al texto original.
 */
export function reviewText(text: string): TextFinding[] {
  const folded = foldText(text);
  const findings: TextFinding[] = [];
  for (const rule of RULES) {
    for (const match of folded.value.matchAll(rule.pattern)) {
      if (rule.kind === 'phone' && !isValidPhone(match[0])) continue;
      const [start, rawEnd] = toOriginal(folded, match.index, match.index + match[0].length);
      const end = trimEnd(text, start, rawEnd);
      if (end <= start) continue;
      const raw: RawMatch = { start, end, groups: match.slice(1) };
      findings.push({
        kind: rule.kind,
        start,
        end,
        excerpt: text.slice(start, end),
        severity: rule.severity,
        suggestion: rule.suggest(raw),
      });
    }
  }
  findings.push(...findProperNames(text));
  return selectNonOverlapping(findings);
}
