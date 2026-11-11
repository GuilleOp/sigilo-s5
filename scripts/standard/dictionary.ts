// Diccionario de datos del Estándar S5 con el formato de la PDN (S1 a S3): una fila por campo con
// ruta, nombre, tipo, formato, obligatoriedad, descripción, valores permitidos y ejemplo. Se deriva
// de los mismos esquemas JSON del documento OpenAPI y de los ejemplos sintéticos.
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
  TURN_SEMAPHORE,
  TURN_SEMAPHORE_STATUSES,
  formatLegalReference,
} from '@sigilo/contracts';
import { STANDARD_VERSION } from '@sigilo/contracts/standard';
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
  type: string;
  format: string;
  isRequired: boolean;
  description: string;
  allowed: string;
  example: string;
}

const REF_PREFIX = '#/components/schemas/';
const MAX_EXAMPLE_LENGTH = 48;

/** Cómo se nombra cada catálogo de valores en la columna de valores permitidos. */
const CATALOG_LABELS: Readonly<Record<string, string>> = {
  STATES: 'Catálogo STATES: 32 entidades federativas con clave INEGI (01 a 32)',
  MUNICIPALITIES: 'Catálogo MUNICIPALITIES: claves INEGI de municipio de la entidad',
  PUBLIC_ENTITIES: 'Catálogo PUBLIC_ENTITIES del despliegue (entes públicos)',
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
  const base = { schema: context.component, path, name, isRequired };
  const reference = refName(schema);
  if (reference !== undefined) {
    const target = context.components[reference] ?? {};
    rows.push({
      ...base,
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

const CSV_HEADERS = [
  'esquema',
  'campo',
  'nombre',
  'tipo',
  'formato',
  'obligatorio',
  'descripcion',
  'valores_permitidos',
  'ejemplo',
];

function csvCell(value: string): string {
  return /[",\n\r]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function plain(text: string): string {
  return text.replaceAll('`', '');
}

/** Diccionario en CSV (RFC 4180, UTF-8, separador coma). */
export function dictionaryToCsv(rows: readonly DictionaryRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    const cells = [
      row.schema,
      row.path === '' ? '(valor)' : row.path,
      row.name === '' ? row.schema : row.name,
      row.type,
      plain(row.format),
      row.isRequired ? 'sí' : 'no',
      plain(row.description),
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

/** Diccionario en Markdown, con las tablas de campos, los catálogos del trámite y los errores. */
export function dictionaryToMarkdown(
  rows: readonly DictionaryRow[],
  components: Record<string, JsonObject>,
): string {
  const sections: string[] = [
    '# Diccionario de datos del Estándar S5',
    '',
    `Versión del estándar: ${STANDARD_VERSION}. Archivo generado con \`npm run standard:build\` desde \`packages/contracts\`; no se edita a mano. La misma información está en \`diccionario-de-datos.csv\`.`,
    '',
    'Cada tabla describe un esquema de `openapi.yaml`. La ruta del campo usa puntos para los objetos y `[]` para los elementos de un arreglo. Un tipo con un nombre entre paréntesis remite a la tabla de ese esquema. Las fechas se redondean al día o a la hora en UTC para reducir la correlación temporal. Los ejemplos son sintéticos.',
    '',
    '## Esquemas',
  ];
  for (const component of Object.keys(PUBLISHED_COMPONENTS)) {
    const own = rows.filter((row) => row.schema === component);
    sections.push(
      '',
      `### ${component}`,
      '',
      firstParagraph(components[component]?.description),
      '',
      mdTable(
        [
          'Campo',
          'Nombre',
          'Tipo',
          'Formato',
          'Obligatorio',
          'Descripción',
          'Valores permitidos o catálogo',
          'Ejemplo',
        ],
        own.map((row) => [
          row.path === '' ? '(valor)' : code(row.path),
          row.name === '' ? component : row.name,
          row.type,
          row.format,
          row.isRequired ? 'Sí' : 'No',
          row.description,
          row.allowed,
          code(row.example),
        ]),
      ),
    );
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
    officialRestDays: { coverage: OFFICIAL_REST_DAYS_COVERAGE, days: OFFICIAL_REST_DAYS },
  };
}
