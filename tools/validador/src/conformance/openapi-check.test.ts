// Pruebas de API-01 con una especificación OpenAPI 3.1 mínima escrita en un directorio temporal.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { HttpExchange } from '../types.ts';
import { checkOpenApiConformance, matchPathTemplate } from './openapi-check.ts';

const SPEC = `openapi: 3.1.0
info: { title: Prueba, version: '1' }
servers:
  - url: /api/v1
paths:
  /keys:
    get:
      responses:
        '200':
          description: Llaves
          content:
            application/json:
              schema:
                type: object
                required: [server]
                properties:
                  server: { $ref: '#/components/schemas/Key' }
  /authority/complaints/{folio}:
    get:
      responses:
        '401': { $ref: '#/components/responses/Error' }
  /authority/complaints/export:
    get:
      responses:
        '200': { description: CSV, content: { text/csv: {} } }
components:
  schemas:
    Key:
      type: object
      required: [keyId]
      properties: { keyId: { type: string, minLength: 4 } }
    ApiError:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties: { code: { type: string }, message: { type: string } }
  responses:
    Error:
      description: Error
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ApiError' }
`;

const directory = mkdtempSync(join(tmpdir(), 'sigilo-openapi-'));
const specPath = join(directory, 'openapi.yaml');
writeFileSync(specPath, SPEC);

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function exchange(overrides: Partial<HttpExchange>): HttpExchange {
  return {
    purpose: 'prueba',
    method: 'GET',
    url: `http://127.0.0.1${overrides.path ?? '/'}`,
    path: '/',
    status: 200,
    headers: {},
    contentType: 'application/json',
    bodyText: '{}',
    durationMs: 1,
    ...overrides,
  };
}

describe('matchPathTemplate', () => {
  it('quita el prefijo de servers y prefiere rutas literales', () => {
    const spec = {
      servers: [{ url: '/api/v1' }],
      paths: { '/authority/complaints/{folio}': {}, '/authority/complaints/export': {} },
    };
    expect(matchPathTemplate(spec, '/api/v1/authority/complaints/export')).toBe(
      '/authority/complaints/export',
    );
    expect(matchPathTemplate(spec, '/api/v1/authority/complaints/AAAA-BBBB-CCCC')).toBe(
      '/authority/complaints/{folio}',
    );
    expect(matchPathTemplate(spec, '/otra')).toBeNull();
  });
});

describe('API-01', () => {
  it('cumple cuando ruta, estatus, tipo y esquema coinciden', () => {
    const check = checkOpenApiConformance(specPath, [
      exchange({ path: '/api/v1/keys', bodyText: '{"server":{"keyId":"abcd"}}' }),
      exchange({
        path: '/api/v1/authority/complaints/AAAA-BBBB-CCCC',
        status: 401,
        bodyText: '{"error":{"code":"unauthorized","message":"No autorizado."}}',
      }),
      exchange({ path: '/api/v1/no-existe', status: 404, bodyText: '{}' }),
      exchange({
        path: '/api/v1/authority/complaints/export',
        contentType: 'text/csv',
        bodyText: 'a,b',
      }),
    ]);
    expect(check.status, JSON.stringify(check.evidence)).toBe('cumple');
  });

  it('no cumple con esquema inválido, estatus no documentado o ruta no declarada', () => {
    const check = checkOpenApiConformance(specPath, [
      exchange({ path: '/api/v1/keys', bodyText: '{"server":{"keyId":"x"}}' }),
      exchange({ path: '/api/v1/keys', status: 500, bodyText: '{}' }),
      exchange({ path: '/api/v1/secreta', status: 200 }),
      exchange({ path: '/api/v1/keys', method: 'POST' }),
    ]);
    expect(check.status).toBe('no_cumple');
    const descriptions = check.evidence.map((item) => item.description).join(' ');
    expect(descriptions).toContain('no cumple el esquema');
    expect(descriptions).toContain('estatus 500 no documentado');
    expect(descriptions).toContain('ruta no declarada');
    expect(descriptions).toContain('método POST no declarado');
  });

  it('advierte si la especificación no existe', () => {
    const check = checkOpenApiConformance(join(directory, 'falta.yaml'), []);
    expect(check.status).toBe('advertencia');
    expect(check.summary).toContain('No se encontró');
  });
});
