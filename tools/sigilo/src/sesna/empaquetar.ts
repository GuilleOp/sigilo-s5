// `sigilo-sesna empaquetar`: arma la descarga para los estados en `salida/sigilo-nodo-<versión>/`:
// el envoltorio `sigilo`, `compose.nodo.yaml`, `LEEME.txt`, el `red.json` de esta red y
// `SHA256SUMS`. El envoltorio `sigilo-sesna` la comprime en .tar.gz y, con `--sin-conexion`, agrega
// las imágenes (`docker save`) para instalar sin internet con `docker load`.
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, ensureDir, writeText } from '../base.ts';
import type { Context } from '../base.ts';
import { readSesnaRecord, sesnaPaths } from './comun.ts';

/** Archivos de la descarga del nodo: origen en las plantillas y modo. */
const PACKAGE_FILES: readonly { from: string; to: string; mode: number }[] = [
  { from: 'sigilo', to: 'sigilo', mode: 0o755 },
  { from: 'compose.nodo.yaml', to: 'compose.nodo.yaml', mode: 0o644 },
  { from: 'LEEME-nodo.txt', to: 'LEEME.txt', mode: 0o644 },
];

/** Arma la carpeta de la descarga. Devuelve 0. */
export function buildPackage(ctx: Context): number {
  readSesnaRecord(ctx);
  const paths = sesnaPaths(ctx);
  if (!existsSync(paths.network))
    throw new CliError('Falta red.json: corre ./sigilo-sesna instalar.');
  const name = `sigilo-nodo-${ctx.version}`;
  const target = join(paths.output, name);
  rmSync(target, { recursive: true, force: true });
  ensureDir(target, 0o755);
  const sums: string[] = [];
  const add = (source: string, file: string, mode: number): void => {
    if (!existsSync(source)) throw new CliError(`Falta la plantilla ${source}.`);
    const destination = join(target, file);
    copyFileSync(source, destination);
    chmodSync(destination, mode);
    sums.push(`${createHash('sha256').update(readFileSync(destination)).digest('hex')}  ${file}`);
  };
  for (const file of PACKAGE_FILES) add(join(ctx.templates, file.from), file.to, file.mode);
  add(paths.network, 'red.json', 0o644);
  writeText(join(target, 'SHA256SUMS'), `${sums.join('\n')}\n`, 0o644);
  ctx.screen.ok(
    `Descarga del nodo lista en salida/${name}/ (sigilo, compose.nodo.yaml, red.json, SHA256SUMS)`,
  );
  ctx.screen.line('Publica junto con ella la huella de la red (oficio y sitio oficial).');
  return 0;
}
