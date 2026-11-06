// Pruebas de extremo a extremo del validador con Chromium contra sitios locales: uno bueno, uno
// malo y un tercero simulado que Chromium resuelve a 127.0.0.1. Nada sale a internet.
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CHECKS, NOT_AUTOMATED_SUMMARY } from './catalog.ts';
import type { CheckId, CheckStatus, ValidationReport } from './types.ts';
import { createSocket } from 'node:dgram';
import type { Socket as UdpSocket } from 'node:dgram';
import type { AddressInfo } from 'node:net';
import {
  startBadSite,
  startHostileSite,
  startGoodSite,
  startThirdParty,
  TEST_HOST_RULES,
  THIRD_PARTY_HOST,
} from './test-support/fixture-sites.ts';
import type { FixtureSite } from './test-support/fixture-sites.ts';
import { startReferenceNode } from './test-support/reference-node.ts';
import type { TestNode } from './test-support/reference-node.ts';
import { OPENAPI_PATH, runValidation } from './run.ts';
import { reportBaseName } from './report/json-report.ts';
import { USER_AGENT } from './version.ts';

const BROWSER_TIMEOUT_MS = 90_000;

function statusOf(report: ValidationReport, id: CheckId): CheckStatus | undefined {
  return report.checks.find((check) => check.id === id)?.status;
}

function baseOptions(url: string) {
  return {
    url,
    mode: 'pasivo' as const,
    formPath: '/presentar-denuncia',
    maxRequests: 100,
    navigationTimeoutMs: 15_000,
    maxResourceBytes: 1024 * 1024,
    allowThirdParty: false,
    openApiPath: OPENAPI_PATH,
    hostResolverRules: TEST_HOST_RULES,
    settleMs: 300,
  };
}

describe('modo pasivo con Chromium', () => {
  let good: FixtureSite;
  let bad: FixtureSite;
  let thirdParty: FixtureSite;
  beforeAll(async () => {
    thirdParty = await startThirdParty();
    good = await startGoodSite();
    bad = await startBadSite(`http://${THIRD_PARTY_HOST}:${thirdParty.port}`);
  });
  afterAll(async () => {
    await Promise.all([good.close(), bad.close(), thirdParty.close()]);
  });

  it(
    'el sitio bueno cumple las verificaciones pasivas',
    async () => {
      const report = await runValidation(baseOptions(good.url));
      const expected: Partial<Record<CheckId, CheckStatus>> = {
        'PRV-01': 'cumple',
        'PRV-02': 'cumple',
        'PRV-03': 'no_aplica',
        'PRV-04': 'cumple',
        'PRV-05': 'cumple',
        'PRV-06': 'cumple',
        'PRV-07': 'cumple',
        'PRV-08': 'cumple',
        'PRV-09': 'no_aplica',
        'PRV-10': 'cumple',
        'PRV-11': 'cumple',
        'PRV-13': 'cumple',
        'PRV-14': 'no_aplica',
        'API-01': 'no_aplica',
      };
      for (const [id, status] of Object.entries(expected)) {
        expect(statusOf(report, id as CheckId), id).toBe(status);
      }
      // Cookie Secure sobre HTTP local: Chromium la acepta en 127.0.0.1 y el validador no la penaliza.
      expect(['cumple', 'advertencia']).toContain(statusOf(report, 'PRV-12'));
      expect(report.checks.map((check) => check.id)).toHaveLength(CHECKS.length);
      expect(report.checks.find((check) => check.id === 'SEC-31')?.summary).toBe(
        NOT_AUTOMATED_SUMMARY,
      );
      expect(report.errors).toEqual([]);
      // Ética: solo GET, una visita por página más su fetch de cabeceras.
      expect(good.hits.every((hit) => hit.startsWith('GET '))).toBe(true);
      expect(good.hits.filter((hit) => hit === 'GET /presentar-denuncia')).toHaveLength(2);
    },
    BROWSER_TIMEOUT_MS,
  );

  it(
    'el sitio malo incumple y el tercero nunca recibe peticiones',
    async () => {
      const report = await runValidation(baseOptions(bad.url));
      const expected: Partial<Record<CheckId, CheckStatus>> = {
        'PRV-01': 'no_cumple',
        'PRV-02': 'no_cumple',
        'PRV-04': 'no_cumple',
        'PRV-05': 'no_cumple',
        'PRV-06': 'no_cumple',
        'PRV-07': 'no_cumple',
        'PRV-08': 'advertencia',
        'PRV-09': 'advertencia',
        'PRV-10': 'advertencia',
        'PRV-11': 'advertencia',
        'PRV-12': 'no_cumple',
        'PRV-13': 'advertencia',
      };
      for (const [id, status] of Object.entries(expected)) {
        expect(statusOf(report, id as CheckId), id).toBe(status);
      }
      expect(thirdParty.hits).toEqual([]);
      expect(bad.hits.some((hit) => hit.startsWith('POST'))).toBe(false);
      expect(bad.hits.some((hit) => hit.includes('/api/auth/'))).toBe(false);
      const blocked = report.network.requests.filter((request) => request.isBlocked);
      expect(blocked.map((request) => request.blockReason).join(' ')).toContain('método POST');
      expect(blocked.map((request) => request.blockReason).join(' ')).toContain('autenticación');
      const draft = report.checks.find((check) => check.id === 'PRV-10');
      expect(draft?.evidence.some((item) => item.name === 'borrador-denuncia')).toBe(true);
      expect(report.observations.some((item) => item.value === 'MarcoSintetico 1.0')).toBe(true);
    },
    BROWSER_TIMEOUT_MS,
  );

  it(
    'respeta el tope de peticiones',
    async () => {
      const report = await runValidation({ ...baseOptions(good.url), maxRequests: 2 });
      expect(report.network.isRequestLimitReached).toBe(true);
      expect(report.network.requestCount).toBeLessThanOrEqual(2);
    },
    BROWSER_TIMEOUT_MS,
  );
});

