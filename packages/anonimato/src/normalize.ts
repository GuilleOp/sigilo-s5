// Normalización de nombres de ente y de área: réplica exacta de datos/proceso/pdn/normalize.py.
// Debe dar las mismas cadenas que Python; normalize.test.ts lo comprueba contra el propio proceso.

/** Clave INEGI de lo federal (Administración Pública Federal y autónomos nacionales). */
export const FEDERAL_STATE_CODE = '00';

const STOPWORDS: ReadonlySet<string> = new Set([
  'DE',
  'DEL',
  'LA',
  'LAS',
  'LOS',
  'EL',
  'Y',
  'E',
  'EN',
  'PARA',
  'A',
  'AL',
]);

/** Abreviaturas frecuentes en S1, S2 y S3 (mismo mapa que `ABBREVIATIONS` en Python). */
const ABBREVIATIONS: Readonly<Record<string, string>> = {
  INST: 'INSTITUTO',
  SERVS: 'SERVICIOS',
  SERV: 'SERVICIOS',
  SRIA: 'SECRETARIA',
  SECR: 'SECRETARIA',
  DIR: 'DIRECCION',
  DIRECC: 'DIRECCION',
  SUBDIR: 'SUBDIRECCION',
  GRAL: 'GENERAL',
  DEPTO: 'DEPARTAMENTO',
  DPTO: 'DEPARTAMENTO',
  COORD: 'COORDINACION',
  ADMON: 'ADMINISTRACION',
  ADMVA: 'ADMINISTRATIVA',
  ADMIVA: 'ADMINISTRATIVA',
  MPAL: 'MUNICIPAL',
  NAL: 'NACIONAL',
  EDO: 'ESTADO',
  GOB: 'GOBIERNO',
  UNIV: 'UNIVERSIDAD',
  SIST: 'SISTEMA',
  UNID: 'UNIDAD',
  OFNA: 'OFICINA',
  JUR: 'JURIDICO',
};

const SYSTEM_SUFFIX = /\s+-\s+[a-z0-9_]+$/u;
// Caracteres que trim() de JavaScript y strip() de Python tratan distinto (U+FEFF solo lo quita
// JavaScript; U+001C a U+001F y U+0085 solo Python). Se cambian por espacio antes de recortar
// para que la clave sea idéntica en ambos lenguajes (datos/proceso/pdn/normalize.py).
const EDGE_DIFFERENCES: ReadonlySet<string> = new Set([
  '\uFEFF',
  '\u001C',
  '\u001D',
  '\u001E',
  '\u001F',
  '\u0085',
]);

/** Recorta espacios con el mismo resultado que `clean_edges` en Python. */
function cleanEdges(raw: string): string {
  return Array.from(raw || '', (char) => (EDGE_DIFFERENCES.has(char) ? ' ' : char))
    .join('')
    .trim();
}

const SYSTEM_TAGS: ReadonlySet<string> = new Set(['S1', 'S2', 'S3', 'S6']);

const MUNICIPAL_PREFIXES: readonly (readonly string[])[] = [
  ['AYUNTAMIENTO', 'CONSTITUCIONAL'],
  ['AYUNTAMIENTO', 'MUNICIPAL'],
  ['AYUNTAMIENTO'],
  ['GOBIERNO', 'MUNICIPAL'],
  ['PRESIDENCIA', 'MUNICIPAL'],
  ['MUNICIPIO', 'LIBRE'],
  ['MUNICIPIO'],
];

// Nombres alternos y abreviaturas de cada entidad, como `STATES` en datos/proceso/pdn/entities.py.
const STATE_NAMES_AND_ABBREVIATIONS: Readonly<Record<string, readonly string[]>> = {
  '00': [],
  '01': ['AGUASCALIENTES', 'AGS'],
  '02': ['BAJA CALIFORNIA', 'BC'],
  '03': ['BAJA CALIFORNIA SUR', 'BCS'],
  '04': ['CAMPECHE', 'CAMP'],
  '05': ['COAHUILA ZARAGOZA', 'COAHUILA', 'COAH'],
  '06': ['COLIMA', 'COL'],
  '07': ['CHIAPAS', 'CHIS'],
  '08': ['CHIHUAHUA', 'CHIH'],
  '09': ['CIUDAD MEXICO', 'CDMX'],
  '10': ['DURANGO', 'DGO'],
  '11': ['GUANAJUATO', 'GTO'],
  '12': ['GUERRERO', 'GRO'],
  '13': ['HIDALGO', 'HGO'],
  '14': ['JALISCO', 'JAL'],
  '15': ['MEXICO', 'MEX', 'EDOMEX'],
  '16': ['MICHOACAN OCAMPO', 'MICHOACAN', 'MICH'],
  '17': ['MORELOS', 'MOR'],
  '18': ['NAYARIT', 'NAY'],
  '19': ['NUEVO LEON', 'NL'],
  '20': ['OAXACA', 'OAX'],
  '21': ['PUEBLA', 'PUE'],
  '22': ['QUERETARO ARTEAGA', 'QUERETARO', 'QRO'],
  '23': ['QUINTANA ROO', 'QROO', 'Q ROO'],
  '24': ['SAN LUIS POTOSI', 'SLP'],
  '25': ['SINALOA'],
  '26': ['SONORA', 'SON'],
  '27': ['TABASCO', 'TAB'],
  '28': ['TAMAULIPAS', 'TAMPS'],
  '29': ['TLAXCALA', 'TLAX'],
  '30': ['VERACRUZ IGNACIO LLAVE', 'VERACRUZ', 'VER'],
  '31': ['YUCATAN', 'YUC'],
  '32': ['ZACATECAS', 'ZAC'],
};

