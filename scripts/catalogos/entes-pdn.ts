// Genera packages/contracts/src/entes/entes-pdn.json: el catálogo de entes públicos reales que usa el
// S5 oficial, tomado del directorio de cobertura de la Plataforma Digital Nacional (PDN), con el
// orden de gobierno, la entidad y el municipio que trae el propio directorio.
// Uso: node scripts/catalogos/entes-pdn.ts [archivo.json | URL] [--fecha AAAA-MM-DD]
// Por omisión lee la URL pública una sola vez. Metodología: packages/contracts/src/entes/README.md.
// Seguridad: el directorio solo trae instituciones; aun así se descartan nombres con correos o
// teléfonos, y nunca se guarda nada que no sea el nombre del ente, su orden, entidad y municipio.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { STATES } from '../../packages/contracts/src/catalogs/states.ts';
import { MUNICIPALITIES_BY_STATE } from '../../packages/contracts/src/catalogs/municipalities-data.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const OUTPUT = join(ROOT, 'packages/contracts/src/entes/entes-pdn.json');
export const DEFAULT_SOURCE =
  'https://cobertura.plataformadigitalnacional.org/directus/items/entes';

/** Registro del directorio de entes de la PDN (solo los campos que se usan). */
export interface PdnEnte {
  id: number;
  nombre: string;
  ambitoGobierno: 'Federal' | 'Estatal' | 'Municipal' | string;
  entidad: string;
  municipio: string | null;
}

/** Orden de gobierno en el catálogo: F federal, E estatal, M municipal. */
export type LevelCode = 'F' | 'E' | 'M';

const LEVELS: Readonly<Record<string, LevelCode>> = {
  Federal: 'F',
  Estatal: 'E',
  Municipal: 'M',
};

/** Ente del catálogo generado: `[id, nombre, orden, municipio | null, ids de la PDN, nombre PDN?]`. */
export type CatalogRow = [string, string, LevelCode, string | null, number[], string?];

/** Sin acentos, en mayúsculas y con los signos como espacios: la forma con que se comparan nombres. */
export function nameKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]+/gu, ' ')
    .trim();
}

const SMALL_WORDS: ReadonlySet<string> = new Set([
  'A',
  'AL',
  'CON',
  'DE',
  'DEL',
  'E',
  'EL',
  'EN',
  'LA',
  'LAS',
  'LOS',
  'O',
  'PARA',
  'POR',
  'SIN',
  'SU',
  'SUS',
  'U',
  'Y',
]);

/** Siglas que se conservan en mayúsculas (las demás se detectan por forma o por contexto). */
const ACRONYMS: ReadonlySet<string> = new Set(
  (
    'AC ASA BANOBRAS BANCOMEXT BANXICO CAPUFE CECYTE CENACE CENAGAS CFE CNBV CNDH CNH COBAEJ ' +
    'COFECE COMAPA CONADE CONADIS CONAFOR CONAGUA CONALEP CONAPESCA CONAPRED CONAVI CONDUSEF ' +
    'CONEVAL CONSAR CRE CV DICONSA DIF FIRA FONATUR FOVISSSTE IFT IMJUVE IMPI IMPLAN IMSS INAH ' +
    'INAI INAPAM INBAL INE INEGI INFONAVIT INMUJERES INPI INSUS IPN ISSFAM ISSSTE ISSSTEZAC ' +
    'LICONSA NAFIN OIC OOAPAS OPD PEMEX PROFECO PROFEPA SA SAPA SAPAS SAT SC SEDENA SEGALMEX ' +
    'SEMAR SENASICA SEP SHCP SIAPA SNC SNDIF SSPC UAM UNAM'
  ).split(' '),
);

/** Abreviaturas con punto que se escriben con mayúscula inicial. */
const TITLE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  CD: 'Cd',
  DR: 'Dr',
  DRA: 'Dra',
  GRAL: 'Gral',
  ING: 'Ing',
  LIC: 'Lic',
  PROF: 'Prof',
  PROFR: 'Profr',
  STA: 'Sta',
  STO: 'Sto',
};