describe('sitio hostil: WebSocket, WebRTC y redirecciones', () => {
  let hostile: FixtureSite;
  let thirdParty: FixtureSite;
  let stun: UdpSocket;
  const udpMessages: number[] = [];
  beforeAll(async () => {
    thirdParty = await startThirdParty();
    stun = createSocket('udp4');
    stun.on('message', (message) => udpMessages.push(message.length));
    await new Promise<void>((resolve) => stun.bind(0, '127.0.0.1', resolve));
    const { port } = stun.address() as AddressInfo;
    hostile = await startHostileSite(`http://${THIRD_PARTY_HOST}:${thirdParty.port}`, port);
  });
  afterAll(async () => {
    stun.close();
    await Promise.all([hostile.close(), thirdParty.close()]);
  });

  it(
    'bloquea y registra WebSocket a terceros y WebRTC, y no sigue saltos prohibidos',
    async () => {
      const report = await runValidation({ ...baseOptions(hostile.url), settleMs: 1500 });
      // Nada llegó al tercero: ni el WebSocket, ni la redirección del formulario.
      expect(thirdParty.hits).toEqual([]);
      // El STUN local no recibió nada: WebRTC quedó deshabilitado.
      expect(udpMessages).toEqual([]);
      // La redirección del marco hacia /admin/panel se detuvo en el validador.
      expect(hostile.hits.some((hit) => hit.includes('/admin/panel'))).toBe(false);
      // Ningún WebSocket se abre, ni siquiera al propio origen (queda registrado).
      expect(hostile.hits.some((hit) => hit.startsWith('UPGRADE'))).toBe(false);
      const ownWs = report.network.requests.find((request) => request.url.endsWith('/ws-propio'));
      expect(ownWs?.isBlocked).toBe(true);
      const requests = report.network.requests;
      const ws = requests.find(
        (request) => request.resourceType === 'websocket' && request.party === 'tercero',
      );
      expect(ws?.isBlocked).toBe(true);
      const rtc = requests.find((request) => request.resourceType === 'webrtc');
      expect(rtc?.url).toContain('stun:127.0.0.1');
      const admin = requests.find((request) => request.url.endsWith('/admin/panel'));
      expect(admin?.blockReason).toBe('ruta de autenticación o privada');
      const prv01 = report.checks.find((check) => check.id === 'PRV-01');
      expect(prv01?.status).toBe('no_cumple');
      const text = prv01?.evidence.map((item) => item.description).join(' ') ?? '';
      expect(text).toContain('WebSocket a un tercero');
      expect(text).toContain('WebRTC');
      // El formulario redirige al tercero: no se siguió y sus cabeceras no se evaluaron.
      expect(report.errors.join(' ')).toContain('redirige a un tercero');
      const csp = report.checks.find((check) => check.id === 'PRV-02');
      expect(csp?.evidence.every((item) => !item.url?.includes(THIRD_PARTY_HOST))).toBe(true);
    },
    BROWSER_TIMEOUT_MS,
  );

  it('rechaza un formulario de otro origen y el modo conformidad contra un host público', async () => {
    await expect(
      runValidation({ ...baseOptions(hostile.url), formPath: 'https://otro.example/form' }),
    ).rejects.toThrow('mismo sitio');
    await expect(
      runValidation({ ...baseOptions('https://denuncias.ejemplo.org/'), mode: 'conformidad' }),
    ).rejects.toThrow('--confirmo-nodo-propio');
  });
});

