// Arma en memoria todos los archivos generados de `estandar/` (OpenAPI, diccionario, catálogo y
// ejemplos), con el formato de Prettier del repositorio, y valida el documento OpenAPI 3.1.
import { resolve } from 'node:path';
import SwaggerParser from '@apidevtools/swagger-parser';
import { format, resolveConfig } from 'prettier';
import { stringify } from 'yaml';
import {
  buildDictionaryRows,
  buildProcedureCatalog,
  dictionaryToCsv,
  dictionaryToMarkdown,
} from './dictionary.ts';
import { buildComponentSchemas, buildOpenApiDocument } from './openapi.ts';
import type { JsonObject } from './openapi.ts';
import { PUBLISHED_EXAMPLES } from './published.ts';

/** Carpeta del estándar en la raíz del repositorio. */
export const STANDARD_DIR = resolve(import.meta.dirname, '../../estandar');

/** Carpeta de los ejemplos, relativa a `STANDARD_DIR`. */
export const EXAMPLES_DIR = 'ejemplos';

async function prettify(text: string, filepath: string): Promise<string> {
  const config = (await resolveConfig(filepath)) ?? {};
  return format(text, { ...config, filepath });
}

/**
 * Contenido de cada archivo generado, por ruta relativa a `STANDARD_DIR`. Es determinista: la
 * prueba del estándar lo compara con lo que hay en disco.
 */
export async function buildStandardFiles(): Promise<Map<string, string>> {
  const document = buildOpenApiDocument();
  const components = buildComponentSchemas();
  const rows = buildDictionaryRows(components);
  const raw = new Map<string, string>([
    // Sin alias de YAML: los objetos repetidos se escriben completos para que se lean solos.
    [
      'openapi.yaml',
      stringify(document, { aliasDuplicateObjects: false, lineWidth: 0, version: '1.1' }),
    ],
    ['openapi.json', JSON.stringify(document)],
    ['diccionario-de-datos.md', dictionaryToMarkdown(rows, components)],
    ['catalogo-del-tramite.json', JSON.stringify(buildProcedureCatalog())],
  ]);
  for (const [name, value] of Object.entries(PUBLISHED_EXAMPLES)) {
    raw.set(`${EXAMPLES_DIR}/${name}.json`, JSON.stringify(value));
  }
  const files = new Map<string, string>();
  for (const [path, text] of raw) {
    files.set(path, await prettify(text, resolve(STANDARD_DIR, path)));
  }
  // El CSV no tiene formateador: se escribe tal cual.
  files.set('diccionario-de-datos.csv', dictionaryToCsv(rows));
  return new Map([...files].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Valida el documento contra el esquema de OpenAPI 3.1 y resuelve todas sus referencias, sin red.
 * Lanza con el detalle del primer problema.
 */
export async function validateOpenApi(document: JsonObject): Promise<void> {
  // El validador modifica el objeto al resolver referencias: se le pasa una copia.
  await SwaggerParser.validate(structuredClone(document) as never);
}
