// Pruebas del evaluador OPRF: llave, prueba de trabajo de un solo uso, evaluación verificable,
// errores uniformes, tope diario y conteos de días cerrados.
import { describe, expect, it } from 'vitest';
import {
  CORROBORATION_ROUTES,
  CorroborationEvaluatorKeySchema,
  EvaluationCountsPageSchema,
  POW_HEADER,
} from '@sigilo/contracts';
import { toBase64Url } from '@sigilo/core';
import { blindCorroboration } from '@sigilo/corroboracion';
import { createChallengeIssuer } from './pow-challenges.ts';
import { EVALUATOR_SCHEMA, openDatabase } from './database.ts';
import {
  corroborateInBrowser,
  createTestCorroboration,
  postJson,
  solvedPowHeader,
} from './test-support.ts';

const OCID = { kind: 'ocid', ocid: 'ocds-fict00-IFFE-AD-2026-0042' } as const;

describe('evaluador OPRF', () => {
  it('publica la misma llave que el directorio y cabeceras fijas', async () => {
    const services = createTestCorroboration();
    const response = await services.evaluatorApp.request(CORROBORATION_ROUTES.evaluatorKey);
    expect(response.status).toBe(200);
    expect(CorroborationEvaluatorKeySchema.parse(await response.json())).toEqual(
      services.directory.corroboration?.evaluator,
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    // H22: sin CORS. La web llega al evaluador por el paso del mismo origen (ventanilla o nodo);
    // otro origen no puede usarlo directo desde el navegador, así el evaluador no ve la IP de quien
    // denuncia.
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    const preflight = await services.evaluatorApp.request(CORROBORATION_ROUTES.evaluations, {
      method: 'OPTIONS',
      headers: { Origin: 'https://otro.example', 'Access-Control-Request-Method': 'POST' },
    });
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBeNull();
  });

  it('evalúa con prueba de trabajo y la respuesta verifica contra la llave del directorio', async () => {
    const services = createTestCorroboration();
    const result = await corroborateInBrowser(services, OCID, '');
    expect(result.keys.tag).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('exige la prueba de trabajo y no acepta un reto dos veces', async () => {
    const services = createTestCorroboration();
    const key = services.evaluatorKey;
    const request = blindCorroboration(OCID, key).request;
    const missing = await postJson(
      services.evaluatorApp,
      CORROBORATION_ROUTES.evaluations,
      request,
    );
    expect(missing.status).toBe(428);
    const header = await solvedPowHeader(services.evaluatorApp);
    const first = await postJson(services.evaluatorApp, CORROBORATION_ROUTES.evaluations, request, {
      [POW_HEADER]: header,
    });
    expect(first.status).toBe(200);
    const replay = await postJson(
      services.evaluatorApp,
      CORROBORATION_ROUTES.evaluations,
      request,
      {
        [POW_HEADER]: header,
      },
    );
    expect(replay.status).toBe(428);
    const [token] = header.split(':');
    const wrong = await postJson(services.evaluatorApp, CORROBORATION_ROUTES.evaluations, request, {
      [POW_HEADER]: `${token}x:1`,
    });
    expect(wrong.status).toBe(428);
    expect(await wrong.json()).toEqual({
      error: { code: 'proof_required', message: expect.any(String) },
    });
  });

  it('rechaza un reto vencido y uno firmado por otro proceso', async () => {
    const services = createTestCorroboration();
    const request = blindCorroboration(OCID, services.evaluatorKey).request;
    const header = await solvedPowHeader(services.evaluatorApp);
    services.clock.set('2026-11-09T12:30:00Z');
    const expired = await postJson(
      services.evaluatorApp,
      CORROBORATION_ROUTES.evaluations,
      request,
      { [POW_HEADER]: header },
    );
    expect(expired.status).toBe(428);
    const foreign = createChallengeIssuer({
      db: openDatabase(':memory:', EVALUATOR_SCHEMA),
      bits: 0,
      now: services.clock.now,
    }).issue();
    const forged = await postJson(
      services.evaluatorApp,
      CORROBORATION_ROUTES.evaluations,
      request,
      { [POW_HEADER]: `${foreign.token}:0` },
    );
    expect(forged.status).toBe(428);
  });

  it('rechaza otra llave, un punto inválido y cuerpos con campos de más', async () => {
    const services = createTestCorroboration();
    const request = blindCorroboration(OCID, services.evaluatorKey).request;
    const send = async (body: unknown) =>
      postJson(services.evaluatorApp, CORROBORATION_ROUTES.evaluations, body, {
        [POW_HEADER]: await solvedPowHeader(services.evaluatorApp),
      });
    expect((await send({ ...request, keyId: '0000000000000000' })).status).toBe(400);
    expect((await send({ ...request, blinded: toBase64Url(new Uint8Array(32)) })).status).toBe(400);
    expect((await send({ ...request, identifier: 'IFFE' })).status).toBe(400);
    const text = await services.evaluatorApp.request(CORROBORATION_ROUTES.evaluations, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(text.status).toBe(415);
  });

  it('aplica el tope diario de evaluaciones', async () => {
    const services = createTestCorroboration({ maxDailyEvaluations: 1 });
    await corroborateInBrowser(services, OCID, '');
    await expect(corroborateInBrowser(services, OCID, '')).rejects.toThrow('429');
    services.clock.set('2026-11-10T12:00:00Z');
    await expect(corroborateInBrowser(services, OCID, '')).resolves.toBeDefined();
  });

  it('publica conteos firmados solo de días cerrados', async () => {
    const services = createTestCorroboration();
    await corroborateInBrowser(services, OCID, '');
    const today = await services.evaluatorApp.request(
      `${CORROBORATION_ROUTES.evaluationCounts}?from=2026-11-09`,
    );
    expect(EvaluationCountsPageSchema.parse(await today.json()).counts).toEqual([]);
    services.clock.set('2026-11-11T08:00:00Z');
    const later = await services.evaluatorApp.request(CORROBORATION_ROUTES.evaluationCounts);
    const page = EvaluationCountsPageSchema.parse(await later.json());
    expect(page.counts.map((count) => [count.day, count.evaluations])).toEqual([
      ['2026-11-09', 1],
      ['2026-11-10', 0],
    ]);
    const invalid = await services.evaluatorApp.request(
      `${CORROBORATION_ROUTES.evaluationCounts}?from=ayer`,
    );
    expect(invalid.status).toBe(400);
    const missing = await services.evaluatorApp.request('/api/v1/corroboracion/otra');
    expect(missing.status).toBe(404);
  });
});