describe('modo conformidad con Chromium contra la referencia en memoria', () => {
  let node: TestNode;
  beforeAll(async () => {
    node = await startReferenceNode();
  });
  afterAll(async () => {
    await node.close();
  });

  it(
    'evalúa PRV-14, PRV-15, API-02 y la sonda de borradores',
    async () => {
      const report = await runValidation({
        ...baseOptions(node.url),
        mode: 'conformidad',
        formPath: '/denunciar',
      });
      expect(statusOf(report, 'PRV-14')).toBe('cumple');
      expect(statusOf(report, 'PRV-09')).toBe('cumple');
      expect(['cumple', 'advertencia']).toContain(statusOf(report, 'PRV-15'));
      expect(statusOf(report, 'PRV-10')).toBe('cumple');
      expect(statusOf(report, 'API-02')).toBe('cumple');
      // Contra estandar/openapi.yaml: rutas, estatus, tipos y esquemas de la referencia.
      const api = report.checks.find((check) => check.id === 'API-01');
      expect(api?.status, JSON.stringify(api?.evidence)).toBe('cumple');
      expect(api?.evidence.at(-1)?.description).toContain('openapi.yaml');
      expect(statusOf(report, 'PRV-02')).toBe('cumple');
      expect(statusOf(report, 'PRV-06')).toBe('cumple');
    },
    BROWSER_TIMEOUT_MS,
  );
});

describe('CLI', () => {
  let good: FixtureSite;
  const output = mkdtempSync(join(tmpdir(), 'sigilo-validar-cli-'));
  beforeAll(async () => {
    good = await startGoodSite();
  });
  afterAll(async () => {
    await good.close();
    rmSync(output, { recursive: true, force: true });
  });

  it(
    'escribe los reportes JSON y HTML y usa el User-Agent identificable',
    async () => {
      const run = promisify(execFile);
      const cli = join(import.meta.dirname, 'cli.ts');
      const { stdout } = await run(
        process.execPath,
        [cli, good.url, '--salida', output, '--nombre', 'prueba', '--max-peticiones', '50'],
        { timeout: BROWSER_TIMEOUT_MS },
      );
      expect(stdout).toContain(USER_AGENT);
      // El nombre usa el día en hora del centro de México, igual que la CLI.
      const baseName = reportBaseName('prueba', new Date());
      const jsonPath = join(output, `${baseName}.json`);
      expect(existsSync(jsonPath)).toBe(true);
      expect(existsSync(join(output, `${baseName}.html`))).toBe(true);
      const report = JSON.parse(readFileSync(jsonPath, 'utf8')) as ValidationReport;
      expect(report.tool.userAgent).toBe(USER_AGENT);
      expect(report.mode).toBe('pasivo');
    },
    BROWSER_TIMEOUT_MS,
  );

  it('rechaza un modo desconocido con código 2', async () => {
    const run = promisify(execFile);
    const cli = join(import.meta.dirname, 'cli.ts');
    await expect(
      run(process.execPath, [cli, good.url, '--modo', 'agresivo']),
    ).rejects.toMatchObject({
      code: 2,
    });
  });
});
