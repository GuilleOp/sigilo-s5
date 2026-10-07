// Pruebas transversales: cabeceras de seguridad, CORS, rutas desconocidas y registro sin datos.
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@sigilo/contracts';
import { PublicKeySetSchema } from '@sigilo/contracts';
import { errorBody } from './http/errors.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  postJson,
  submitComplaint,
} from './test-support/harness.ts';

describe('aplicación', () => {
  it('publica el conjunto de llaves públicas', async () => {
    const server = createTestServer();
    const keys = PublicKeySetSchema.strict().parse(
      await (await server.app.request(ROUTES.keys)).json(),
    );
    expect(keys).toEqual(server.keys.publicKeySet);
  });

  it('aplica cabeceras de seguridad a respuestas correctas y a errores', async () => {
    const server = createTestServer();
    for (const response of [
      await server.app.request(ROUTES.keys),
      await server.app.request('/api/v1/no-existe'),
      await server.app.request(ROUTES.authorityComplaints),
    ]) {
      expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  it('responde 404 uniforme a rutas desconocidas', async () => {
    const server = createTestServer();
    const response = await server.app.request('/api/v1/no-existe');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(errorBody('not_found'));
  });

  it('permite CORS solo al origen configurado', async () => {
    const server = createTestServer({ allowedOrigin: 'http://localhost:5173' });
    const allowed = await server.app.request(ROUTES.keys, {
      headers: { Origin: 'http://localhost:5173' },
    });
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173');
    const other = await server.app.request(ROUTES.keys, {
      headers: { Origin: 'http://evil.example' },
    });
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('registra solo método, ruta normalizada, estatus y duración', async () => {
    const server = createTestServer();
    const reporter = createReporter();
    const request = await buildComplaintRequest(server, { mode: 'anonymous', reporter });
    const { folio } = await submitComplaint(server, request);
    await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
    await getAsAuthority(server.app, ROUTES.authorityComplaint(folio));
    for (const entry of server.logs) {
      expect(Object.keys(entry).sort()).toEqual(['durationMs', 'method', 'route', 'status']);
    }
    expect(server.logs.map((entry) => entry.route)).toContain(
      '/api/v1/authority/complaints/:folio',
    );
    expect(JSON.stringify(server.logs)).not.toContain(folio);
  });
});
