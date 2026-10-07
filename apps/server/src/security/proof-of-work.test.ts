// Pruebas de la prueba de trabajo: retos firmados, vencimiento, un solo uso, propósito y rutas.
import { describe, expect, it } from 'vitest';
import { POW_HEADER, PowChallengeSchema, ROUTES } from '@sigilo/contracts';
import type { PowPurpose } from '@sigilo/contracts';
import { formatPowHeader, isPowSolution, solvePow } from '@sigilo/core';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  samplePng,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';
import {
  createPowGuard,
  createSlidingCounter,
  loadExtraBits,
  MIN_POW_TTL_MS,
  POW_TTL_MS,
  spentPressure,
} from './proof-of-work.ts';

const BITS = 8;

function solved(guard: ReturnType<typeof createPowGuard>, purpose: PowPurpose): string {
  const { token, bits } = guard.issue(purpose);
  const counter = solvePow(token, bits);
  if (counter === null) throw new Error('Sin solución.');
  return formatPowHeader(token, counter);
}

function expectRejected(action: () => void): void {
  expect(action).toThrow(expect.objectContaining({ code: 'proof_required' }));
}

describe('createPowGuard', () => {
  it('acepta una solución vigente una sola vez y solo para su propósito', () => {
    let now = new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({ bits: BITS, now: () => now });
    const header = solved(guard, 'complaint');
    expectRejected(() => guard.verify(header, 'evidence'));
    guard.verify(header, 'complaint');
    expectRejected(() => guard.verify(header, 'complaint'));
    const late = solved(guard, 'evidence');
    now = new Date(now.getTime() + 11 * 60 * 1000);
    expectRejected(() => guard.verify(late, 'evidence'));
  });

  it('rechaza retos ajenos, alterados, sin resolver o de menor dificultad', () => {
    const now = () => new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({ bits: BITS, now });
    const other = createPowGuard({ bits: BITS, now });
    expectRejected(() => guard.verify(undefined, 'complaint'));
    expectRejected(() => guard.verify('basura', 'complaint'));
    expectRejected(() => guard.verify(solved(other, 'complaint'), 'complaint'));
    const header = solved(guard, 'complaint');
    const [token = '', counter = ''] = header.split(':');
    expectRejected(() => guard.verify(`${token}x:${counter}`, 'complaint'));
    let wrong = Number(counter) + 1;
    while (isPowSolution(token, String(wrong), BITS)) wrong += 1;
    expectRejected(() => guard.verify(`${token}:${wrong}`, 'complaint'));
    const easy = createPowGuard({ bits: 1, now, secret: new Uint8Array(32) });
    const strict = createPowGuard({ bits: BITS, now, secret: new Uint8Array(32) });
    expectRejected(() => strict.verify(solved(easy, 'complaint'), 'complaint'));
  });

  it('con 0 bits no exige nada y valida la dificultad configurada', () => {
    const guard = createPowGuard({ bits: 0, now: () => new Date() });
    guard.verify(undefined, 'complaint');
    expect(guard.issue('complaint').bits).toBe(0);
    expect(() => createPowGuard({ bits: 33, now: () => new Date() })).toThrow('dificultad');
  });

  it('con la lista de gastados llena no rechaza: sube la dificultad, acorta la vigencia y olvida los más viejos', () => {
    let now = new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({ bits: 1, now: () => now, maxSpent: 4 });
    const first = solved(guard, 'complaint');
    guard.verify(first, 'complaint');
    guard.verify(solved(guard, 'complaint'), 'complaint');
    // Mitad llena: un bit más.
    expect(guard.currentBits('complaint')).toBe(2);
    guard.verify(solved(guard, 'complaint'), 'complaint');
    guard.verify(solved(guard, 'complaint'), 'complaint');
    expect(guard.currentBits('complaint')).toBe(4);
    // Llena: la siguiente se acepta igual.
    const late = solved(guard, 'complaint');
    guard.verify(late, 'complaint');
    expectRejected(() => guard.verify(late, 'complaint'));
    // La vigencia de un reto nuevo es más corta que los 10 minutos normales.
    const short = solved(guard, 'evidence');
    now = new Date(now.getTime() + MIN_POW_TTL_MS + 1000);
    expectRejected(() => guard.verify(short, 'evidence'));
  });
});

