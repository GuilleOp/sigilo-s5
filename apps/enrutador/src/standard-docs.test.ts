// Pruebas de la vista del Estándar S5 en el origen del enrutador: Swagger UI con su desplegable, de
// la versión fija de swagger-ui-dist (sin CDN), con una CSP de solo el mismo origen que no cambia la
// de la API ni la de la web de la ventanilla.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NETWORK_ROUTES } from '@sigilo/contracts';
import { createRouterApp } from './app.ts';
import { STANDARD_DOCS_CSP, STANDARD_DOCS_PAGE, loadStandardDocsConfig } from './standard-docs.ts';
import type { StandardDocsConfig } from './standard-docs.ts';
import { TEST_DAY, createTestRouter } from './test-support.ts';
import { VENTANILLA_WEB_CSP } from './web.ts';

function docsConfig(): StandardDocsConfig {
  const config = loadStandardDocsConfig({});
  if (config === null) throw new Error('Falta estandar/swagger o swagger-ui-dist.');
  return config;
}

function setup(withVentanilla = false) {
  const router = createTestRouter();
  const webDir = mkdtempSync(join(tmpdir(), 'sigilo-estandar-web-'));
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>Ventanilla</title>');
  return createRouterApp({
    directory: router.directory,
    national: router.national,
    relay: router.relay,
    now: () => new Date(`${TEST_DAY}T12:00:00Z`),
    standardDocs: docsConfig(),
    ...(withVentanilla
      ? {
          ventanilla: {
            distDir: webDir,
            evaluatorUrl: null,
            directory: router.directory.directory,
            nodeUrl: (node) => node.baseUrl,
            fetch: async () => Response.json({}),
          },
        }
      : {}),
  });
}

describe('vista del Estándar S5 en /estandar/', () => {
  it('sirve Swagger UI con el desplegable y una CSP de solo el mismo origen', async () => {
    for (const withVentanilla of [false, true]) {
      const app = setup(withVentanilla);
      const redirect = await app.request('/estandar');
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get('Location')).toBe(STANDARD_DOCS_PAGE);
      const page = await app.request(STANDARD_DOCS_PAGE);
      expect(page.status).toBe(200);
      expect(page.headers.get('Content-Type')).toContain('text/html');
      expect(page.headers.get('Content-Security-Policy')).toBe(STANDARD_DOCS_CSP);
      expect(page.headers.get('X-Frame-Options')).toBe('DENY');
      const html = await page.text();
      expect(html).toContain('./vendor/swagger-ui-bundle.js');
      expect(html).not.toMatch(/https?:\/\//u);
      const init = await (await app.request(`${STANDARD_DOCS_PAGE}swagger-init.js`)).text();
      expect(init).toContain('S5 - Estadísticas de denuncias (PDN)');
      expect(init).toContain('../oas/OAS_API_S5_Estadisticas_Denuncias.json');
      // La API del enrutador conserva su CSP.
      const api = await app.request(NETWORK_ROUTES.directory);
      expect(api.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
      if (withVentanilla) {
        const web = await app.request('/denunciar');
        expect(web.headers.get('Content-Security-Policy')).toBe(VENTANILLA_WEB_CSP);
      }
    }
  });

  it('sirve Swagger UI de swagger-ui-dist y los documentos del estándar', async () => {
    const app = setup();
    const bundle = await app.request(`${STANDARD_DOCS_PAGE}vendor/swagger-ui-bundle.js`);
    expect(bundle.status).toBe(200);
    expect(bundle.headers.get('Content-Type')).toContain('text/javascript');
    expect(
      (await app.request(`${STANDARD_DOCS_PAGE}vendor/swagger-ui-standalone-preset.js`)).status,
    ).toBe(200);
    const profile = await app.request('/estandar/oas/OAS_API_S5_Estadisticas_Denuncias.json');
    expect(profile.status).toBe(200);
    const document = (await profile.json()) as { openapi: string; paths: object };
    expect(document.openapi).toBe('3.0.3');
    expect(Object.keys(document.paths)).toContain('/v1/denuncias/estadisticas');
    expect((await app.request('/estandar/openapi.json')).status).toBe(200);
    expect((await app.request('/estandar/catalogos/faltas.csv')).status).toBe(200);
    // La marca del encabezado es una copia local del símbolo.
    const mark = await app.request(`${STANDARD_DOCS_PAGE}sigilo-simbolo-claro.svg`);
    expect(mark.status).toBe(200);
    expect(mark.headers.get('Content-Type')).toBe('image/svg+xml');
  });

  it('no sale de sus archivos', async () => {
    const app = setup();
    for (const path of [
      '/estandar/../package.json',
      '/estandar/%2e%2e/package.json',
      '/estandar/swagger/vendor/package.json',
      '/estandar/reportes/referencia-2026-11-05.json',
      '/estandar/no-existe.json',
    ]) {
      expect((await app.request(path)).status, path).toBe(404);
    }
  });

  it('una carpeta indicada sin la vista es un error de configuración', () => {
    const empty = mkdtempSync(join(tmpdir(), 'sigilo-estandar-vacio-'));
    expect(() => loadStandardDocsConfig({ SIGILO_ROUTER_STANDARD_DIR: empty })).toThrow(
      'swagger/index.html',
    );
  });
});
