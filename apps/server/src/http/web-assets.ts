// Archivos de la web construida (`apps/web/dist`) servidos desde el mismo origen que la API, con
// respaldo de SPA a `index.html`.
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

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
