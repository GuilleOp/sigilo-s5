// Datos estáticos que la web publica en su mismo origen, bajo /datos/: el catálogo del grupo de
// anonimato (sintético en la demo, o el de datos/grupos-anonimato con VITE_ANONYMITY_DATA=real), la
// matriz de cobertura y los conjuntos de datos abiertos agregados de datos/abiertos.
// Seguridad: así la web nunca pide datos a otro origen; todo sale del mismo servidor que la sirve.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { DEMO_FILES } from '@sigilo/anonimato/demo';

const REPO_ROOT = resolve(import.meta.dirname, '../..');

/** Archivos publicados: ruta pública → contenido. */
export type StaticFiles = Map<string, Uint8Array>;

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function addDirectory(files: StaticFiles, dir: string, publicPrefix: string, pattern: RegExp) {
  for (const path of listFiles(dir)) {
    const name = relative(dir, path).split(sep).join('/');
    if (pattern.test(name)) files.set(`${publicPrefix}${name}`, readFileSync(path));
  }
}

/** Reúne los archivos que se publican bajo /datos/. */
export function collectStaticData(anonymitySource: string | undefined): StaticFiles {
  const files: StaticFiles = new Map();
  if (anonymitySource === 'real') {
    addDirectory(
      files,
      join(REPO_ROOT, 'datos/grupos-anonimato'),
      '/datos/grupos-anonimato/',
      /\.json$/u,
    );
  } else {
    // Demostración: los entes del catálogo son ficticios, así que se publica el catálogo sintético.
    for (const [name, content] of Object.entries(DEMO_FILES)) {
      files.set(
        `/datos/grupos-anonimato/${name}`,
        new TextEncoder().encode(JSON.stringify(content)),
      );
    }
  }
  addDirectory(files, join(REPO_ROOT, 'datos/cobertura'), '/datos/cobertura/', /\.(json|csv)$/u);
  addDirectory(files, join(REPO_ROOT, 'datos/abiertos'), '/datos/abiertos/', /\.(csv|md)$/u);
  return files;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  json: 'application/json; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
};

function contentTypeOf(path: string): string {
  return CONTENT_TYPES[path.split('.').pop() ?? ''] ?? 'application/octet-stream';
}

/** Plugin: sirve los datos en `vite dev` y `vite preview` y los copia al build. */
export function staticData(anonymitySource: string | undefined): Plugin {
  const files = collectStaticData(anonymitySource);
  const middleware = (
    request: { url?: string | undefined },
    response: {
      statusCode: number;
      setHeader(name: string, value: string): void;
      end(body?: Uint8Array): void;
    },
    next: () => void,
  ) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    const content = files.get(path);
    if (content === undefined) {
      next();
      return;
    }
    response.statusCode = 200;
    response.setHeader('Content-Type', contentTypeOf(path));
    response.setHeader('Cache-Control', 'no-store');
    response.end(content);
  };
  return {
    name: 'sigilo-static-data',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    generateBundle() {
      for (const [path, content] of files) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source: content });
      }
    },
  };
}
