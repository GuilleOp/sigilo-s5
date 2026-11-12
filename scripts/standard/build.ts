// Arma en memoria todos los archivos generados de `estandar/` (OpenAPI 3.1 y 3.0.3, perfiles por
// grupo, diccionarios, catálogos, ejemplos y el inicio de Swagger UI), con el formato de Prettier
// del repositorio, y valida los documentos OpenAPI.
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { format, resolveConfig } from 'prettier';
import { stringify } from 'yaml';
import { CATALOGS_DIR, buildCatalogs, catalogToCsv } from './catalogs.ts';
import {
  buildDictionaryRows,
  buildProcedureCatalog,
  dictionaryToCsv,
  dictionaryToMarkdown,
} from './dictionary.ts';
import type { DictionaryHeader } from './dictionary.ts';
import { buildComponentSchemas, buildOpenApiDocument } from './openapi.ts';
import type { JsonObject } from './openapi.ts';
import {
  PDN_PROFILE,
  PROFILES_DIR,
  STANDARD_PROFILES,
  buildProfileDocument,
  toOpenApi30,
} from './profiles.ts';
import { PUBLISHED_EXAMPLES } from './published.ts';

/** Carpeta del estándar en la raíz del repositorio. */
export const STANDARD_DIR = resolve(import.meta.dirname, '../../estandar');

/** Carpeta de los ejemplos, relativa a `STANDARD_DIR`. */
export const EXAMPLES_DIR = 'ejemplos';

/** Documento completo en OpenAPI 3.0.3, relativo a `STANDARD_DIR`. */
export const OPENAPI_30_FILE = 'openapi-3.0.json';

/** Nombre del documento completo en el desplegable de Swagger UI. */
export const FULL_DOCUMENT_NAME = 'S5 - Estándar completo (OpenAPI 3.1)';

async function prettify(text: string, filepath: string): Promise<string> {
  const config = (await resolveConfig(filepath)) ?? {};
  return format(text, { ...config, filepath });
}

function yamlOf(document: JsonObject): string {
  // Sin alias de YAML: los objetos repetidos se escriben completos para que se lean solos.
  return stringify(document, { aliasDuplicateObjects: false, lineWidth: 0, version: '1.1' });
}

/** Liga de Swagger UI (relativa a `estandar/`) que abre un documento del desplegable. */
export function swaggerLink(name: string): string {
  return `swagger/index.html?urls.primaryName=${encodeURIComponent(name).replaceAll('%20', '+')}`;
}

/** Documentos del desplegable de Swagger UI: los perfiles y el estándar completo. */
export function swaggerUrls(): { url: string; name: string }[] {
  return [
    ...STANDARD_PROFILES.map((profile) => ({
      url: `../${PROFILES_DIR}/${profile.file}.json`,
      name: profile.name,
    })),
    { url: '../openapi.json', name: FULL_DOCUMENT_NAME },
  ];
}

/** Inicio de Swagger UI con el desplegable `urls`, como el Swagger UI de la PDN. */
function swaggerInit(): string {
  const options = {
    urls: swaggerUrls(),
    'urls.primaryName': PDN_PROFILE.name,
    dom_id: '#swagger-ui',
    deepLinking: true,
    validatorUrl: null,
    supportedSubmitMethods: [],
    defaultModelsExpandDepth: 0,
    docExpansion: 'list',
  };
  return [
    '// Generado con npm run standard:build desde scripts/standard/build.ts; no se edita a mano.',
    '// Inicia Swagger UI con un desplegable de documentos (`urls`), como el Swagger UI de la PDN.',
    '// Seguridad: sin validador en línea (validatorUrl: null) y sin «Try it out», para que la vista no',
    '// haga peticiones fuera de su origen.',
    '/* global SwaggerUIBundle, SwaggerUIStandalonePreset */',
    "if (typeof SwaggerUIBundle === 'function' && typeof SwaggerUIStandalonePreset !== 'undefined') {",
    `  const options = ${JSON.stringify(options)};`,
    '  SwaggerUIBundle({',
    '    ...options,',
    '    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],',
    "    layout: 'StandaloneLayout',",
    '  });',
    '} else {',
    "  document.getElementById('swagger-missing')?.removeAttribute('hidden');",
    '}',
    '',
  ].join('\n');
}

const FULL_HEADER: DictionaryHeader = {
  name: 'Estándar S5 · Sistema de denuncias públicas de faltas administrativas y hechos de corrupción',
  objective:
    'Describir los datos que intercambian la persona denunciante, cada nodo (autoridad), la red federada y la SESNA en el S5, con anonimato verificable: la identidad se cifra en el navegador y solo se publican conteos agregados y el registro público.',
  swaggerLink: swaggerLink(FULL_DOCUMENT_NAME),
};

