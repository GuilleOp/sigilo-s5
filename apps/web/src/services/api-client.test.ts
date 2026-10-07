// Pruebas del cliente HTTP: rutas permitidas, validación de respuestas y errores.
import { describe, expect, it } from 'vitest';
import { HPKE_SUITE_V1, POW_HEADER, PublicKeySetSchema, ROUTES } from '@sigilo/contracts';
import type { ReporterMessageRequest } from '@sigilo/contracts';
import { ApiRequestError, buildApiUrl, createApiClient } from './api-client.ts';
import type { FetchLike } from './api-client.ts';
import { createSigiloApi } from './api.ts';
import pinned from '../config/pinned-keys.json';

function fakeFetch(response: Response, calls: { input: string; init: RequestInit }[] = []) {
  const impl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    return response;
  };
  return impl;
}

describe('buildApiUrl', () => {
  it('admite rutas de la API y agrega la consulta', () => {
    expect(buildApiUrl(ROUTES.ledgerEvents, { from: '0', limit: '100' })).toBe(
      '/api/v1/ledger/events?from=0&limit=100',
    );
  });

  it('rechaza URL absolutas y rutas fuera de la API', () => {
    expect(() => buildApiUrl('https://example.org/api/v1/keys')).toThrow();
    expect(() => buildApiUrl('/otra/ruta')).toThrow();
    expect(() => buildApiUrl('/api/v1/../keys')).toThrow();
  });
});

describe('createApiClient', () => {
  it('valida la respuesta con el esquema y envía sin credenciales ni referer', async () => {
    const calls: { input: string; init: RequestInit }[] = [];
    const client = createApiClient(fakeFetch(Response.json(pinned), calls));
    const keys = await client.json(ROUTES.keys, PublicKeySetSchema);
    expect(keys).toEqual(pinned);
    expect(calls[0]?.init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
  });

  it('rechaza una respuesta que no cumple el contrato', async () => {
    const client = createApiClient(fakeFetch(Response.json({ server: 1 })));
    await expect(client.json(ROUTES.keys, PublicKeySetSchema)).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('traduce el error uniforme de la API', async () => {
    const body = { error: { code: 'rate_limited', message: 'x' } };
    const client = createApiClient(fakeFetch(Response.json(body, { status: 429 })));
    const failure = client.json(ROUTES.keys, PublicKeySetSchema);
    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({ code: 'rate_limited', status: 429 });
  });

  it('usa el código de estado si el cuerpo del error no es JSON', async () => {
    const client = createApiClient(fakeFetch(new Response('no', { status: 404 })));
    await expect(client.text(ROUTES.openDataCsv)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('reporta un fallo de red sin detalles', async () => {
    const client = createApiClient(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(client.text(ROUTES.openDataCsv)).rejects.toMatchObject({ code: 'network' });
  });
});

describe('createSigiloApi', () => {
  it('envía el token bearer y el JSON de estatus a la ruta de ROUTES', async () => {
    const calls: { input: string; init: RequestInit }[] = [];
    const summary = {
      folio: 'AAAA-BBBB-CCCC',
      mode: 'anonymous',
      status: 'routing',
      receivedOn: '2026-10-20',
      stateCode: '22',
      offenseCode: 'LGRA-52',
      protectionRequested: false,
    };
    const sigilo = createSigiloApi(createApiClient(fakeFetch(Response.json(summary), calls)));
    await sigilo.updateStatus('token-de-prueba', 'AAAA-BBBB-CCCC', 'routing');
    const call = calls[0];
    expect(call?.input).toBe(ROUTES.authorityStatus('AAAA-BBBB-CCCC'));
    expect(new Headers(call?.init.headers).get('Authorization')).toBe('Bearer token-de-prueba');
    expect(call?.init.body).toBe('{"status":"routing"}');
  });

  it('pagina el listado, pide la bitácora desde un día y envía la respuesta con su prueba', async () => {
    const calls: { input: string; init: RequestInit }[] = [];
    const listing = createSigiloApi(createApiClient(fakeFetch(Response.json([]), calls)));
    await listing.listComplaints('token-de-prueba', 100, 50);
    expect(calls[0]?.input).toBe(`${ROUTES.authorityComplaints}?offset=100&limit=50`);
    await expect(listing.getLedgerSince('2026-10-20', 200)).rejects.toMatchObject({
      code: 'invalid_response',
    });
    expect(calls[1]?.input).toBe(`${ROUTES.ledgerEvents}?since=2026-10-20&limit=200`);
    const failing = createSigiloApi(
      createApiClient(fakeFetch(new Response('sin cuerpo', { status: 400 }), calls)),
    );
    const request: ReporterMessageRequest = {
      folio: 'AAAA-BBBB-CCCC',
      authKey: 'a'.repeat(43),
      sequence: 0,
      envelope: { v: 1, suite: HPKE_SUITE_V1, keyId: '0'.repeat(16), enc: 'a', ct: 'b' },
      signature: 's',
    };
    await expect(failing.sendReporterMessage(request, 'reto.m:9')).rejects.toMatchObject({
      code: 'bad_request',
    });
    expect(new Headers(calls[2]?.init.headers).get(POW_HEADER)).toBe('reto.m:9');
  });

  it('sube pruebas como binario con su tipo de contenido', async () => {
    const calls: { input: string; init: RequestInit }[] = [];
    const descriptor = {
      evidenceId: 'a'.repeat(32),
      mediaType: 'image/jpeg',
      sha256: 'b'.repeat(64),
      sizeBytes: 3,
    };
    const sigilo = createSigiloApi(createApiClient(fakeFetch(Response.json(descriptor), calls)));
    await sigilo.uploadEvidence(new Blob([new Uint8Array([1, 2, 3])]), 'image/jpeg', 'reto.x:7');
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('Content-Type')).toBe('image/jpeg');
    expect(headers.get(POW_HEADER)).toBe('reto.x:7');
    expect(calls[0]?.init.method).toBe('POST');
  });

  it('pide el reto de prueba de trabajo y traduce sus errores', async () => {
    const calls: { input: string; init: RequestInit }[] = [];
    const challenge = { token: 'abc.def', bits: 8 };
    const sigilo = createSigiloApi(createApiClient(fakeFetch(Response.json(challenge), calls)));
    expect(await sigilo.getPowChallenge('complaint')).toEqual(challenge);
    expect(calls[0]?.input).toBe(`${ROUTES.powChallenge}?purpose=complaint`);
    for (const [status, code] of [
      [428, 'proof_required'],
      [503, 'ledger_day_full'],
      [507, 'storage_full'],
    ] as const) {
      const failing = createSigiloApi(
        createApiClient(fakeFetch(new Response('sin cuerpo', { status }), [])),
      );
      await expect(failing.getKeys()).rejects.toMatchObject({ code });
    }
  });
});