/** Palabras frecuentes que en mayúsculas llegan sin acento ni eñe (clave sin acentos → forma). */
const VOCABULARY: readonly string[] = (
  'académica académico agrícola alcaldía análisis antropología área áreas arqueología artística ' +
  'artístico atlántico auditoría básica básico biología catálogo científica científico ' +
  'cinematografía clínica clínico código comité comités compañía consejería contraloría crédito ' +
  'defensoría depósito diagnóstico diseño ecología ecológica ecológico económica económico ' +
  'economía eléctrica electrónica energética energía enseñanza estadística estratégica ' +
  'estratégico física físico fiscalía fotografía género geografía hidráulica hidráulico ' +
  'histórica histórico informática jurídica jurídico línea logística marítima marítimo médica ' +
  'médico méxico mexicana mexicano música niñas niñez niños número oficialía órgano órganos ' +
  'pacífico pediátrico petróleos policía política político politécnica politécnico práctica ' +
  'procuraduría psicología psiquiátrico pública público públicas públicos química secretaría ' +
  'secretarías técnica técnico tecnológica tecnológico tecnológicos tecnología tesorería ' +
  'tránsito turística turístico única único vía vías'
).split(' ');

/**
 * Diccionario de acentos: el vocabulario y las palabras con acento de los nombres oficiales de
 * entidades y municipios del INEGI («JUAREZ» → «Juárez»). Si una palabra aparece con dos formas,
 * no se corrige.
 */
export function buildAccentDictionary(names: readonly string[]): ReadonlyMap<string, string> {
  const forms = new Map<string, Set<string>>();
  for (const word of [...VOCABULARY, ...names.flatMap((name) => name.split(/[\s-]+/u))]) {
    const plain = word.replace(/[^\p{L}]/gu, '');
    if (plain === '' || nameKey(plain) === plain.toUpperCase()) continue;
    const key = nameKey(plain);
    const set = forms.get(key) ?? new Set<string>();
    set.add(plain.toLowerCase());
    forms.set(key, set);
  }
  const dictionary = new Map<string, string>();
  for (const [key, set] of forms) if (set.size === 1) dictionary.set(key, [...set][0] ?? '');
  return dictionary;
}

const ROMAN = /^(X{1,3}(IX|IV|V?I{0,3})|IX|IV|V?I{1,3}|V)$/u;
const VOWELS = /[AEIOUÁÉÍÓÚÜ]/u;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Una palabra en mayúsculas, sin signos, a su forma en tipo título. */
function titleWord(
  word: string,
  isFirst: boolean,
  isAcronymContext: boolean,
  dictionary: ReadonlyMap<string, string>,
): string {
  if (word === '' || /\d/u.test(word)) return word;
  if (SMALL_WORDS.has(word) && !isFirst) return word.toLowerCase();
  if (TITLE_ABBREVIATIONS[word] !== undefined) return TITLE_ABBREVIATIONS[word];
  if (
    isAcronymContext ||
    ACRONYMS.has(word) ||
    ROMAN.test(word) ||
    !VOWELS.test(word) ||
    (word.length === 1 && !SMALL_WORDS.has(word))
  ) {
    return word;
  }
  const key = nameKey(word);
  const known = key === word ? dictionary.get(key) : undefined;
  if (known !== undefined) return capitalize(known);
  let lower = word.toLowerCase();
  // Las palabras agudas en -ción, -sión y -gión siempre llevan acento (y sus plurales no).
  if (key === word && /(?:C|S|G)ION$/u.test(word) && word.length > 4) {
    lower = `${lower.slice(0, -2)}ón`;
  }
  return capitalize(lower);
}

/**
 * Nombre en tipo título para mostrar. Si el directorio ya lo trae con minúsculas, se respeta; si
 * viene todo en mayúsculas, se convierte con cuidado de las siglas: las que están en la lista, las
 * que no tienen vocales («CV», «SNC»), los números romanos, las que van entre paréntesis o después
 * de un guion («… - OOAPAS») y las de letras con punto («S.A.»).
 */
