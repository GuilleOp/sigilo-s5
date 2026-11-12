// Pruebas de los archivos de la web servidos por el nodo: los íconos de la marca salen con su tipo
// y las rutas de la SPA caen en `index.html`.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadWebAssets } from './web-assets.ts';

function webDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sigilo-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>SIGILO</title>');
  mkdirSync(join(dir, 'marca'));
  writeFileSync(join(dir, 'marca', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dir, 'marca', 'favicon-32.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(dir, 'marca', 'apple-touch-icon.png'), new Uint8Array([0x89, 0x50]));
  return dir;
}

describe('archivos de la web', () => {
  it('sirve los íconos de la marca con su tipo de contenido', () => {
    const assets = loadWebAssets(webDist());
    expect(assets.resolve('/marca/favicon.svg')?.contentType).toBe('image/svg+xml');
    expect(assets.resolve('/marca/favicon-32.png')?.contentType).toBe('image/png');
    expect(assets.resolve('/marca/apple-touch-icon.png')?.contentType).toBe('image/png');
  });

  it('un archivo inexistente es 404 y una ruta de la SPA es index.html', () => {
    const assets = loadWebAssets(webDist());
    expect(assets.resolve('/marca/falta.svg')).toBeNull();
    expect(assets.resolve('/favicon.ico')).toBeNull();
    expect(assets.resolve('/denunciar')?.contentType).toBe('text/html; charset=utf-8');
  });
});
