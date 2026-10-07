// Pruebas de recepción de denuncias: modos, catálogos, recibo único, cuota de envíos, asociación
// de pruebas y comprobante firmado.
import { describe, expect, it } from 'vitest';
import {
  POW_HEADER,
  PowChallengeSchema,
  ROUTES,
  SubmitComplaintResponseSchema,
} from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import {
  computeSubmissionDigest,
  formatPowHeader,
  isFolio,
  receivedPayloadDigest,
  solvePow,
  verifyReceipt,
} from '@sigilo/core';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  postJson,
  samplePng,
  submitComplaint,
  uploadEvidence,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';
import { errorBody } from '../http/errors.ts';

async function upload(server: TestServer): Promise<EvidenceDescriptor> {
  const response = await uploadEvidence(server.app, samplePng(), 'image/png');
  return (await response.json()) as EvidenceDescriptor;
}

describe('POST complaints', () => {
  it('recibe una denuncia sellada con prueba y firma un comprobante verificable', async () => {
    const server = createTestServer();
    const evidence = await upload(server);
    const request = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter: createReporter(),
      evidence: [evidence],
    });
    const response = await postJson(server.app, ROUTES.complaints, request);
    expect(response.status).toBe(201);
    const { folio, receipt } = SubmitComplaintResponseSchema.parse(await response.json());
    expect(isFolio(folio)).toBe(true);
    expect(receipt).toMatchObject({
      folio,
      receivedOn: '2026-10-20',
      submissionDigest: computeSubmissionDigest(request),
      payloadDigest: receivedPayloadDigest(folio, computeSubmissionDigest(request)),
    });
    expect(receipt).not.toHaveProperty('ledgerSeq');
    expect(verifyReceipt(receipt, server.serverPublicKey)).toBe(true);
  });

  it('recibe una denuncia anónima sin identidad', async () => {
    const server = createTestServer();
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    const { receipt } = await submitComplaint(server, request);
    expect(verifyReceipt(receipt, server.serverPublicKey)).toBe(true);
  });

  it('rechaza una prueba ya asociada, inexistente o con digesto distinto', async () => {
    const server = createTestServer();
    const evidence = await upload(server);
    const first = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      evidence: [evidence],
    });
    await submitComplaint(server, first);
    const variants: EvidenceDescriptor[] = [
      evidence,
      { ...evidence, evidenceId: 'f'.repeat(32) },
      { ...(await upload(server)), sha256: '0'.repeat(64) },
    ];
    for (const variant of variants) {
      const request = await buildComplaintRequest(server, {
        mode: 'anonymous',
        reporter: createReporter(),
        evidence: [variant],
      });
      const response = await postJson(server.app, ROUTES.complaints, request);
      expect(response.status).toBe(400);
    }
  });

  it('no deja la prueba asociada si la denuncia se rechaza', async () => {
    const server = createTestServer();
    const evidence = await upload(server);
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      evidence: [evidence, evidence],
    });
    expect((await postJson(server.app, ROUTES.complaints, request)).status).toBe(400);
    request.evidence = [evidence];
    expect((await postJson(server.app, ROUTES.complaints, request)).status).toBe(201);
  });

  it('rechaza una identidad sellada hacia una llave distinta de la autoridad', async () => {
    const server = createTestServer();
    const request = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter: createReporter(),
    });
    if (request.sealedIdentity) request.sealedIdentity.keyId = '0123456789abcdef';
    expect((await postJson(server.app, ROUTES.complaints, request)).status).toBe(400);
  });

  it('rechaza un authVerifier que ya usa otra denuncia', async () => {
    const server = createTestServer();
    const reporter = createReporter();
    await submitComplaint(
      server,
      await buildComplaintRequest(server, { mode: 'anonymous', reporter }),
    );
    const again = await buildComplaintRequest(server, { mode: 'anonymous', reporter });
    const response = await postJson(server.app, ROUTES.complaints, again);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(errorBody('bad_request'));
  });

  it('rechaza claves fuera de catálogo en los campos que se publican', async () => {
    const server = createTestServer();
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    for (const facts of [
      { ...request.facts, stateCode: 'Juan Perez es corrupto' },
      { ...request.facts, offenseCode: 'Juan Perez es corrupto' },
      { ...request.facts, entityId: 'Juan Perez es corrupto' },
      { ...request.facts, stateCode: '09', municipalityCode: '014' },
    ]) {
      const response = await postJson(server.app, ROUTES.complaints, { ...request, facts });
      expect(response.status).toBe(400);
    }
  });

  it('aplica la cuota global de envíos de denuncias', async () => {
    const server = createTestServer({
      rateLimits: { complaintSubmissions: { limit: 2, windowMs: 60 * 60 * 1000 } },
    });
    const statuses: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      const request = await buildComplaintRequest(server, {
        mode: 'anonymous',
        reporter: createReporter(),
      });
      statuses.push((await postJson(server.app, ROUTES.complaints, request)).status);
    }
    expect(statuses).toEqual([201, 201, 429]);
  });

  it('los intentos rechazados no gastan la cuota: el freno extremo solo cuenta los confirmados', async () => {
    const server = createTestServer({
      rateLimits: { complaintSubmissions: { limit: 2, windowMs: 60 * 60 * 1000 } },
    });
    const attacker = createReporter();
    const repeated = await buildComplaintRequest(server, { mode: 'anonymous', reporter: attacker });
    await submitComplaint(server, repeated);
    for (let index = 0; index < 20; index += 1) {
      expect((await postJson(server.app, ROUTES.complaints, repeated)).status).toBe(400);
    }
    const legit = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    expect((await postJson(server.app, ROUTES.complaints, legit)).status).toBe(201);
  });

  it('bajo abuso con prueba de trabajo, la denuncia legítima pasa con más dificultad', async () => {
    const server = createTestServer({
      powBits: 2,
      powMaxBits: 6,
      powLoadThresholds: { complaint: 4 },
    });
    const send = async (request: unknown) => {
      const challenge = PowChallengeSchema.parse(
        await (await server.app.request(`${ROUTES.powChallenge}?purpose=complaint`)).json(),
      );
      const counter = solvePow(challenge.token, challenge.bits) ?? '0';
      const response = await server.app.request(ROUTES.complaints, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [POW_HEADER]: formatPowHeader(challenge.token, counter),
        },
        body: JSON.stringify(request),
      });
      return { status: response.status, bits: challenge.bits };
    };
    const attacker = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    const seen: number[] = [];
    for (let index = 0; index < 40; index += 1) seen.push((await send(attacker)).bits);
    expect(seen[0]).toBe(2);
    expect(Math.max(...seen)).toBe(6);
    const legit = await send(
      await buildComplaintRequest(server, { mode: 'anonymous', reporter: createReporter() }),
    );
    expect(legit).toEqual({ status: 201, bits: 6 });
  });

  it('rechaza solicitudes que no cumplen el esquema o no son JSON', async () => {
    const server = createTestServer();
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
    });
    const invalid = await postJson(server.app, ROUTES.complaints, { ...request, version: 2 });
    expect(invalid.status).toBe(400);
    const notJson = await server.app.request(ROUTES.complaints, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hola',
    });
    expect(notJson.status).toBe(415);
    const malformed = await server.app.request(ROUTES.complaints, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual(errorBody('bad_request'));
  });
});
