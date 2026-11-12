// Perfiles del Estándar S5 al estilo de las especificaciones de la PDN: un documento OpenAPI por
// grupo, con solo sus rutas y los esquemas que usan, y su conversión a OpenAPI 3.0.3. El Swagger UI
// de la PDN (plataformadigitalnacional.org/oas/ui/) solo reconoce documentos `3.0.x`, así que los
// perfiles se publican en 3.0.3 y el documento completo también, además del original en 3.1.
// Funciones puras: no escriben nada.
import {
  CORROBORATION_OPERATIONS,
  NETWORK_OPERATIONS,
  PDN_OPERATIONS,
  STANDARD_OPERATIONS,
  STANDARD_VERSION,
} from '@sigilo/contracts/standard';
import type { JsonObject } from './openapi.ts';

/** Versión de OpenAPI de los perfiles y del documento completo en 3.0. */
export const OPENAPI_30_VERSION = '3.0.3';

/** Carpeta de los perfiles, relativa a `estandar/`. */
export const PROFILES_DIR = 'oas';

/** Licencia del estándar con su URL (OpenAPI 3.0 no tiene `identifier`). */
const LICENSE = {
  name: 'CC BY-NC 4.0',
  url: 'https://creativecommons.org/licenses/by-nc/4.0/',
} as const;

/** Un perfil: un documento por grupo, como cada sistema en las especificaciones de la PDN. */
export interface StandardProfile {
  /** Nombre del archivo sin extensión, al estilo `OAS_API_<Descripción>` de la PDN. */
  file: string;
  /** Nombre en el desplegable de Swagger UI, al estilo «S3 - Servidores Sancionados». */
  name: string;
  title: string;
  description: string;
  operationIds: readonly string[];
  /** Nombres de esquema al estilo de la PDN (por ejemplo, `resError`). */
  renames?: Readonly<Record<string, string>>;
  /** Si también se publica en YAML. */
  withYaml: boolean;
}

const ids = (operations: readonly { operationId: string }[]): string[] =>
  operations.map((operation) => operation.operationId);

/** Perfil PDN: lo que consume la SESNA de cada nodo. */
export const PDN_PROFILE: StandardProfile = {
  file: 'OAS_API_S5_Estadisticas_Denuncias',
  name: 'S5 - Estadísticas de denuncias (PDN)',
  title: 'S5 - Estadísticas de denuncias',
  description: [
    'Perfil de conexión con la Plataforma Digital Nacional del Sistema de denuncias públicas (S5), con la metodología de las APIs del S2 y del S3: el servidor de autorización OAuth 2.0 del nodo (`POST /oauth/token`), la estadística agregada de denuncias con paginación (`POST /v1/denuncias/estadisticas`) y el catálogo de autoridades (`GET /v1/denuncias/estadisticas/autoridades`). Es lo que la SESNA consume de cada nodo y lo que se prueba con el protocolo de conexión (ValidAPI).',
    '',
    'Errores con el esquema `resError` (`code` = estatus HTTP, `message`). En `/oauth/token`, además, los campos de RFC 6749 (`error`, `error_description`).',
    '',
    'Propuesta de SIGILO para el Datatón Anticorrupción 2026; no es una especificación oficial de la SESNA. Generado desde `packages/contracts` con `npm run standard:build`; el estándar completo está en `openapi.yaml` (OpenAPI 3.1) y `openapi-3.0.json`, y los cambios en `CHANGELOG.md`.',
  ].join('\n'),
  operationIds: ids(PDN_OPERATIONS),
  renames: { PdnError: 'resError', PdnTokenError: 'resErrorToken' },
  withYaml: true,
};

