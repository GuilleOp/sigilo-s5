// Archivos de la web construida (`apps/web/dist`) servidos desde el mismo origen que la API, con
// respaldo de SPA a `index.html`, y la configuración de la web en tiempo de ejecución.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { WebRuntimeConfigSchema } from '@sigilo/contracts';
import type { WebRuntimeConfig } from '@sigilo/contracts';

/** Archivo de la web en memoria. */
export interface WebAsset {
  body: Uint8Array;
  contentType: string;
}

/** Conjunto de archivos de la web. */
export interface WebAssets {
  /** Archivo para la ruta pedida, `index.html` si es una ruta de la SPA, o `null`. */
  resolve(pathname: string): WebAsset | null;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

/**
 * Carga en memoria todos los archivos de `distDir`. Lanza error si falta `index.html`.
 * Seguridad: las rutas se resuelven contra un mapa fijo cargado al arrancar, así que ninguna
 * petición toca el sistema de archivos ni puede salir del directorio.
 */
export function loadWebAssets(distDir: string): WebAssets {
  const assets = new Map<string, WebAsset>();
  for (const path of listFiles(distDir)) {
    const urlPath = `/${relative(distDir, path).split(sep).join('/')}`;
    const contentType = CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
    assets.set(urlPath, { body: new Uint8Array(readFileSync(path)), contentType });
  }
  const index = assets.get('/index.html');
  if (index === undefined) throw new Error('SIGILO_WEB_DIST no contiene index.html.');
  return {
    resolve: (pathname) => {
      const asset = assets.get(pathname);
      if (asset !== undefined) return asset;
      // Las rutas de la SPA no tienen extensión; un archivo inexistente con extensión es 404.
      const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
      return lastSegment.includes('.') ? null : index;
    },
  };
}

/**
 * Lee la configuración de la web en tiempo de ejecución (`SIGILO_WEB_CONFIG_FILE`, por omisión
 * `web-config.json` en el directorio de datos; ADR 0011), que se sirve en `/config/sigilo.json`.
 * Sin archivo devuelve `null` y la web usa lo que trae su bundle. Lanza error si el archivo no es
 * válido: el nodo no arranca sirviendo llaves que la web no aceptaría.
 * Seguridad: se lee una sola vez al arrancar; ninguna petición toca el sistema de archivos.
 */
export function loadWebConfig(path: string): WebRuntimeConfig | null {
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('No se pudo leer la configuración de la web (web-config.json).');
  }
  const parsed = WebRuntimeConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('La configuración de la web (web-config.json) no tiene el formato esperado.');
  }
  return parsed.data;
}
