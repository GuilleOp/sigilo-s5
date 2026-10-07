// Pruebas de recepción de denuncias: modos, asociación de pruebas y comprobante firmado.
import { describe, expect, it } from 'vitest';
import { ROUTES, SubmitComplaintResponseSchema } from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { computeSubmissionDigest, isFolio, verifyReceipt } from '@sigilo/core';
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
      ledgerSeq: 0,
      submissionDigest: computeSubmissionDigest(request),
    });
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
