// Diccionario de datos del Estándar S5 con el formato de los diccionarios oficiales de la PDN (S2,
// abril de 2023): un encabezado con el nombre, el objetivo, la fecha de última actualización y la
// liga al Swagger, y una fila por campo con `Path, Variable, Obligatorio, Formato, Tipo de dato,
// Público, Descripción`; al final, columnas propias (esquema, restricciones, valores permitidos y
// ejemplo). Se deriva de los mismos esquemas JSON del documento OpenAPI y de los ejemplos.
import {
  API_ERROR_DESCRIPTIONS,
  API_ERROR_HTTP_STATUS,
  API_ERROR_MESSAGES,
  ApiErrorCodeSchema,
  CLOSURE_REASONS,
  COMPLAINT_STATUSES,
  DEADLINE_RULES,
  LEGAL_STAGES,
  MANAGEMENT_STATES,
  OFFICIAL_REST_DAYS,
  OFFICIAL_REST_DAYS_COVERAGE,
  PROCEDURE_ACTORS,
  MAX_REASSIGNMENTS,
  TURN_SEMAPHORE,
  TURN_SEMAPHORE_STATUSES,
  formatLegalReference,
} from '@sigilo/contracts';
import { STANDARD_DATE, STANDARD_VERSION } from '@sigilo/contracts/standard';
import type { StandardComponentName } from '@sigilo/contracts/standard';
import type { JsonObject } from './openapi.ts';
import {
  PUBLISHED_COMPONENTS,
  PUBLISHED_EXAMPLES,
  PUBLISHED_EXTRA_EXAMPLES,
  PUBLISHED_OPERATIONS,
} from './published.ts';

/** Fila del diccionario. `path` es la ruta del campo dentro del esquema (`facts.stateCode`). */
export interface DictionaryRow {
  schema: string;
  path: string;
  name: string;
  /** Tipo con el estilo propio del estándar (`cadena (ComplaintMode)`). */
  type: string;
  /** Restricciones: patrón, longitudes, mínimos y máximos. */
  format: string;
  isRequired: boolean;
  description: string;
  allowed: string;
  example: string;
  /** «Formato» del diccionario de la PDN: Alfanumérico, Numérico, Fecha en formato ISO 8601… */
  pdnFormat: string;
  /** «Tipo de dato» del diccionario de la PDN, al estilo JSON: String, Number, Object… */
  pdnType: string;
  /** Si el dato se publica (columna «Público»). */
  isPublic: boolean;
}

/** Encabezado del diccionario, como el de los diccionarios oficiales de la PDN. */
export interface DictionaryHeader {
  name: string;
  objective: string;
  /** Liga al Swagger UI, relativa a `estandar/`. */
  swaggerLink: string;
}

/**
 * Esquemas cuyos datos se publican: el registro público, las llaves, el directorio y la red, los
 * datos abiertos, la estadística de la PDN y los catálogos. Todo lo demás (la denuncia, la
 * identidad, el contacto, el seguimiento, los mensajes y la bandeja de la autoridad) no es público.
 */
const PUBLIC_COMPONENTS: ReadonlySet<string> = new Set([
  'LedgerPage',
  'LedgerEvent',
  'SignedLedgerHead',
  'PublicKeySet',
  'PowChallenge',
  'ApiError',
  'ComplaintMode',
  'ComplaintStatus',
  'LedgerEventType',
  'PowPurpose',
  'ManagementState',
  'ClosureReason',
  'LegalTrack',
  'LegalStage',
  'ProcedureActor',
  'DeadlineKey',
  'DeadlineUnit',
  'DeadlineStatus',
  'TurnSemaphoreStatus',
  'TurnWait',
  'ProcedureAction',
  'OffenseSeverity',
  'EscalationRuleKey',
  'RuleEffect',
  'AuthorityFunction',
  'SignedAuthorityDirectory',
  'AuthorityDirectory',
  'DirectoryNode',
  'DirectoryAuthority',
  'AuthorityCompetence',
  'DirectoryObserver',
  'SignedFunctionTable',
  'FunctionTable',
  'FunctionRule',
  'FunctionHolder',
  'WitnessPolicy',
  'WitnessSignature',
  'NetworkTrustAnchor',
  'NationalLedgerEntry',
  'NationalHead',
  'CosignedNationalHead',
  'NationalLedgerPage',
  'NationalInclusionProof',
  'NationalOpenData',
  'NationalOpenDataNode',
  'NationalOpenDataCell',
  'NetworkHealth',
  'NetworkHealthNode',
  'PdnError',
  'PdnStatisticsResponse',
  'PdnPagination',
  'PdnStatisticsRow',
  'PdnAuthorities',
  'PdnAuthority',
  'NationalStatistics',
  'NationalStatisticsNode',
  'CorroborationEvaluatorKey',
  'DirectoryCorroboration',
  'CorroborationIdentifierKind',
  'CorroborationStatus',
  'IndexWithdrawalReason',
]);