/** Perfiles en el orden del desplegable de Swagger UI. */
export const STANDARD_PROFILES: readonly StandardProfile[] = [
  PDN_PROFILE,
  {
    file: 'OAS_API_S5_Denuncias_Nodo',
    name: 'S5 - Denuncia y seguimiento (nodo)',
    title: 'S5 - Denuncia y seguimiento',
    description:
      'API de cada nodo del Sistema de denuncias públicas (S5): presentar una denuncia con anonimato verificable, darle seguimiento con folio y recibo, la bandeja de la autoridad, la bitácora pública, los datos abiertos y el alta de autoridades. Propuesta de SIGILO; no es una especificación oficial de la SESNA. El estándar completo está en `openapi.yaml`.',
    operationIds: ids(STANDARD_OPERATIONS),
    withYaml: false,
  },
  {
    file: 'OAS_API_S5_Red',
    name: 'S5 - Red federada',
    title: 'S5 - Red federada',
    description:
      'Red federada del S5: directorio de autoridades firmado, enrutador ciego, registro y salud de nodos, bitácora nacional cofirmada y buzón de red de cada nodo. Lo sirve el enrutador (la SESNA), salvo el buzón de red, que lo sirve cada nodo. Propuesta de SIGILO; no es una especificación oficial de la SESNA.',
    operationIds: ids(NETWORK_OPERATIONS),
    withYaml: false,
  },
  {
    file: 'OAS_API_S5_Corroboracion',
    name: 'S5 - Corroboración ciega',
    title: 'S5 - Corroboración ciega',
    description:
      'Corroboración ciega con VOPRF (RFC 9497): el evaluador OPRF y el índice de coincidencias, dos servicios con operación separada. Propuesta de SIGILO; no es una especificación oficial de la SESNA.',
    operationIds: ids(CORROBORATION_OPERATIONS),
    withYaml: false,
  },
];

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REF_PREFIX = '#/components/schemas/';

/** Nombres de los esquemas citados con `$ref` dentro de `value`. */
function refsIn(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) refsIn(item, found);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (key === '$ref' && typeof item === 'string' && item.startsWith(REF_PREFIX)) {
      found.add(item.slice(REF_PREFIX.length));
    } else {
      refsIn(item, found);
    }
  }
}

/** Cambia el nombre de los esquemas y de sus `$ref`. */
function renameRefs(value: unknown, renames: Readonly<Record<string, string>>): unknown {
  if (Array.isArray(value)) return value.map((item) => renameRefs(item, renames));
  if (!isObject(value)) return value;
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '$ref' && typeof item === 'string' && item.startsWith(REF_PREFIX)) {
      const name = item.slice(REF_PREFIX.length);
      result[key] = `${REF_PREFIX}${renames[name] ?? name}`;
    } else {
      result[key] = renameRefs(item, renames);
    }
  }
  return result;
}

/**
 * Documento de un perfil a partir del documento completo: solo sus operaciones, los esquemas que
 * citan (directa o indirectamente), sus secciones y sus esquemas de seguridad.
 */
export function buildProfileDocument(full: JsonObject, profile: StandardProfile): JsonObject {
  const wanted = new Set(profile.operationIds);
  const paths: Record<string, JsonObject> = {};
  const tags = new Set<string>();
  const security = new Set<string>();
  for (const [path, item] of Object.entries(full.paths as Record<string, JsonObject>)) {
    const kept: JsonObject = {};
    for (const [method, operation] of Object.entries(item)) {
      if (method === 'servers') continue;
      if (!isObject(operation) || !wanted.has(String(operation.operationId))) continue;
      kept[method] = operation;
      for (const tag of (operation.tags as string[] | undefined) ?? []) tags.add(tag);
      for (const requirement of (operation.security as JsonObject[] | undefined) ?? []) {
        for (const name of Object.keys(requirement)) security.add(name);
      }
    }
    if (Object.keys(kept).length === 0) continue;
    paths[path] = item.servers === undefined ? kept : { servers: item.servers, ...kept };
  }
  const missing = profile.operationIds.filter(
    (id) =>
      !Object.values(paths).some((item) =>
        Object.values(item).some(
          (operation) => isObject(operation) && operation.operationId === id,
        ),
      ),
  );
  if (missing.length > 0) throw new Error(`El perfil ${profile.file} no encontró ${missing}.`);
  const components = full.components as {
    schemas: Record<string, JsonObject>;
    securitySchemes: Record<string, JsonObject>;
  };
  const used = new Set<string>();
  refsIn(paths, used);
  for (let pending = [...used]; pending.length > 0;) {
    const next: string[] = [];
    for (const name of pending) {
      const found = new Set<string>();
      refsIn(components.schemas[name], found);
      for (const item of found) {
        if (!used.has(item)) {
          used.add(item);
          next.push(item);
        }
      }
    }
    pending = next;
  }
  const schemas = Object.fromEntries(
    Object.entries(components.schemas).filter(([name]) => used.has(name)),
  );
  const renames = profile.renames ?? {};
  const info = full.info as JsonObject;
  const document: JsonObject = {
    openapi: full.openapi,
    info: { ...info, title: profile.title, description: profile.description },
    servers: full.servers,
    tags: (full.tags as { name: string }[]).filter((tag) => tags.has(tag.name)),
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(schemas).map(([name, schema]) => [renames[name] ?? name, schema]),
      ),
      securitySchemes: Object.fromEntries(
        Object.entries(components.securitySchemes).filter(([name]) => security.has(name)),
      ),
    },
  };
  return renameRefs(document, renames) as JsonObject;
}

