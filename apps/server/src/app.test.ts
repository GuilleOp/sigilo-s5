// Pruebas transversales: cabeceras de seguridad, CORS, web en el mismo origen, rutas desconocidas
// y registro sin datos.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ROUTES } from '@sigilo/contracts';
import { PublicKeySetSchema } from '@sigilo/contracts';
import { errorBody } from './http/errors.ts';
import { API_CSP, WEB_CSP } from './security/headers.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  postJson,
  submitComplaint,
} from './test-support/harness.ts';

describe('aplicación', () => {
  it('publica el conjunto de llaves públicas', async () => {
    const server = createTestServer();
    const keys = PublicKeySetSchema.strict().parse(
      await (await server.app.request(ROUTES.keys)).json(),
    );
    expect(keys).toEqual(server.keys.publicKeySet);
  });

  it('aplica cabeceras de seguridad a respuestas correctas y a errores', async () => {
    const server = createTestServer();
    for (const response of [
      await server.app.request(ROUTES.keys),
      await server.app.request('/api/v1/no-existe'),
      await server.app.request(ROUTES.authorityComplaints),
    ]) {
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('responde 404 uniforme a rutas desconocidas', async () => {
    const server = createTestServer();
    const response = await server.app.request('/api/v1/no-existe');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(errorBody('not_found'));
  });

  it('no habilita CORS por omisión', async () => {
    const server = createTestServer();
    const response = await server.app.request(ROUTES.keys, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('envía Strict-Transport-Security solo si se configura', async () => {
    expect(
      (await createTestServer().app.request(ROUTES.keys)).headers.has('Strict-Transport-Security'),
    ).toBe(false);
    const server = createTestServer({ hstsMaxAgeSeconds: 31536000 });
    const response = await server.app.request(ROUTES.keys);
    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains',
    );
  });

  it('permite CORS solo al origen configurado', async () => {
    const server = createTestServer({ allowedOrigin: 'http://localhost:5173' });
    const allowed = await server.app.request(ROUTES.keys, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const other = await server.app.request(ROUTES.keys, {
      headers: { Origin: 'http://evil.example' },
    });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('registra solo método, ruta normalizada, estatus y duración', async () => {
    const server = createTestServer();
    const reporter = createReporter();
    const request = await buildComplaintRequest(server, { mode: 'anonymous', reporter });
    const { folio } = await submitComplaint(server, request);
    await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
    await getAsAuthority(server.app, ROUTES.authorityComplaint(folio));
    for (const entry of server.logs) {
      expect(Object.keys(entry).sort()).toEqual(['durationMs', 'method', 'route', 'status']);
    }
    expect(server.logs.map((entry) => entry.route)).toContain(
      '/api/v1/authority/complaints/:folio',
    );
    expect(JSON.stringify(server.logs)).not.toContain(folio);
  });
});

describe('web en el mismo origen', () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  function webDist(): string {
    const directory = mkdtempSync(join(tmpdir(), 'sigilo-web-'));
    directories.push(directory);
    mkdirSync(join(directory, 'assets'));
    writeFileSync(join(directory, 'index.html'), '<!doctype html><title>SIGILO</title>');
    writeFileSync(join(directory, 'assets', 'app.js'), 'console.log(1);');
    return directory;
  }

  it('sirve archivos, respalda las rutas de la SPA con index.html y aplica cabeceras de web', async () => {
    const server = createTestServer({ webDistDir: webDist(), hstsMaxAgeSeconds: 600 });
    const script = await server.app.request('/assets/app.js');
    expect(script.status).toBe(200);
    expect(script.headers.get('Content-Type')).toBe('text/javascript; charset=utf-8');
    expect(await script.text()).toBe('console.log(1);');
    for (const path of ['/', '/denunciar', '/seguimiento/detalle']) {
      const page = await server.app.request(path);
      expect(page.status, path).toBe(200);
      expect(page.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      expect(await page.text()).toContain('<title>SIGILO</title>');
      expect(page.headers.get('Content-Security-Policy')).toBe(WEB_CSP);
      expect(page.headers.get('X-Frame-Options')).toBe('DENY');
      expect(page.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(page.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(page.headers.get('Cache-Control')).toBe('no-store');
      expect(page.headers.get('Strict-Transport-Security')).toBe('max-age=600; includeSubDomains');
    }
    expect(WEB_CSP).toContain("frame-ancestors 'none'");
  });

  it('responde 404 a archivos inexistentes y mantiene la API intacta', async () => {
    const server = createTestServer({ webDistDir: webDist() });
    expect((await server.app.request('/assets/no-existe.js')).status).toBe(404);
    expect((await server.app.request('/../keys.json')).status).toBe(404);
    const api = await server.app.request('/api/v1/no-existe');
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual(errorBody('not_found'));
    expect(api.headers.get('Content-Security-Policy')).toBe(API_CSP);
    const keys = await server.app.request(ROUTES.keys);
    expect(keys.headers.get('Content-Security-Policy')).toBe(API_CSP);
  });

  it('no arranca si el directorio no tiene index.html', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sigilo-web-'));
    directories.push(directory);
    expect(() => createTestServer({ webDistDir: directory })).toThrow('index.html');
  });
});
