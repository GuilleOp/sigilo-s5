// Pruebas del cliente HTTP: rutas permitidas, validación de respuestas y errores.
import { describe, expect, it } from 'vitest';
import { PublicKeySetSchema, ROUTES } from '@sigilo/contracts';
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

  it('sube pruebas como binario con su tipo de contenido', async () => {
    const calls: { input: string; init: RequestInit }[] = [];
    const descriptor = {
      evidenceId: 'a'.repeat(32),
      mediaType: 'image/jpeg',
      sha256: 'b'.repeat(64),
      sizeBytes: 3,
    };
    const sigilo = createSigiloApi(createApiClient(fakeFetch(Response.json(descriptor), calls)));
    await sigilo.uploadEvidence(new Blob([new Uint8Array([1, 2, 3])]), 'image/jpeg');
    expect(new Headers(calls[0]?.init.headers).get('Content-Type')).toBe('image/jpeg');
    expect(calls[0]?.init.method).toBe('POST');
  });
});
