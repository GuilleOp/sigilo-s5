// Pruebas de la prueba de trabajo: retos firmados, vencimiento, usos, propósito, acaparamiento,
// vigencia proporcional y rutas.
import { describe, expect, it } from 'vitest';
import { MAX_EVIDENCE_ITEMS, POW_HEADER, PowChallengeSchema, ROUTES } from '@sigilo/contracts';
import type { PowPurpose } from '@sigilo/contracts';
import { formatPowHeader, isPowSolution, powSolveSeconds, solvePow } from '@sigilo/core';
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
  DEFAULT_POW_MAX_BITS,
  loadExtraBits,
  MIN_POW_TTL_MS,
  POW_TTL_MS,
  POW_TTL_SOLVE_FACTOR,
  powTtlMs,
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
  it('acepta una solución vigente solo para su propósito y hasta agotar sus usos', () => {
    let now = new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({ bits: BITS, now: () => now });
    const message = solved(guard, 'message');
    expectRejected(() => guard.verify(message, 'complaint'));
    expectRejected(() => guard.verify(message, 'evidence'));
    guard.verify(message, 'message');
    expectRejected(() => guard.verify(message, 'message'));
    const complaint = solved(guard, 'complaint');
    expectRejected(() => guard.verify(complaint, 'message'));
    guard.verify(complaint, 'complaint');
    expectRejected(() => guard.verify(complaint, 'complaint'));
    expectRejected(() => guard.verify(complaint, 'evidence'));
    const late = solved(guard, 'complaint');
    now = new Date(now.getTime() + powTtlMs(BITS) + 1000);
    expectRejected(() => guard.verify(late, 'complaint'));
  });

  it('un reto complaint cubre las pruebas de la denuncia y después la denuncia', () => {
    const now = () => new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({ bits: BITS, now });
    const header = solved(guard, 'complaint');
    for (let index = 0; index < MAX_EVIDENCE_ITEMS; index += 1) guard.verify(header, 'evidence');
    expectRejected(() => guard.verify(header, 'evidence'));
    guard.verify(header, 'complaint');
    expectRejected(() => guard.verify(header, 'complaint'));
  });

  it('un reto acaparado con poca carga deja de servir cuando la dificultad sube más de un bit', () => {
    const now = () => new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({ bits: 2, maxBits: 8, now, loadThresholds: { complaint: 2 } });
    const hoard = [solved(guard, 'complaint'), solved(guard, 'complaint')];
    for (let index = 0; index < 3; index += 1)
      guard.verify(solved(guard, 'complaint'), 'complaint');
    // Carga 3 sobre umbral 2: un bit más. Un reto de la base sigue valiendo (tolerancia de 1).
    expect(guard.currentBits('complaint')).toBe(3);
    guard.verify(hoard[0] ?? '', 'complaint');
    guard.verify(solved(guard, 'complaint'), 'complaint');
    // Carga 5: dos bits más; el reto de la base ya no sirve.
    expect(guard.currentBits('complaint')).toBe(4);
    expectRejected(() => guard.verify(hoard[1] ?? '', 'complaint'));
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
    // El margen de vigencia de un reto nuevo se acorta al mínimo.
    const short = solved(guard, 'message');
    now = new Date(now.getTime() + powTtlMs(guard.currentBits('message'), MIN_POW_TTL_MS) + 1000);
    expectRejected(() => guard.verify(short, 'message'));
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
    expect(guard.currentBits('message')).toBe(2);
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

  it('la vigencia crece con 2^bits y nunca baja del percentil 95 de un celular lento', () => {
    expect(DEFAULT_POW_MAX_BITS).toBe(20);
    for (const bits of [0, 8, 18, 20, 24]) {
      const solveMs = powSolveSeconds(bits) * 1000;
      expect(powTtlMs(bits)).toBeGreaterThanOrEqual(POW_TTL_MS + POW_TTL_SOLVE_FACTOR * solveMs);
      expect(powTtlMs(bits, MIN_POW_TTL_MS)).toBeGreaterThan(solveMs);
    }
    // A 20 bits: 4 · ln(20) · 2^20 / 50 000 ≈ 251 s además del margen.
    expect(Math.round((powTtlMs(20) - POW_TTL_MS) / 1000)).toBe(251);
    expect(powTtlMs(22) - POW_TTL_MS).toBeCloseTo(4 * (powTtlMs(20) - POW_TTL_MS), -2);
    // El reto emitido lleva esa vigencia.
    let now = new Date('2026-10-20T10:00:00Z');
    const guard = createPowGuard({ bits: 4, now: () => now });
    const header = solved(guard, 'message');
    now = new Date(now.getTime() + powTtlMs(4) - 1000);
    guard.verify(header, 'message');
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
    expect((await challenge(server, 'evidence')).status).toBe(400);
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
    expect((await post({ [POW_HEADER]: await header(server, 'message') })).status).toBe(428);

    // El mismo reto sirve para las pruebas y después para la denuncia, que lo cierra.
    const shared = await header(server, 'complaint');
    const upload = (headers: Record<string, string>) =>
      server.app.request(ROUTES.evidenceUpload, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png', ...headers },
        body: samplePng(),
      });
    expect((await upload({})).status).toBe(428);
    expect((await upload({ [POW_HEADER]: shared })).status).toBe(201);
    expect((await upload({ [POW_HEADER]: shared })).status).toBe(201);
    expect((await post({ [POW_HEADER]: shared })).status).toBe(201);
    expect((await upload({ [POW_HEADER]: shared })).status).toBe(428);
  });
});