// Python ordena con `sorted(key=-palabras)`, que es estable: se conserva el orden original en empates.
const STATE_SUFFIXES: Readonly<Record<string, readonly (readonly string[])[]>> = Object.fromEntries(
  Object.entries(STATE_NAMES_AND_ABBREVIATIONS).map(([code, names]) => [
    code,
    names
      .map((name, index) => ({ words: name.split(' '), index }))
      .sort((a, b) => b.words.length - a.words.length || a.index - b.index)
      .map((item) => item.words),
  ]),
);

function splitTokens(text: string): string[] {
  return text.split(' ').filter((token) => token.length > 0);
}

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index]);
}

/**
 * Quita acentos y signos, pasa a mayúsculas y elimina palabras vacías (`text_key` en Python).
 * NFKD seguido de descartar lo que no es ASCII equivale a `encode('ascii', 'ignore')`.
 */
export function textKey(text: string): string {
  const plain = (text || '')
    .normalize('NFKD')
    .replace(/[^\p{ASCII}]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/gu, ' ');
  return splitTokens(plain)
    .filter((token) => !STOPWORDS.has(token))
    .join(' ');
}

function expand(tokens: readonly string[]): string[] {
  return tokens.map((token) => ABBREVIATIONS[token] ?? token);
}

function stripStateSuffix(input: string[], stateCode: string): string[] {
  const suffixes = STATE_SUFFIXES[stateCode] ?? [];
  let tokens = input;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of suffixes) {
      const size = suffix.length;
      if (tokens.length <= size || !sameTokens(tokens.slice(-size), suffix)) continue;
      let head = tokens.slice(0, -size);
      // «MUNICIPIO AGUASCALIENTES» es el municipio homónimo de la capital: se conserva.
      const last = head[head.length - 1];
      if (last === 'MUNICIPIO' || last === 'AYUNTAMIENTO') continue;
      while (
        head.length > 0 &&
        ['ESTADO', 'GOBIERNO', 'LIBRE', 'SOBERANO'].includes(head[head.length - 1] ?? '')
      ) {
        head = head.slice(0, -1);
      }
      if (head.length > 0) {
        tokens = head;
        changed = true;
        break;
      }
    }
  }
  return tokens;
}

/**
 * Normaliza el nombre de una institución dentro de su entidad (`institution_name_key` en Python).
 * Si el resultado queda vacío, devuelve la forma básica para no perder el ente.
 */
export function institutionNameKey(raw: string, stateCode: string): string {
  const cleaned = cleanEdges(raw).replace(SYSTEM_SUFFIX, '').replaceAll('*', ' ');
  const basic = textKey(cleaned);
  let tokens = expand(splitTokens(basic));
  while (tokens.length > 0 && SYSTEM_TAGS.has(tokens[tokens.length - 1] ?? '')) {
    tokens = tokens.slice(0, -1);
  }
  while (tokens.length > 0 && (tokens[0] === 'H' || tokens[0] === 'HONORABLE')) {
    tokens = tokens.slice(1);
  }
  for (const prefix of MUNICIPAL_PREFIXES) {
    const size = prefix.length;
    if (sameTokens(tokens.slice(0, size), prefix) && tokens.length > size) {
      tokens = ['MUNICIPIO', ...tokens.slice(size)];
      break;
    }
  }
  if (stateCode !== FEDERAL_STATE_CODE) tokens = stripStateSuffix(tokens, stateCode);
  return tokens.join(' ') || basic;
}

/** Clave completa de institución: `<clave INEGI>|<nombre normalizado>` (`institution_key`). */
export function institutionKey(raw: string, stateCode: string): string {
  return `${stateCode}|${institutionNameKey(raw, stateCode)}`;
}

/**
 * Normaliza un área de adscripción (`area_key` en Python): quita códigos de plaza al inicio y
 * expande abreviaturas. No agrupa áreas parecidas: unirlas inflaría el tamaño del grupo.
 */
export function areaKey(raw: string): string {
  const cleaned = cleanEdges(raw).replace(SYSTEM_SUFFIX, '');
  let tokens = splitTokens(textKey(cleaned));
  while (tokens.length > 0 && /[0-9]/u.test(tokens[0] ?? '')) tokens = tokens.slice(1);
  return expand(tokens).join(' ');
}