const NULL_SCHEMA = (value: unknown): boolean =>
  isObject(value) && value.type === 'null' && Object.keys(value).length === 1;

const SCHEMA_MAPS = new Set(['properties', 'patternProperties']);
const SCHEMA_VALUES = new Set(['items', 'additionalProperties', 'not', 'propertyNames']);
const SCHEMA_LISTS = new Set(['anyOf', 'oneOf', 'allOf']);

/**
 * Convierte un esquema de JSON Schema 2020-12 (OpenAPI 3.1) al subconjunto de OpenAPI 3.0.3 sin
 * perder significado: `const` a `enum` de un valor, `null` a `nullable`, `examples` a `example`,
 * `exclusiveMinimum` numérico a booleano, un registro con llaves de un catálogo (todas
 * obligatorias) a un objeto con esas propiedades, y `$ref` con hermanos a `allOf`. Lo que 3.0 no
 * puede expresar (las llaves de un registro abierto) queda como extensión `x-propertyNames`.
 */
export function toSchema30(input: unknown): unknown {
  if (!isObject(input)) return input;
  let schema: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (SCHEMA_MAPS.has(key) && isObject(value)) {
      schema[key] = Object.fromEntries(
        Object.entries(value).map(([name, item]) => [name, toSchema30(item)]),
      );
    } else if (SCHEMA_VALUES.has(key) && isObject(value)) {
      schema[key] = toSchema30(value);
    } else if (SCHEMA_LISTS.has(key) && Array.isArray(value)) {
      schema[key] = value.map(toSchema30);
    } else {
      schema[key] = value;
    }
  }
  if ('const' in schema) {
    const value = schema.const;
    delete schema.const;
    schema.enum = [value];
    if (schema.type === undefined && value !== null) schema.type = typeof value;
  }
  if (Array.isArray(schema.examples)) {
    if (schema.examples.length > 0 && schema.example === undefined) {
      schema.example = schema.examples[0];
    }
    delete schema.examples;
  }
  for (const [exclusive, bound] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (typeof schema[exclusive] === 'number') {
      schema[bound] = schema[exclusive];
      schema[exclusive] = true;
    }
  }
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((type) => type !== 'null');
    if (types.length < schema.type.length) schema.nullable = true;
    if (types.length === 1) schema.type = types[0];
    else throw new Error(`Tipo sin equivalente en OpenAPI 3.0: ${JSON.stringify(schema.type)}`);
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    const branches = schema[key];
    if (!Array.isArray(branches) || !branches.some(NULL_SCHEMA)) continue;
    const rest = branches.filter((branch) => !NULL_SCHEMA(branch));
    schema = Object.fromEntries(Object.entries(schema).filter(([name]) => name !== key));
    if (rest.length === 1 && isObject(rest[0]) && typeof rest[0].$ref !== 'string') {
      // Lo de afuera (descripción) manda sobre lo de la rama.
      schema = { ...rest[0], ...schema };
    } else if (rest.length === 1) {
      schema.allOf = rest;
    } else {
      schema[key] = rest;
    }
    schema.nullable = true;
  }
  if (isObject(schema.propertyNames)) {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    const values = schema.additionalProperties;
    if (required.length > 0 && isObject(values)) {
      schema.properties = Object.fromEntries(required.map((name) => [name, values]));
      schema.additionalProperties = false;
    } else {
      schema['x-propertyNames'] = schema.propertyNames;
    }
    delete schema.propertyNames;
  }
  if (typeof schema.$ref === 'string' && Object.keys(schema).length > 1) {
    const { $ref, ...siblings } = schema;
    return { ...siblings, allOf: [{ $ref }] };
  }
  return schema;
}

