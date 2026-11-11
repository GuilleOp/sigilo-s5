// Datos estáticos que la web publica en su mismo origen, bajo /datos/: el catálogo del grupo de
// anonimato (sintético en la demo, o el de datos/grupos-anonimato con VITE_ANONYMITY_DATA=real), la
// matriz de cobertura, los conjuntos de datos abiertos agregados de datos/abiertos y los entes
// públicos reales de la PDN partidos en un fragmento por entidad (/datos/entes/<clave>.json).
// Seguridad: así la web nunca pide datos a otro origen; todo sale del mismo servidor que la sirve.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { DEMO_FILES } from '@sigilo/anonimato/demo';
import { ENTITY_FRAGMENT_BASE_PATH, entityFragmentsFrom, STATES } from '@sigilo/contracts';
import type { RealEntityCatalogFile } from '@sigilo/contracts';

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

/**
 * Un fragmento por entidad (y `00`, el federal) con los entes reales de la PDN. El asistente solo
 * descarga el de la entidad elegida y el federal: el catálogo completo (~1 MB) no va en el bundle.
 */
export function entityFragmentFiles(): StaticFiles {
  const catalog = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/contracts/src/entes/entes-pdn.json'), 'utf8'),
  ) as RealEntityCatalogFile;
  const names = Object.fromEntries([
    ['00', 'Federación'],
    ...STATES.map((state) => [state.code, state.name] as const),
  ]);
  const files: StaticFiles = new Map();
  for (const [code, fragment] of Object.entries(entityFragmentsFrom(catalog, names))) {
    files.set(
      `${ENTITY_FRAGMENT_BASE_PATH}${code}.json`,
      new TextEncoder().encode(JSON.stringify(fragment)),
    );
  }
  return files;
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
  // Equivalencias con el catálogo de faltas del S5: artículo de la ley de cada estado.
  addDirectory(files, join(REPO_ROOT, 'packages/contracts/src/s5'), '/datos/s5/', /\.json$/u);
  for (const [path, content] of entityFragmentFiles()) files.set(path, content);
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