const REF_PREFIX = '#/components/schemas/';
const MAX_EXAMPLE_LENGTH = 48;

/** Cómo se nombra cada catálogo de valores en la columna de valores permitidos. */
const CATALOG_LABELS: Readonly<Record<string, string>> = {
  STATES: 'Catálogo STATES: 32 entidades federativas con clave INEGI (01 a 32)',
  MUNICIPALITIES: 'Catálogo MUNICIPALITIES: claves INEGI de municipio de la entidad',
  PUBLIC_ENTITIES:
    'Catálogo de entes públicos: los reales del directorio de la PDN (PDN-<entidad>-<id>) y los ficticios de la demostración (VE-…)',
  OFFENSES: 'Catálogo OFFENSES: conductas de la LGRA y del Código Penal Federal (LEY-artículo)',
};

const ENUM_NAMES: Partial<Record<StandardComponentName, readonly { key: string; name: string }[]>> =
  {
    ComplaintStatus: COMPLAINT_STATUSES,
    ManagementState: MANAGEMENT_STATES,
    ClosureReason: CLOSURE_REASONS,
    LegalStage: LEGAL_STAGES,
    ProcedureActor: PROCEDURE_ACTORS,
    DeadlineKey: DEADLINE_RULES,
  };

const TYPE_LABELS: Readonly<Record<string, string>> = {
  string: 'cadena',
  integer: 'entero',
  number: 'número',
  boolean: 'booleano',
  object: 'objeto',
  array: 'arreglo',
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function refName(schema: JsonObject): string | undefined {
  const ref = schema.$ref;
  return typeof ref === 'string' && ref.startsWith(REF_PREFIX)
    ? ref.slice(REF_PREFIX.length)
    : undefined;
}

function firstParagraph(text: unknown): string {
  return typeof text === 'string' ? (text.split('\n\n')[0] ?? '') : '';
}

function typeOf(schema: JsonObject): string {
  if (schema.const !== undefined) return TYPE_LABELS[typeof schema.const] ?? 'valor fijo';
  return typeof schema.type === 'string' ? (TYPE_LABELS[schema.type] ?? schema.type) : 'valor';
}

const SAFE_LIMIT = Number.MAX_SAFE_INTEGER;

function formatOf(schema: JsonObject): string {
  const parts: string[] = [];
  if (typeof schema.pattern === 'string') parts.push(`patrón \`${schema.pattern}\``);
  const { minLength, maxLength, minimum, maximum, maxItems } = schema;
  if (typeof minLength === 'number' && typeof maxLength === 'number') {
    parts.push(`de ${minLength} a ${maxLength} caracteres`);
  } else if (typeof maxLength === 'number') {
    parts.push(`hasta ${maxLength} caracteres`);
  } else if (typeof minLength === 'number') {
    parts.push(`al menos ${minLength} caracteres`);
  }
  const hasMin = typeof minimum === 'number' && minimum > -SAFE_LIMIT;
  const hasMax = typeof maximum === 'number' && maximum < SAFE_LIMIT;
  if (hasMin && hasMax) parts.push(`de ${String(minimum)} a ${String(maximum)}`);
  else if (hasMin) parts.push(`mínimo ${String(minimum)}`);
  else if (hasMax) parts.push(`máximo ${String(maximum)}`);
  if (typeof maxItems === 'number') parts.push(`hasta ${maxItems} elementos`);
  if (schema.const !== undefined) parts.push(`valor fijo \`${String(schema.const)}\``);
  return parts.join('; ');
}

const PDN_TYPES: Readonly<Record<string, string>> = {
  string: 'String',
  integer: 'Number',
  number: 'Number',
  boolean: 'Boolean',
  object: 'Object',
  array: 'Array',
};

const DATE_TIME_PATTERNS = new Set(['^\\d{4}-\\d{2}-\\d{2}T\\d{2}:00Z$']);
const DATE_PATTERNS = new Set(['^\\d{4}-\\d{2}-\\d{2}$']);
const MONTH_PATTERNS = new Set(['^\\d{4}-(0[1-9]|1[0-2])$']);

/** Tipo JSON de un esquema (`string`, `object`…), siguiendo `const`, `enum` y ramas con `null`. */
function jsonType(schema: JsonObject): string | undefined {
  if (schema.const !== undefined)
    return typeof schema.const === 'number' ? 'number' : typeof schema.const;
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.enum)) return typeof schema.enum[0];
  const branches = Array.isArray(schema.anyOf)
    ? schema.anyOf
    : Array.isArray(schema.oneOf)
      ? schema.oneOf
      : [];
  const types = branches
    .filter(isObject)
    .map((branch) => (branch.type === 'null' ? undefined : jsonType(branch)))
    .filter((type): type is string => type !== undefined);
  return types.length > 0 && types.every((type) => type === types[0]) ? types[0] : undefined;
}

