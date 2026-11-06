// Versión del validador y User-Agent identificable con el que se presenta ante los sitios.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface PackageJson {
  version: string;
}

const PACKAGE = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
) as PackageJson;

/** Nombre de la herramienta. */
export const TOOL_NAME = 'sigilo-validar';

/** Versión del paquete `@sigilo/validador`. */
export const TOOL_VERSION: string = PACKAGE.version;

/**
 * User-Agent de todas las peticiones (navegador y `fetch`).
 * Ética: identifica la herramienta para que el sitio pueda reconocerla en sus registros.
 */
export const USER_AGENT = `${TOOL_NAME}/${TOOL_VERSION} (Datatón 2026)`;