describe('dificultad adaptativa', () => {
  it('suma un bit por cada duplicación de la carga sobre el umbral y vuelve a bajar', () => {
    let now = new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({
      bits: 2,
      maxBits: 4,
      now: () => now,
      loadThresholds: { complaint: 2 },
    });
    expect(guard.currentBits('complaint')).toBe(2);
    for (let index = 0; index < 3; index += 1)
      guard.verify(solved(guard, 'complaint'), 'complaint');
    expect(guard.currentBits('complaint')).toBe(3);
    expect(guard.issue('complaint').bits).toBe(3);
    // Otro propósito no se ve afectado.
    expect(guard.currentBits('evidence')).toBe(2);
    for (let index = 0; index < 10; index += 1)
      guard.verify(solved(guard, 'complaint'), 'complaint');
    // 13 soluciones: 2 → 4 → 8 → 16 serían 3 bits, pero el máximo es 4.
    expect(guard.currentBits('complaint')).toBe(4);
    now = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    expect(guard.currentBits('complaint')).toBe(2);
  });

  it('calcula los bits de la carga y la presión de la lista de gastados', () => {
    expect([0, 60, 61, 120, 121, 240, 241].map((load) => loadExtraBits(load, 60))).toEqual([
      0, 0, 1, 1, 2, 2, 3,
    ]);
    expect(spentPressure(0, 100, POW_TTL_MS)).toEqual({ extraBits: 0, ttlMs: POW_TTL_MS });
    expect(spentPressure(75, 100, POW_TTL_MS)).toEqual({
      extraBits: 2,
      ttlMs: POW_TTL_MS / 2,
    });
    expect(spentPressure(100, 100, POW_TTL_MS)).toEqual({ extraBits: 3, ttlMs: MIN_POW_TTL_MS });
  });

  it('el contador deslizante olvida lo que sale de la ventana', () => {
    let now = new Date('2026-10-20T10:00:00Z');
    const counter = createSlidingCounter(60_000, () => now);
    counter.record();
    counter.record();
    now = new Date(now.getTime() + 30_000);
    counter.record();
    expect(counter.count()).toBe(3);
    now = new Date(now.getTime() + 35_000);
    expect(counter.count()).toBe(1);
  });
});

describe('rutas con prueba de trabajo', () => {
  async function challenge(server: TestServer, purpose: string) {
    return server.app.request(`${ROUTES.powChallenge}?purpose=${purpose}`);
  }

  async function header(server: TestServer, purpose: PowPurpose): Promise<string> {
    const { token, bits } = PowChallengeSchema.parse(
      await (await challenge(server, purpose)).json(),
    );
    return formatPowHeader(token, solvePow(token, bits) ?? '0');
  }

  it('emite retos y exige la solución en POST complaints y POST evidence', async () => {
    const server = createTestServer({ powBits: BITS });
    expect((await challenge(server, 'otro')).status).toBe(400);
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    const post = (headers: Record<string, string>) =>
      server.app.request(ROUTES.complaints, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(request),
      });
    const missing = await post({});
    expect(missing.status).toBe(428);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      'proof_required',
    );
    const evidenceHeader = await header(server, 'evidence');
    expect((await post({ [POW_HEADER]: evidenceHeader })).status).toBe(428);
    expect((await post({ [POW_HEADER]: await header(server, 'complaint') })).status).toBe(201);

    const upload = (headers: Record<string, string>) =>
      server.app.request(ROUTES.evidenceUpload, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', ...headers },
        body: samplePng(),
      });
    expect((await upload({})).status).toBe(428);
    expect((await upload({ [POW_HEADER]: evidenceHeader })).status).toBe(201);
    expect((await upload({ [POW_HEADER]: evidenceHeader })).status).toBe(428);
  });
});