/** «Formato» y «Tipo de dato» del diccionario de la PDN. */
function pdnColumns(schema: JsonObject): { pdnFormat: string; pdnType: string } {
  const pattern = typeof schema.pattern === 'string' ? schema.pattern : '';
  if (DATE_TIME_PATTERNS.has(pattern))
    return { pdnFormat: 'Fecha y hora en formato ISO 8601', pdnType: 'Date Time' };
  if (DATE_PATTERNS.has(pattern))
    return { pdnFormat: 'Fecha en formato ISO 8601', pdnType: 'Date' };
  if (MONTH_PATTERNS.has(pattern))
    return { pdnFormat: 'Año y mes en formato ISO 8601 (AAAA-MM)', pdnType: 'String' };
  const type = jsonType(schema);
  const isEnum = Array.isArray(schema.enum) || schema.const !== undefined;
  const pdnType =
    type === undefined
      ? 'Valor'
      : `${PDN_TYPES[type] ?? type}${isEnum && type === 'string' ? ' (enum)' : ''}`;
  switch (type) {
    case 'string':
      return { pdnFormat: 'Alfanumérico', pdnType };
    case 'integer':
    case 'number':
      return { pdnFormat: 'Numérico', pdnType };
    case 'boolean':
      return { pdnFormat: 'Booleano', pdnType };
    case 'object':
      return { pdnFormat: 'Objeto', pdnType };
    case 'array':
      return { pdnFormat: 'Arreglo', pdnType };
    default:
      return { pdnFormat: 'Valor', pdnType };
  }
}

function allowedOf(schema: JsonObject, component?: string): string {
  const catalog = schema['x-catalog'];
  if (typeof catalog === 'string') return CATALOG_LABELS[catalog] ?? `Catálogo ${catalog}`;
  if (!Array.isArray(schema.enum)) return '';
  const names =
    component === undefined ? undefined : ENUM_NAMES[component as StandardComponentName];
  return schema.enum
    .map((value) => {
      const name = names?.find((entry) => entry.key === value)?.name;
      return name === undefined ? String(value) : `${String(value)} (${name})`;
    })
    .join('; ');
}

function exampleOf(schema: JsonObject, value: unknown): string {
  const chosen =
    value !== undefined ? value : Array.isArray(schema.examples) ? schema.examples[0] : undefined;
  if (chosen === undefined || isObject(chosen) || Array.isArray(chosen)) return '';
  const text = String(chosen);
  return text.length > MAX_EXAMPLE_LENGTH ? `${text.slice(0, MAX_EXAMPLE_LENGTH - 1)}…` : text;
}

