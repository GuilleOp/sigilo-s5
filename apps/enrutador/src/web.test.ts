// Pruebas de la ventanilla única en el mismo origen del enrutador: la web con su CSP, la API con
// la del enrutador, y los pasos a la bitácora pública de un nodo, a la solicitud de alta y al
// evaluador, que no reenvían cabeceras de quien pide.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  POW_HEADER,
  ROUTES,
  VENTANILLA_ROUTES,
  WEB_CONFIG_PATH,
} from '@sigilo/contracts';
import type { WebRuntimeConfig } from '@sigilo/contracts';
import { buildPublicKeySet, generateBoxKeyPair, generateSigningKeyPair } from '@sigilo/core';
import type { FetchLike } from '@sigilo/red';
import { createRouterApp } from './app.ts';
import { TEST_DAY, createTestRouter } from './test-support.ts';
import { VENTANILLA_WEB_CSP, loadVentanillaConfig, loadVentanillaWebConfig } from './web.ts';

function webDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sigilo-ventanilla-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ventanilla</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1);');
  mkdirSync(join(dir, 'marca'));
  writeFileSync(join(dir, 'marca', 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(dir, 'marca', 'favicon-32.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  return dir;
}

const REGISTRATION = {
  institutionName: 'Contraloría Ficticia de Prueba',
  stateCode: '22',
  governmentLevel: 'estatal',
  role: 'investigating',
  laws: ['LGRA'],
  supervisorId: null,
  applicant: {
    fullName: 'Persona Solicitante Ficticia',
    position: 'Titular del área de quejas',
    appointment: 'Oficio ficticio 1/2026',
  },
  people: [{ fullName: 'Persona Ficticia Uno', functions: ['intake', 'investigation'] }],
  padlock: {
    keyId: '0123456789abcdef',
    boxPublicKey: 'A'.repeat(43),
    signingPublicKey: 'B'.repeat(43),
  },
};

function setup(webConfig?: WebRuntimeConfig) {
  const router = createTestRouter();
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  const fetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      url: request.url,
      headers: Object.fromEntries(request.headers),
      body: await request.clone().text(),
    });
    return Response.json({ eco: new URL(request.url).pathname }, { status: 201 });
  };
  const app = createRouterApp({
    directory: router.directory,
    national: router.national,
    relay: router.relay,
    now: () => new Date(`${TEST_DAY}T12:00:00Z`),
    ventanilla: {
      distDir: webDist(),
      evaluatorUrl: 'http://evaluador.interno',
      directory: router.directory.directory,
      nodeUrl: (node) => node.baseUrl,
      fetch,
      ...(webConfig === undefined ? {} : { webConfig }),
    },
  });
  return { app, calls, router };
}