export function displayName(original: string, dictionary: ReadonlyMap<string, string>): string {
  const clean = original.replace(/\s+/gu, ' ').trim();
  if (clean !== clean.toUpperCase()) return clean;
  const tokens = clean.split(' ');
  let afterDash = false;
  return tokens
    .map((token, index) => {
      const match = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(token);
      const [, lead = '', core = '', trail = ''] = match ?? [];
      const isParenthesized = lead.includes('(') && trail.includes(')');
      const isAcronymContext = isParenthesized || afterDash;
      afterDash = /-$/u.test(token);
      // «S.A.», «C.V.», «A.C.»: letras sueltas con punto.
      if (/^(\p{L}\.)+\p{L}?$/u.test(core)) return `${lead}${core}${trail}`;
      const parts = core.split(/([-.])/u);
      const body = parts
        .map((part, partIndex) =>
          part === '-' || part === '.'
            ? part
            : titleWord(part, index === 0 && partIndex === 0, isAcronymContext, dictionary),
        )
        .join('');
      return `${lead}${body}${trail}`;
    })
    .join(' ');
}

/** Correos y números de 7 o más dígitos: no son parte del nombre de una institución. */
function hasContactData(name: string): boolean {
  return /@|\d{7,}/u.test(name.replace(/\s+/gu, ''));
}

/** Resultado de construir el catálogo, con cifras para el reporte. */
export interface BuildResult {
  entidades: Record<string, CatalogRow[]>;
  cifras: {
    registros: number;
    entes: number;
    duplicados: number;
    descartados: number;
    /** Entes fuera por la lista local de términos del repositorio (ver `localExcludedTerms`). */
    excluidosPorLista: number;
    municipioInvalido: number;
    porOrden: Record<LevelCode, number>;
  };
}

/**
 * Construye el catálogo: valida entidad, orden y municipio (contra el catálogo del INEGI), une
 * duplicados por (entidad, municipio, nombre sin acentos ni signos) conservando todos los ids de
 * la PDN y da a cada ente el id estable `PDN-<entidad>-<id menor de la PDN>`.
 */
export function buildCatalog(
  records: readonly PdnEnte[],
  excludedTerms: readonly string[] = [],
): BuildResult {
  const states = new Set(['00', ...STATES.map((state) => state.code)]);
  const dictionary = buildAccentDictionary([
    ...STATES.map((state) => state.name),
    ...Object.values(MUNICIPALITIES_BY_STATE).flatMap((rows) => rows.map(([, name]) => name)),
  ]);
  const groups = new Map<
    string,
    { level: LevelCode; state: string; town: string | null; items: PdnEnte[] }
  >();
  let discarded = 0;
  let excluded = 0;
  let invalidTown = 0;
  for (const record of records) {
    const level = LEVELS[record.ambitoGobierno];
    const state = String(record.entidad ?? '');
    const name = String(record.nombre ?? '')
      .replace(/\s+/gu, ' ')
      .trim();
    const isFederalMismatch = (level === 'F') !== (state === '00');
    if (
      !Number.isInteger(record.id) ||
      level === undefined ||
      !states.has(state) ||
      isFederalMismatch ||
      nameKey(name) === '' ||
      hasContactData(name)
    ) {
      discarded += 1;
      continue;
    }
    const lower = name.toLowerCase();
    if (excludedTerms.some((term) => lower.includes(term))) {
      excluded += 1;
      continue;
    }
    let town: string | null = null;
    if (record.municipio !== null && record.municipio !== undefined) {
      const match = /^(\d{2})_(\d{3})$/u.exec(record.municipio);
      const rows = MUNICIPALITIES_BY_STATE[state] ?? [];
      if (match !== null && match[1] === state && rows.some(([code]) => code === match[2])) {
        town = match[2] ?? null;
      } else {
        invalidTown += 1;
      }
    }
    const key = `${state}|${town ?? ''}|${nameKey(name)}`;
    const group = groups.get(key) ?? { level, state, town, items: [] };
    group.items.push({ ...record, nombre: name });
    groups.set(key, group);
  }
  const entidades: Record<string, CatalogRow[]> = {};
  const byLevel: Record<LevelCode, number> = { F: 0, E: 0, M: 0 };
  let duplicates = 0;
  for (const group of groups.values()) {
    const items = [...group.items].sort((a, b) => a.id - b.id);
    duplicates += items.length - 1;
    // Del grupo se muestra el nombre con más acentos (el mejor escrito); en empate, el de id menor.
    const accents = (text: string) => text.match(/[^\p{ASCII}]/gu)?.length ?? 0;
    const best = [...items].sort((a, b) => accents(b.nombre) - accents(a.nombre) || a.id - b.id)[0];
    const first = items[0];
    if (best === undefined || first === undefined) continue;
    const shown = displayName(best.nombre, dictionary);
    const row: CatalogRow = [
      `PDN-${group.state}-${first.id}`,
      shown,
      group.level,
      group.town,
      items.map((item) => item.id),
    ];
    if (shown !== best.nombre) row.push(best.nombre);
    (entidades[group.state] ??= []).push(row);
    byLevel[group.level] += 1;
  }
  for (const rows of Object.values(entidades)) {
    rows.sort((a, b) => a[1].localeCompare(b[1], 'es') || a[0].localeCompare(b[0]));
  }
  const sorted = Object.fromEntries(
    Object.entries(entidades).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    entidades: sorted,
    cifras: {
      registros: records.length,
      entes: byLevel.F + byLevel.E + byLevel.M,
      duplicados: duplicates,
      descartados: discarded,
      excluidosPorLista: excluded,
      municipioInvalido: invalidTown,
      porOrden: byLevel,
    },
  };
}

