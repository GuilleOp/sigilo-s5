// Archivos de datos del nodo fuera de la API: la configuración de la web en tiempo de ejecución
// (`/config/sigilo.json`, ADR 0011) y el calendario de días inhábiles locales que publica el nodo.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PublishedRestDaysSchema,
  REST_DAYS_PATH,
  WEB_CONFIG_PATH,
  WebRuntimeConfigSchema,
} from '@sigilo/contracts';
import { computeDueDate } from '@sigilo/core';
import { NODE_PROFILE_FRONTS } from './http/exposure.ts';
import { loadWebConfig } from './http/web-assets.ts';
import { API_CSP } from './security/headers.ts';
import { buildNodeCalendar, loadNodeCalendar } from './services/calendar.ts';
import { createTestServer } from './test-support/harness.ts';

const directories: string[] = [];

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'sigilo-runtime-'));
  directories.push(directory);
  return directory;
}

function webDist(): string {
  const directory = tempDir();
  mkdirSync(join(directory, 'assets'));
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>SIGILO</title>');
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('configuración de la web en tiempo de ejecución', () => {
  it('se sirve en el mismo origen, sin caché y con la CSP de la API', async () => {
    const base = createTestServer();
    const webConfig = WebRuntimeConfigSchema.parse({
      v: 1,
      pinnedKeys: base.keys.publicKeySet,
      networkTrust: null,
      ventanillaUrl: 'https://ventanilla.ejemplo.invalid',
    });
    const server = createTestServer({ webDistDir: webDist(), webConfig });
    const response = await server.app.request(WEB_CONFIG_PATH);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).toBe(API_CSP);
    expect(WebRuntimeConfigSchema.parse(await response.json())).toEqual(webConfig);
  });

  it('sin archivo responde 404 (la web usa su bundle) y sin web no se sirve', async () => {
    const withoutFile = createTestServer({ webDistDir: webDist() });
    expect((await withoutFile.app.request(WEB_CONFIG_PATH)).status).toBe(404);
    const base = createTestServer();
    const withoutWeb = createTestServer({
      webConfig: {
        v: 1,
        pinnedKeys: base.keys.publicKeySet,
        networkTrust: null,
        ventanillaUrl: null,
      },
    });
    expect((await withoutWeb.app.request(WEB_CONFIG_PATH)).status).toBe(404);
  });

  it('el archivo se valida al arrancar', () => {
    const directory = tempDir();
    expect(loadWebConfig(join(directory, 'no-existe.json'))).toBeNull();
    const bad = join(directory, 'web-config.json');
    writeFileSync(bad, JSON.stringify({ v: 1, pinnedKeys: {} }));
    expect(() => loadWebConfig(bad)).toThrow(/formato/u);
  });
});

describe('días inhábiles locales', () => {
  it('se suman a los oficiales en los plazos y se publican con su digesto', async () => {
    const calendar = buildNodeCalendar([
      { fecha: '2026-11-03', nombre: 'Día ficticio', fundamento: 'Acuerdo ficticio 1/2026' },
    ]);
    // Del lunes 2 de noviembre de 2026, 1 día hábil: el martes 3 es inhábil local.
    expect(computeDueDate('2026-11-02', { unit: 'business_days', amount: 1 })).toBe('2026-11-03');
    expect(
      computeDueDate('2026-11-02', { unit: 'business_days', amount: 1 }, calendar.calendar),
    ).toBe('2026-11-04');
    const server = createTestServer({ calendar, exposedFronts: NODE_PROFILE_FRONTS });
    const response = await server.app.request(REST_DAYS_PATH);
    expect(response.status).toBe(200);
    const published = PublishedRestDaysSchema.parse(await response.json());
    expect(published.locales).toHaveLength(1);
    expect(published.oficiales.length).toBeGreaterThan(20);
    expect(published.digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('rechaza días repetidos o fuera de la cobertura, y sin archivo usa los oficiales', () => {
    const day = { fecha: '2026-11-03', nombre: 'Día ficticio', fundamento: 'Acuerdo ficticio' };
    expect(() => buildNodeCalendar([day, day])).toThrow(/repetido/u);
    expect(() => buildNodeCalendar([{ ...day, fecha: '2031-01-02' }])).toThrow();
    const directory = tempDir();
    expect(loadNodeCalendar(join(directory, 'no-existe.json')).published.locales).toEqual([]);
    const bad = join(directory, 'dias-inhabiles.json');
    writeFileSync(bad, JSON.stringify({ v: 1, dias: [{ fecha: '2026-13-01' }] }));
    expect(() => loadNodeCalendar(bad)).toThrow(/formato/u);
  });
});