/** Recorre un ejemplo junto con su esquema y guarda el primer valor de cada componente citado. */
function collectExamples(
  schema: JsonObject,
  value: unknown,
  components: Record<string, JsonObject>,
  found: Map<string, unknown>,
): void {
  const name = refName(schema);
  if (name !== undefined) {
    if (!found.has(name)) found.set(name, value);
    const target = components[name];
    if (target !== undefined) collectExamples(target, value, components, found);
    return;
  }
  if (isObject(schema.properties) && isObject(value)) {
    for (const [key, property] of Object.entries(schema.properties)) {
      if (isObject(property) && key in value) {
        collectExamples(property, value[key], components, found);
      }
    }
  }
  if (isObject(schema.items) && Array.isArray(value) && value.length > 0) {
    collectExamples(schema.items, value[0], components, found);
  }
}

/** Ejemplo de cada componente, tomado de los cuerpos de las operaciones y de `EXTRA_EXAMPLES`. */
export function componentExamples(components: Record<string, JsonObject>): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const visit = (component: string, example: string, isArray: boolean): void => {
    const value: unknown = PUBLISHED_EXAMPLES[example];
    const reference = { $ref: `${REF_PREFIX}${component}` };
    collectExamples(
      isArray ? { type: 'array', items: reference } : reference,
      value,
      components,
      found,
    );
  };
  for (const operation of PUBLISHED_OPERATIONS) {
    for (const body of [operation.requestBody, operation.success.body]) {
      if (body?.kind === 'json') visit(body.component, body.example, body.isArray === true);
    }
  }
  for (const [component, example] of Object.entries(PUBLISHED_EXTRA_EXAMPLES))
    visit(component, example, false);
  return found;
}

function walk(
  rows: DictionaryRow[],
  context: { component: string; components: Record<string, JsonObject> },
  schema: JsonObject,
  path: string,
  isRequired: boolean,
  value: unknown,
): void {
  const name = path.split('.').at(-1)?.replace('[]', '') ?? '';
  const base = {
    schema: context.component,
    path,
    name,
    isRequired,
    isPublic: PUBLIC_COMPONENTS.has(context.component),
  };
  const reference = refName(schema);
  if (reference !== undefined) {
    const target = context.components[reference] ?? {};
    const columns = pdnColumns(target);
    rows.push({
      ...base,
      pdnFormat: columns.pdnFormat,
      pdnType: columns.pdnType === 'Object' ? `Object (${reference})` : columns.pdnType,
      type: `${typeOf(target)} (${reference})`,
      format: '',
      description: firstParagraph(schema.description ?? target.description),
      allowed: allowedOf(target, reference),
      example: exampleOf(target, value),
    });
    return;
  }
  if (schema.type === 'array') {
    const items = isObject(schema.items) ? schema.items : {};
    const itemReference = refName(items);
    const itemType = itemReference ?? typeOf(items);
    const itemFormat = itemReference === undefined ? formatOf(items) : '';
    rows.push({
      ...base,
      pdnFormat: 'Arreglo',
      pdnType:
        itemReference === undefined
          ? `Array of ${pdnColumns(items).pdnType}`
          : `Array of ${itemReference}`,
      type: `arreglo de ${itemType}`,
      format: [formatOf(schema), itemFormat && `cada elemento: ${itemFormat}`]
        .filter(Boolean)
        .join('; '),
      description: firstParagraph(schema.description),
      allowed: allowedOf(items),
      example: '',
    });
    if (itemReference === undefined && isObject(items.properties)) {
      const first = Array.isArray(value) ? value[0] : undefined;
      walkProperties(rows, context, items, `${path}[]`, first);
    }
    return;
  }
  if (isObject(schema.properties)) {
    if (path !== '') {
      rows.push({
        ...base,
        pdnFormat: 'Objeto',
        pdnType: 'Object',
        type: 'objeto',
        format: '',
        description: firstParagraph(schema.description),
        allowed: '',
        example: '',
      });
    }
    walkProperties(rows, context, schema, path, value);
    return;
  }
  rows.push({
    ...base,
    ...pdnColumns(schema),
    type: typeOf(schema),
    format: formatOf(schema),
    description: firstParagraph(schema.description),
    allowed: allowedOf(schema, path === '' ? context.component : undefined),
    example: exampleOf(schema, value),
  });
}