describe('ventanilla única en el enrutador', () => {
  it('sirve la web con su CSP y deja la API con la del enrutador', async () => {
    const { app } = setup();
    for (const path of ['/', '/denunciar', '/seguimiento']) {
      const response = await app.request(path);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Ventanilla');
      expect(response.headers.get('Content-Security-Policy')).toBe(VENTANILLA_WEB_CSP);
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    const script = await app.request('/assets/app.js');
    expect(script.headers.get('Content-Type')).toContain('text/javascript');
    expect((await app.request('/assets/falta.js')).status).toBe(404);
    // Íconos de la marca, del mismo origen y con su tipo (la CSP admite img-src 'self').
    const favicon = await app.request('/marca/favicon.svg');
    expect(favicon.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(favicon.headers.get('Content-Security-Policy')).toBe(VENTANILLA_WEB_CSP);
    const png = await app.request('/marca/favicon-32.png');
    expect(png.headers.get('Content-Type')).toBe('image/png');
    expect((await app.request('/marca/falta.png')).status).toBe(404);
    const directory = await app.request(NETWORK_ROUTES.directory);
    expect(directory.status).toBe(200);
    expect(directory.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    const missing = await app.request('/api/v1/complaints');
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
  });

  it('pasa la bitácora pública y la solicitud de alta al nodo, sin cabeceras de quien pide', async () => {
    const { app, calls } = setup();
    const head = await app.request(VENTANILLA_ROUTES.nodeLedgerHead('node.queretaro'), {
      headers: { 'User-Agent': 'navegador-de-prueba', Cookie: 'a=b' },
    });
    expect(head.status).toBe(201);
    expect(calls[0]?.url).toBe(`http://nodo-queretaro.invalid${ROUTES.ledgerHead}`);
    expect(calls[0]?.headers['user-agent']).toBeUndefined();
    expect(calls[0]?.headers.cookie).toBeUndefined();
    await app.request(`${VENTANILLA_ROUTES.nodeLedgerEvents('node.oaxaca')}?from=3&limit=50`);
    expect(calls[1]?.url).toBe(`http://nodo-oaxaca.invalid${ROUTES.ledgerEvents}?from=3&limit=50`);
    expect(
      (await app.request(`${VENTANILLA_ROUTES.nodeLedgerEvents('node.oaxaca')}?from=x`)).status,
    ).toBe(400);
    expect((await app.request(VENTANILLA_ROUTES.nodeLedgerHead('node.nadie'))).status).toBe(404);

    await app.request(VENTANILLA_ROUTES.nodeRegistrationChallenge('node.queretaro'));
    expect(calls[2]?.url).toBe(
      `http://nodo-queretaro.invalid${ROUTES.powChallenge}?purpose=registration`,
    );
    const sent = await app.request(VENTANILLA_ROUTES.nodeRegistrationRequests('node.queretaro'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [POW_HEADER]: 'reto.123' },
      body: JSON.stringify(REGISTRATION),
    });
    expect(sent.status).toBe(201);
    expect(calls[3]?.url).toBe(`http://nodo-queretaro.invalid${ROUTES.registrationRequests}`);
    expect(calls[3]?.headers[POW_HEADER.toLowerCase()]).toBe('reto.123');
    expect(JSON.parse(calls[3]?.body ?? '{}')).toEqual(REGISTRATION);
    const invalid = await app.request(
      VENTANILLA_ROUTES.nodeRegistrationRequests('node.queretaro'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institutionName: 'x' }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(calls).toHaveLength(4);
  });

  it('pasa el reto del evaluador a su dirección interna', async () => {
    const { app, calls } = setup();
    await app.request(CORROBORATION_ROUTES.evaluatorChallenge);
    expect(calls[0]?.url).toBe(
      `http://evaluador.interno${CORROBORATION_ROUTES.evaluatorChallenge}`,
    );
  });

  it('sin corte nacional, el CSV de datos abiertos responde 404', async () => {
    const { app } = setup();
    expect((await app.request(ROUTES.openDataCsv)).status).toBe(404);
  });

  it('lee su configuración del entorno', () => {
    expect(loadVentanillaConfig({})).toBeNull();
    const distDir = webDist();
    expect(
      loadVentanillaConfig({
        SIGILO_ROUTER_WEB_DIST: distDir,
        SIGILO_ROUTER_EVALUATOR_URL: 'http://evaluador:8791',
      }),
    ).toEqual({ distDir, evaluatorUrl: 'http://evaluador:8791' });
    expect(() => loadVentanillaConfig({ SIGILO_ROUTER_WEB_DIST: tmpdir() })).toThrow('index.html');
    expect(() =>
      loadVentanillaConfig({ SIGILO_ROUTER_WEB_DIST: distDir, SIGILO_ROUTER_EVALUATOR_URL: 'x' }),
    ).toThrow('SIGILO_ROUTER_EVALUATOR_URL');
  });

  it('sirve la configuración en tiempo de ejecución con la CSP del enrutador y sin caché', async () => {
    expect((await setup().app.request(WEB_CONFIG_PATH)).status).toBe(404);
    const signing = generateSigningKeyPair();
    const config: WebRuntimeConfig = {
      v: 1,
      pinnedKeys: buildPublicKeySet({
        serverSigningPublicKey: signing.publicKey,
        authorityBoxPublicKey: generateBoxKeyPair().publicKey,
        authoritySigningPublicKey: signing.publicKey,
      }),
      networkTrust: createTestRouter().trust,
      ventanillaUrl: null,
    };
    const { app } = setup(config);
    const response = await app.request(WEB_CONFIG_PATH);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Security-Policy')).not.toBe(VENTANILLA_WEB_CSP);
    expect(await response.json()).toEqual(config);
    const dir = mkdtempSync(join(tmpdir(), 'sigilo-ventanilla-config-'));
    const file = join(dir, 'web-config.json');
    writeFileSync(file, JSON.stringify(config));
    expect(loadVentanillaWebConfig(file)).toEqual(config);
    writeFileSync(file, '{}');
    expect(() => loadVentanillaWebConfig(file)).toThrow(/formato/u);
  });
});