const PDN_HEADER: DictionaryHeader = {
  name: 'S5 - Estadísticas de denuncias (perfil de conexión con la PDN)',
  objective:
    'Describir la estadística agregada de denuncias que cada nodo ofrece a la SESNA para el portal de la PDN (Bases de la PDN, art. 61): solo meses cerrados, conteos redondeados a múltiplos de 5 y celdas menores que 5 suprimidas.',
  swaggerLink: swaggerLink(PDN_PROFILE.name),
};

/** Documentos OpenAPI que se publican, por ruta relativa a `STANDARD_DIR`. */
export function buildOpenApiDocuments(): Map<string, JsonObject> {
  const document = buildOpenApiDocument();
  const documents = new Map<string, JsonObject>([
    ['openapi.json', document],
    [OPENAPI_30_FILE, toOpenApi30(document)],
  ]);
  for (const profile of STANDARD_PROFILES) {
    documents.set(
      `${PROFILES_DIR}/${profile.file}.json`,
      toOpenApi30(buildProfileDocument(document, profile)),
    );
  }
  return documents;
}

/**
 * Contenido de cada archivo generado, por ruta relativa a `STANDARD_DIR`. Es determinista: la
 * prueba del estándar lo compara con lo que hay en disco.
 */
export async function buildStandardFiles(): Promise<Map<string, string>> {
  const documents = buildOpenApiDocuments();
  const document = documents.get('openapi.json') ?? buildOpenApiDocument();
  const components = buildComponentSchemas();
  const rows = buildDictionaryRows(components);
  const pdnDocument = documents.get(`${PROFILES_DIR}/${PDN_PROFILE.file}.json`) ?? {};
  const renames = PDN_PROFILE.renames ?? {};
  const originals = new Map(Object.entries(renames).map(([from, to]) => [to, from]));
  const pdnComponents = Object.keys(
    (pdnDocument.components as { schemas: JsonObject } | undefined)?.schemas ?? {},
  ).map((name) => originals.get(name) ?? name);
  const pdnRows = rows
    .filter((row) => pdnComponents.includes(row.schema))
    .map((row) => ({ ...row, schema: renames[row.schema] ?? row.schema }));
  const raw = new Map<string, string>([
    ['openapi.yaml', yamlOf(document)],
    [
      'diccionario-de-datos.md',
      dictionaryToMarkdown(rows, components, {
        header: FULL_HEADER,
        csvFile: 'diccionario-de-datos.csv',
        withCatalogs: true,
      }),
    ],
    [
      'diccionario-de-datos-pdn.md',
      dictionaryToMarkdown(
        pdnRows,
        Object.fromEntries(
          pdnComponents.map((name) => [renames[name] ?? name, components[name] ?? {}]),
        ),
        {
          header: PDN_HEADER,
          csvFile: 'diccionario-de-datos-pdn.csv',
          components: pdnComponents.map((name) => renames[name] ?? name),
          withCatalogs: false,
        },
      ),
    ],
    ['catalogo-del-tramite.json', JSON.stringify(buildProcedureCatalog())],
    ['swagger/swagger-init.js', swaggerInit()],
  ]);
  for (const [path, value] of documents) raw.set(path, JSON.stringify(value));
  const pdnYaml = `${PROFILES_DIR}/${PDN_PROFILE.file}.yaml`;
  raw.set(pdnYaml, yamlOf(pdnDocument));
  for (const [name, value] of Object.entries(PUBLISHED_EXAMPLES)) {
    raw.set(`${EXAMPLES_DIR}/${name}.json`, JSON.stringify(value));
  }
  const catalogs = buildCatalogs();
  for (const catalog of catalogs) {
    raw.set(`${CATALOGS_DIR}/${catalog.name}.json`, JSON.stringify(catalog.rows));
  }
  const files = new Map<string, string>();
  for (const [path, text] of raw) {
    files.set(path, await prettify(text, resolve(STANDARD_DIR, path)));
  }
  // Los CSV no tienen formateador: se escriben tal cual.
  files.set('diccionario-de-datos.csv', dictionaryToCsv(rows, FULL_HEADER));
  files.set('diccionario-de-datos-pdn.csv', dictionaryToCsv(pdnRows, PDN_HEADER));
  for (const catalog of catalogs) {
    files.set(`${CATALOGS_DIR}/${catalog.name}.csv`, catalogToCsv(catalog));
  }
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Valida un documento contra el esquema de su versión de OpenAPI (3.1 o 3.0) y resuelve todas sus
 * referencias, sin red. Lanza con el detalle del primer problema.
 */
export async function validateOpenApi(document: JsonObject): Promise<void> {
  // El validador modifica el objeto al resolver referencias: se le pasa una copia.
  await SwaggerParser.validate(structuredClone(document) as never);
}

/** Valida todos los documentos que se publican. Lanza con el archivo y el problema. */
export async function validateOpenApiDocuments(): Promise<void> {
  for (const [path, document] of buildOpenApiDocuments()) {
    try {
      await validateOpenApi(document);
    } catch (error) {
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }
}