function walkProperties(
  rows: DictionaryRow[],
  context: { component: string; components: Record<string, JsonObject> },
  schema: JsonObject,
  prefix: string,
  value: unknown,
): void {
  const properties = isObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const [key, property] of Object.entries(properties)) {
    if (!isObject(property)) continue;
    const child = isObject(value) ? value[key] : undefined;
    walk(
      rows,
      context,
      property,
      prefix === '' ? key : `${prefix}.${key}`,
      required.includes(key),
      child,
    );
  }
}

/** Filas del diccionario, componente por componente: primero los del nodo y luego los de la red. */
export function buildDictionaryRows(components: Record<string, JsonObject>): DictionaryRow[] {
  const examples = componentExamples(components);
  const rows: DictionaryRow[] = [];
  for (const component of Object.keys(PUBLISHED_COMPONENTS)) {
    const schema = components[component];
    if (schema === undefined) throw new Error(`Falta el componente ${component}.`);
    walk(rows, { component, components }, schema, '', true, examples.get(component));
  }
  return rows;
}

/** Columnas del diccionario oficial de la PDN (S2, abril de 2023) y, al final, las propias. */
const CSV_HEADERS = [
  'Path',
  'Variable',
  'Obligatorio',
  'Formato',
  'Tipo de dato',
  'Público',
  'Descripción',
  'Esquema',
  'Restricciones',
  'Valores permitidos',
  'Ejemplo',
];

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function plain(text: string): string {
  return text.replaceAll('`', '');
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Fecha del estándar como la escriben los diccionarios de la PDN: «12 de noviembre de 2026». */
export function standardDateText(): string {
  const [year = '', month = '1', day = '1'] = STANDARD_DATE.split('-');
  return `${Number(day)} de ${MONTHS[Number(month) - 1] ?? ''} de ${year}`;
}

/**
 * Ruta del objeto que contiene el campo, al estilo JSON Pointer de la PDN, con el esquema al
 * principio: `facts.stateCode` de `SubmitComplaintRequest` da `/SubmitComplaintRequest/facts`.
 */
export function pointerOf(row: Pick<DictionaryRow, 'schema' | 'path'>): string {
  const parents = row.path === '' ? [] : row.path.split('.').slice(0, -1);
  return ['', row.schema, ...parents.map((part) => part.replace('[]', ''))].join('/');
}

function variableOf(row: DictionaryRow): string {
  return row.path === '' ? '(valor)' : row.name;
}

/** Líneas del encabezado, como las del diccionario oficial del S2. */
function headerLines(header: DictionaryHeader): [string, string][] {
  return [
    ['Nombre', header.name],
    ['Objetivo', header.objective],
    ['Fecha de última actualización', standardDateText()],
    ['Versión del estándar', STANDARD_VERSION],
    ['Liga swagger', header.swaggerLink],
  ];
}

/** Diccionario en CSV (RFC 4180, UTF-8, separador coma) con el encabezado de la PDN. */
export function dictionaryToCsv(rows: readonly DictionaryRow[], header: DictionaryHeader): string {
  const lines = headerLines(header).map((cells) => cells.map(csvCell).join(','));
  lines.push(CSV_HEADERS.join(','));
  for (const row of rows) {
    const cells = [
      pointerOf(row),
      variableOf(row),
      row.isRequired ? 'Sí' : 'No',
      row.pdnFormat,
      row.pdnType,
      row.isPublic ? 'Sí' : 'No',
      plain(row.description),
      row.schema,
      plain(row.format),
      row.allowed,
      row.example,
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function mdCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function mdTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
  ];
  return lines.join('\n');
}

function code(value: string): string {
  return value === '' ? '' : `\`${value}\``;
}

/** Opciones del diccionario en Markdown. */
export interface MarkdownOptions {
  header: DictionaryHeader;
  /** Archivo CSV con la misma información. */
  csvFile: string;
  /** Esquemas a incluir, en orden (por omisión, todos). */
  components?: readonly string[];
  /** Si incluye los catálogos del trámite y los códigos de error (solo el diccionario completo). */
  withCatalogs: boolean;
}

/** Diccionario en Markdown, con las tablas de campos, los catálogos del trámite y los errores. */
export function dictionaryToMarkdown(
  rows: readonly DictionaryRow[],
  components: Record<string, JsonObject>,
  options: MarkdownOptions,
): string {
  const sections: string[] = [
    `# Diccionario de datos: ${options.header.name}`,
    '',
    ...headerLines(options.header).map(([label, value]) =>
      label === 'Liga swagger'
        ? `- **${label}:** [${value}](${value})`
        : `- **${label}:** ${value}`,
    ),
    '',
    `Archivo generado con \`npm run standard:build\` desde \`packages/contracts\`; no se edita a mano. La misma información está en \`${options.csvFile}\`, con el encabezado y las columnas de los diccionarios oficiales de la PDN (\`Path, Variable, Obligatorio, Formato, Tipo de dato, Público, Descripción\`) y, al final, las propias del estándar.`,
    '',
    'Cada tabla describe un esquema. `Path` es la ruta del objeto que contiene el campo, al estilo JSON Pointer y con el esquema al principio; los elementos de un arreglo no llevan índice. `Público` dice si el dato se publica (registro público, directorio y red, datos abiertos o estadística de la PDN): la identidad, el contacto, los hechos, los mensajes y los testigos nunca son públicos. Un tipo con un nombre entre paréntesis remite a la tabla de ese esquema. Las fechas se redondean al día o a la hora en UTC para reducir la correlación temporal. Los ejemplos son sintéticos.',
    '',
    '## Esquemas',
  ];
  for (const component of options.components ?? Object.keys(PUBLISHED_COMPONENTS)) {
    const own = rows.filter((row) => row.schema === component);
    sections.push(
      '',
      `### ${component}`,
      '',
      firstParagraph(components[component]?.description),
      '',
      mdTable(
        [
          'Path',
          'Variable',
          'Obligatorio',
          'Formato',
          'Tipo de dato',
          'Público',
          'Descripción',
          'Restricciones',
          'Valores permitidos o catálogo',
          'Ejemplo',
        ],
        own.map((row) => [
          code(pointerOf(row)),
          row.path === '' ? '(valor)' : code(row.name),
          row.isRequired ? 'Sí' : 'No',
          row.pdnFormat,
          row.pdnType,
          row.isPublic ? 'Sí' : 'No',
          row.description,
          row.format,
          row.allowed,
          code(row.example),
        ]),
      ),
    );
  }
  if (!options.withCatalogs) {
    sections.push('');
    return sections.join('\n');
  }
  sections.push(
    '',
    '## Catálogo del trámite',
    '',
    'El trámite tiene dos capas: el flujo de gestión del S5 (buzón general, turno y cierre) y las etapas legales. El estatus de la API v1 (`ComplaintStatus`) se ubica en ambas. Los mismos datos están en `catalogo-del-tramite.json`.',
    '',
    '### Flujo de gestión',
    '',
    mdTable(
      ['Clave', 'Nombre', 'Qué significa', 'Quién actúa', 'Puede pasar a', 'Plazos', 'Fundamento'],
      MANAGEMENT_STATES.map((state) => [
        code(state.key),
        state.name,
        state.explanation,
        state.actors.map(actorName).join(', '),
        state.next.map(code).join(', '),
        state.deadlines.map(code).join(', '),
        state.legalBasis.map(formatLegalReference).join('; '),
      ]),
    ),
    '',
    '### Motivos de cierre',
    '',
    mdTable(
      ['Clave', 'Nombre', 'Qué significa'],
      CLOSURE_REASONS.map((reason) => [code(reason.key), reason.name, reason.explanation]),
    ),
    '',
    '### Etapas legales',
    '',
    mdTable(
      ['Clave', 'Vía', 'Nombre', 'Qué significa', 'Quién actúa', 'Plazos', 'Fundamento'],
      LEGAL_STAGES.map((stage) => [
        code(stage.key),
        stage.track === 'administrative' ? 'Falta administrativa' : 'Hecho de corrupción',
        stage.name,
        stage.explanation,
        stage.actors.map(actorName).join(', '),
        stage.deadlines.map(code).join(', '),
        stage.legalBasis.map(formatLegalReference).join('; '),
      ]),
    ),
    '',
    '### Plazos legales',
    '',
    'Los días naturales cuentan todos los días; los hábiles saltan sábados, domingos y los días inhábiles del calendario. Todo plazo empieza a contar el día siguiente al acto.',
    '',
    mdTable(
      ['Clave', 'Plazo', 'Duración', 'Desde', 'Si vence', 'Aviso previo', 'Fundamento'],
      DEADLINE_RULES.map((rule) => [
        code(rule.key),
        rule.name,
        termText(rule.amount, rule.maxAmount, rule.unit),
        rule.startsFrom,
        rule.consequence,
        termText(rule.warning.amount, undefined, rule.warning.unit),
        rule.legalBasis.map(formatLegalReference).join('; '),
      ]),
    ),
    '',
    '### Estatus de la API v1',
    '',
    mdTable(
      ['Clave', 'Nombre', 'Qué significa', 'Flujo de gestión', 'Etapa legal'],
      COMPLAINT_STATUSES.map((status) => [
        code(status.key),
        status.name,
        status.explanation,
        code(status.managementState),
        code(status.legalStage ?? ''),
      ]),
    ),
    '',
    '### Quién actúa',
    '',
    mdTable(
      ['Clave', 'Nombre', 'Descripción'],
      PROCEDURE_ACTORS.map((actor) => [code(actor.key), actor.name, actor.explanation]),
    ),
    '',
    '### Días inhábiles oficiales',
    '',
    `Además de sábados y domingos, el cálculo de días hábiles usa esta lista (${OFFICIAL_REST_DAYS_COVERAGE.from} a ${OFFICIAL_REST_DAYS_COVERAGE.through}). Cada autoridad agrega en su configuración los días que declare inhábiles por acuerdo publicado.`,
    '',
    mdTable(
      ['Día', 'Nombre', 'Fundamento'],
      OFFICIAL_REST_DAYS.map((day) => [day.day, day.name, day.basis]),
    ),
    '',
    '## Códigos de error',
    '',
    mdTable(
      ['Código', 'HTTP', 'Mensaje', 'Cuándo'],
      ApiErrorCodeSchema.options.map((errorCode) => [
        code(errorCode),
        String(API_ERROR_HTTP_STATUS[errorCode]),
        API_ERROR_MESSAGES[errorCode],
        API_ERROR_DESCRIPTIONS[errorCode],
      ]),
    ),
    '',
  );
  return sections.join('\n');
}

function actorName(key: string): string {
  return PROCEDURE_ACTORS.find((actor) => actor.key === key)?.name ?? key;
}

const UNIT_NAMES: Readonly<Record<string, string>> = {
  natural_days: 'días naturales',
  business_days: 'días hábiles',
  months: 'meses',
  years: 'años',
};

function termText(amount: number, maxAmount: number | undefined, unit: string): string {
  const range = maxAmount === undefined ? String(amount) : `${amount} a ${maxAmount}`;
  return `${range} ${UNIT_NAMES[unit] ?? unit}`;
}

/** Catálogo del trámite en JSON, para quien implemente el estándar sin TypeScript. */
export function buildProcedureCatalog(): JsonObject {
  return {
    standardVersion: STANDARD_VERSION,
    managementStates: MANAGEMENT_STATES,
    closureReasons: CLOSURE_REASONS,
    legalStages: LEGAL_STAGES,
    actors: PROCEDURE_ACTORS,
    deadlines: DEADLINE_RULES,
    complaintStatuses: COMPLAINT_STATUSES,
    turnSemaphore: { ...TURN_SEMAPHORE, statuses: TURN_SEMAPHORE_STATUSES },
    maxReassignments: MAX_REASSIGNMENTS,
    officialRestDays: { coverage: OFFICIAL_REST_DAYS_COVERAGE, days: OFFICIAL_REST_DAYS },
  };
}