/**
 * Términos de la lista local que el gancho de commit no deja publicar (`.forbidden-terms.local`, no
 * versionada; ver scripts/check-forbidden-terms.mjs). Un ente cuyo nombre la toca se excluye para
 * que el catálogo pueda versionarse; el reporte dice cuántos.
 */
export function localExcludedTerms(root: string = ROOT): string[] {
  const path = join(root, '.forbidden-terms.local');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

async function readSource(source: string): Promise<string> {
  if (/^https?:\/\//u.test(source)) {
    // Una sola petición con el directorio completo (sin paginar).
    const response = await fetch(`${source}?limit=-1`);
    if (!response.ok) throw new Error(`El directorio de la PDN respondió ${response.status}.`);
    return response.text();
  }
  return readFileSync(source, 'utf8');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dateAt = args.indexOf('--fecha');
  const date = dateAt >= 0 ? args[dateAt + 1] : new Date().toISOString().slice(0, 10);
  const source =
    args.find((arg, index) => !arg.startsWith('--') && index !== dateAt + 1) ?? DEFAULT_SOURCE;
  if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error('Fecha inválida.');
  const text = await readSource(source);
  const records = (JSON.parse(text) as { data: PdnEnte[] }).data;
  const { entidades, cifras } = buildCatalog(records, localExcludedTerms());
  const output = {
    version: 1,
    fuente: {
      nombre:
        'Directorio de entes públicos de la Plataforma Digital Nacional (cobertura de la PDN)',
      url: DEFAULT_SOURCE,
      descargado: date,
      sha256: createHash('sha256').update(text).digest('hex'),
    },
    formato: {
      ente: ['id', 'nombre', 'ordenGobierno', 'municipio', 'idsPdn', 'nombrePdn?'],
      ordenGobierno: { F: 'federal', E: 'estatal', M: 'municipal' },
    },
    cifras,
    entidades,
  };
  writeFileSync(OUTPUT, `${JSON.stringify(output)}\n`);
  process.stdout.write(
    `Entes: ${cifras.entes} de ${cifras.registros} registros (${cifras.duplicados} duplicados unidos, ${cifras.descartados} descartados, ${cifras.excluidosPorLista} excluidos por la lista local, ${cifras.municipioInvalido} con municipio inválido).\n`,
  );
}

if (import.meta.main ?? process.argv[1] === import.meta.filename) await main();