/**
 * Contenido de un cuerpo: convierte el esquema de cada tipo de medio y declara un cuerpo binario
 * de 3.1 (tipo de medio sin esquema) con `format: binary`, como pide 3.0.
 */
function content30(content: unknown): unknown {
  if (!isObject(content)) return content;
  return Object.fromEntries(
    Object.entries(content).map(([media, body]) => {
      if (!isObject(body)) return [media, body];
      if (Object.keys(body).length === 0) {
        return [media, { schema: { type: 'string', format: 'binary' } }];
      }
      return [
        media,
        body.schema === undefined ? body : { ...body, schema: toSchema30(body.schema) },
      ];
    }),
  );
}

/** Esquemas de los parámetros y las cabeceras. */
function withSchema30(item: unknown): unknown {
  return isObject(item) && item.schema !== undefined
    ? { ...item, schema: toSchema30(item.schema) }
    : item;
}

/** Convierte cada operación: parámetros, cuerpo y respuestas (con sus cabeceras). */
function operation30(operation: unknown): unknown {
  if (!isObject(operation)) return operation;
  const result: JsonObject = { ...operation };
  if (Array.isArray(operation.parameters))
    result.parameters = operation.parameters.map(withSchema30);
  if (isObject(operation.requestBody)) {
    result.requestBody = {
      ...operation.requestBody,
      content: content30(operation.requestBody.content),
    };
  }
  if (isObject(operation.responses)) {
    result.responses = Object.fromEntries(
      Object.entries(operation.responses).map(([status, response]) => {
        if (!isObject(response)) return [status, response];
        const converted: JsonObject = { ...response };
        if (response.content !== undefined) converted.content = content30(response.content);
        if (isObject(response.headers)) {
          converted.headers = Object.fromEntries(
            Object.entries(response.headers).map(([name, header]) => [name, withSchema30(header)]),
          );
        }
        return [status, converted];
      }),
    );
  }
  return result;
}

function paths30(paths: unknown): unknown {
  if (!isObject(paths)) return paths;
  return Object.fromEntries(
    Object.entries(paths).map(([path, item]) => [
      path,
      isObject(item)
        ? Object.fromEntries(
            Object.entries(item).map(([key, value]) => [
              key,
              key === 'servers' ? value : operation30(value),
            ]),
          )
        : item,
    ]),
  );
}

/** Documento OpenAPI 3.1 convertido a OpenAPI 3.0.3, el que lee el Swagger UI de la PDN. */
export function toOpenApi30(document: JsonObject): JsonObject {
  const info = { ...(document.info as JsonObject) };
  delete info.summary;
  if (typeof info.description === 'string') {
    info.description = info.description.replace(
      'Los esquemas son JSON Schema 2020-12.',
      'Los esquemas son el subconjunto de JSON Schema de OpenAPI 3.0.3, convertidos sin perder significado desde el documento en OpenAPI 3.1 (`openapi.yaml`), que es la referencia.',
    );
  }
  info.license = LICENSE;
  info.version = STANDARD_VERSION;
  const components = document.components as {
    schemas: Record<string, unknown>;
    securitySchemes: Record<string, unknown>;
  };
  return {
    openapi: OPENAPI_30_VERSION,
    info,
    servers: document.servers,
    tags: document.tags,
    paths: paths30(document.paths),
    components: {
      schemas: Object.fromEntries(
        Object.entries(components.schemas).map(([name, schema]) => [name, toSchema30(schema)]),
      ),
      securitySchemes: components.securitySchemes,
    },
  };
}
