// Genera el Estándar S5 en `estandar/` desde @sigilo/contracts: OpenAPI 3.1, diccionario de datos,
// catálogo del trámite y ejemplos; valida el OpenAPI y copia Swagger UI para verlo sin red.
// Uso: npm run standard:build [-- --check]
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { buildOpenApiDocument } from './standard/openapi.ts';
import {
  EXAMPLES_DIR,
  STANDARD_DIR,
  buildStandardFiles,
  validateOpenApi,
} from './standard/build.ts';

/** Archivos de Swagger UI que necesita la vista estática, copiados de `swagger-ui-dist`. */
const SWAGGER_FILES = ['swagger-ui-bundle.js', 'swagger-ui.css', 'LICENSE', 'NOTICE'];
const SWAGGER_VENDOR_DIR = join(STANDARD_DIR, 'swagger', 'vendor');

function staleFiles(files: Map<string, string>): string[] {
  const stale: string[] = [];
  for (const [path, content] of files) {
    const target = join(STANDARD_DIR, path);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== content) stale.push(path);
  }
  const examplesDir = join(STANDARD_DIR, EXAMPLES_DIR);
  if (existsSync(examplesDir)) {
    for (const name of readdirSync(examplesDir)) {
      if (!files.has(`${EXAMPLES_DIR}/${name}`)) stale.push(`${EXAMPLES_DIR}/${name} (sobra)`);
    }
  }
  return stale;
}

function writeFiles(files: Map<string, string>): void {
  const examplesDir = join(STANDARD_DIR, EXAMPLES_DIR);
  // Los ejemplos que ya no existen en contracts se borran para que no queden huérfanos.
  if (existsSync(examplesDir)) {
    for (const name of readdirSync(examplesDir)) {
      if (!files.has(`${EXAMPLES_DIR}/${name}`)) rmSync(join(examplesDir, name));
    }
  }
  for (const [path, content] of files) {
    const target = join(STANDARD_DIR, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function copySwaggerUi(): void {
  const require = createRequire(import.meta.url);
  const source = dirname(require.resolve('swagger-ui-dist/package.json'));
  mkdirSync(SWAGGER_VENDOR_DIR, { recursive: true });
  for (const name of SWAGGER_FILES)
    copyFileSync(join(source, name), join(SWAGGER_VENDOR_DIR, name));
}

async function main(): Promise<void> {
  const isCheck = process.argv.includes('--check');
  await validateOpenApi(buildOpenApiDocument());
  const files = await buildStandardFiles();
  if (isCheck) {
    const stale = staleFiles(files);
    if (stale.length > 0) {
      console.error(
        `estandar/ no está al día; ejecuta npm run standard:build:\n- ${stale.join('\n- ')}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`estandar/ está al día (${files.size} archivos).`);
    return;
  }
  writeFiles(files);
  copySwaggerUi();
  console.log(`Estándar S5 generado en estandar/ (${files.size} archivos) y OpenAPI 3.1 válido.`);
  console.log(
    'Vista local: python3 -m http.server 8080 -d estandar y abre http://127.0.0.1:8080/swagger/',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
