// Pruebas del alta de autoridades: solicitud pública con prueba de trabajo, candado consistente,
// bandeja solo para la operación del nodo y aprobación con la huella confirmada.
import { describe, expect, it } from 'vitest';
import {
  POW_HEADER,
  PowChallengeSchema,
  RegistrationListSchema,
  RegistrationReceiptSchema,
  RegistrationViewSchema,
  ROUTES,
} from '@sigilo/contracts';
import type { RegistrationRequest } from '@sigilo/contracts';
import {
  formatPowHeader,
  generateBoxKeyPair,
  generateSigningKeyPair,
  keyIdFor,
  padlockFingerprint,
  solvePow,
  toBase64Url,
} from '@sigilo/core';
import { createTestServer, getAsAuthority, postJson, testToken } from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

const OPERATION = testToken('nodeOperation');

function sampleRequest(): { request: RegistrationRequest; fingerprint: string } {
  const box = generateBoxKeyPair();
  const signing = generateSigningKeyPair();
  return {
    fingerprint: padlockFingerprint(box.publicKey, signing.publicKey),
    request: {
      institutionName: 'Secretaría de la Contraloría Ficticia de Oaxaca',
      stateCode: '20',
      governmentLevel: 'estatal',
      role: 'investigating',
      laws: ['LGRA'],
      supervisorId: null,
      applicant: {
        fullName: 'Persona Solicitante Ficticia',
        position: 'Titular del área de quejas',
        appointment: 'Oficio SCF/001/2026 del 2 de enero de 2026',
      },
      people: [{ fullName: 'Persona Ficticia Uno', functions: ['intake', 'investigation'] }],
      padlock: {
        keyId: keyIdFor(box.publicKey),
        boxPublicKey: toBase64Url(box.publicKey),
        signingPublicKey: toBase64Url(signing.publicKey),
      },
    },
  };
}

async function submit(server: TestServer, body: unknown) {
  const { token, bits } = PowChallengeSchema.parse(
    await (await server.app.request(`${ROUTES.powChallenge}?purpose=registration`)).json(),
  );
  return server.app.request(ROUTES.registrationRequests, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [POW_HEADER]: formatPowHeader(token, solvePow(token, bits) ?? '0'),
    },
    body: JSON.stringify(body),
  });
}

describe('solicitud de alta', () => {
  it('recibe la solicitud y devuelve el folio y la huella del candado', async () => {
    const server = createTestServer();
    const { request, fingerprint } = sampleRequest();
    const response = await submit(server, request);
    expect(response.status).toBe(201);
    const receipt = RegistrationReceiptSchema.parse(await response.json());
    expect(receipt.fingerprint).toBe(fingerprint);
  });

  it('exige la prueba de trabajo', async () => {
    const server = createTestServer({ powBits: 4 });
    const response = await postJson(
      server.app,
      ROUTES.registrationRequests,
      sampleRequest().request,
    );
    expect(response.status).not.toBe(201);
    expect((await submit(server, sampleRequest().request)).status).toBe(201);
  });

  it('rechaza un candado cuyo keyId no corresponde y cualquier campo de llave privada', async () => {
    const server = createTestServer();
    const { request } = sampleRequest();
    const wrongKeyId = { ...request, padlock: { ...request.padlock, keyId: '0000000000000000' } };
    expect((await submit(server, wrongKeyId)).status).toBe(400);
    const withPrivate = {
      ...request,
      padlock: { ...request.padlock, boxPrivateKey: request.padlock.boxPublicKey },
    };
    expect((await submit(server, withPrivate)).status).toBe(400);
  });

  it('no deja pedir la función de operación del nodo', async () => {
    const server = createTestServer();
    const { request } = sampleRequest();
    const body = {
      ...request,
      people: [{ fullName: 'Persona Ficticia', functions: ['operation'] }],
    };
    expect((await submit(server, body)).status).toBe(400);
  });
});

describe('bandeja de operación', () => {
  async function pending(server: TestServer) {
    const sample = sampleRequest();
    const receipt = RegistrationReceiptSchema.parse(
      await (await submit(server, sample.request)).json(),
    );
    return { ...sample, requestId: receipt.requestId };
  }

  it('solo la operación del nodo ve las solicitudes; la operación no ve denuncias', async () => {
    const server = createTestServer();
    await pending(server);
    const list = await getAsAuthority(server.app, ROUTES.operationRegistrations, OPERATION);
    expect(list.status).toBe(200);
    expect(RegistrationListSchema.parse(await list.json()).registrations).toHaveLength(1);
    for (const name of ['inboxIntake', 'oicIntakeInvestigator', 'supervisor'] as const) {
      const denied = await getAsAuthority(
        server.app,
        ROUTES.operationRegistrations,
        testToken(name),
      );
      expect(denied.status).toBe(403);
    }
    for (const path of [ROUTES.authorityComplaints, ROUTES.authorityAuthorities]) {
      expect((await getAsAuthority(server.app, path, OPERATION)).status).toBe(403);
    }
    expect((await server.app.request(ROUTES.operationRegistrations)).status).toBe(401);
  });

  it('aprobar exige la huella correcta y devuelve la entrada propuesta del directorio', async () => {
    const server = createTestServer();
    const { requestId, fingerprint, request } = await pending(server);
    const path = ROUTES.operationRegistrationDecision(requestId);
    const wrong = await postJson(
      server.app,
      path,
      { decision: 'approve', fingerprint: '0000 0000 0000 0000' },
      OPERATION,
    );
    expect(wrong.status).toBe(409);
    const approved = await postJson(
      server.app,
      path,
      { decision: 'approve', fingerprint },
      OPERATION,
    );
    expect(approved.status).toBe(200);
    const view = RegistrationViewSchema.parse(await approved.json());
    expect(view.status).toBe('approved');
    expect(view.decision?.accountId).toBe('acct-000000000000000c');
    expect(view.directoryEntry).toMatchObject({
      id: 'authority.secretaria-de-la-contraloria-ficticia-de-oaxaca',
      stateCode: '20',
      boxPublicKey: request.padlock.boxPublicKey,
      competence: { stateCodes: ['20'], laws: ['LGRA'] },
    });
    const again = await postJson(
      server.app,
      path,
      { decision: 'reject', reason: 'Otra vez' },
      OPERATION,
    );
    expect(again.status).toBe(409);
  });

  it('rechazar exige un motivo y lo guarda', async () => {
    const server = createTestServer();
    const { requestId } = await pending(server);
    const path = ROUTES.operationRegistrationDecision(requestId);
    expect(
      (await postJson(server.app, path, { decision: 'reject', reason: '' }, OPERATION)).status,
    ).toBe(400);
    const rejected = await postJson(
      server.app,
      path,
      { decision: 'reject', reason: 'El nombramiento no coincide con el registro.' },
      OPERATION,
    );
    const view = RegistrationViewSchema.parse(await rejected.json());
    expect(view.status).toBe('rejected');
    expect(view.decision?.reason).toBe('El nombramiento no coincide con el registro.');
    expect(view.directoryEntry).toBeNull();
  });
});
