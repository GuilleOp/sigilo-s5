// Conformidad del servidor de referencia con el Estándar S5: registra exactamente las operaciones
// de `STANDARD_OPERATIONS` y responde los errores con el estatus y el mensaje del contrato.
import { describe, expect, it } from 'vitest';
import {
  API_ERROR_HTTP_STATUS,
  API_ERROR_MESSAGES,
  API_PREFIX,
  ApiErrorSchema,
  CORROBORATION_ROUTES,
  NETWORK_ROUTES,
  ROUTES,
} from '@sigilo/contracts';
import { NETWORK_OPERATIONS, STANDARD_OPERATIONS } from '@sigilo/contracts/standard';
import { createTestServer } from './test-support/harness.ts';

/** `/api/v1/authority/complaints/{folio}` → `/api/v1/authority/complaints/:folio`. */
function toHonoPath(path: string): string {
  return path.replace(/\{([A-Za-z]+)\}/gu, ':$1');
}

describe('conformidad con el estándar', () => {
  it('registra exactamente las rutas y métodos del estándar', () => {
    const { app } = createTestServer();
    const registered = new Set(
      app.routes
        .filter((route) => route.method === 'GET' || route.method === 'POST')
        .filter((route) => route.path.startsWith(`${API_PREFIX}/`))
        .map((route) => `${route.method} ${route.path}`),
    );
    // El nodo sirve también las operaciones de red que le tocan (su buzón); las del enrutador no.
    const nodeOperations = [
      ...STANDARD_OPERATIONS,
      ...NETWORK_OPERATIONS.filter((operation) => operation.servedBy === 'node'),
    ];
    // Copias del mismo origen para la web (directorio, enrutador, corte nacional y evaluador): son operaciones del
    // estándar que sirven otros servicios; el nodo solo las pasa, sin cambiarlas.
    const sameOriginPassThroughs = [
      `GET ${NETWORK_ROUTES.directory}`,
      `POST ${NETWORK_ROUTES.relay}`,
      `GET ${NETWORK_ROUTES.queueChallenge}`,
      `GET ${NETWORK_ROUTES.nationalOpenData}`,
      `GET ${CORROBORATION_ROUTES.evaluatorChallenge}`,
      `POST ${CORROBORATION_ROUTES.evaluations}`,
    ];
    const documented = new Set([
      ...nodeOperations.map(
        (operation) => `${operation.method.toUpperCase()} ${toHonoPath(operation.path)}`,
      ),
      ...sameOriginPassThroughs,
    ]);
    expect([...registered].sort()).toEqual([...documented].sort());
  });

  it('responde los errores con el esquema, el estatus y el mensaje del contrato', async () => {
    const { app } = createTestServer();
    const unauthorized = await app.request(ROUTES.authorityComplaints);
    expect(unauthorized.status).toBe(API_ERROR_HTTP_STATUS.unauthorized);
    expect(ApiErrorSchema.parse(await unauthorized.json()).error.message).toBe(
      API_ERROR_MESSAGES.unauthorized,
    );
    // El seguimiento no lleva prueba de trabajo: el cuerpo vacío llega directo a la validación.
    const invalid = await app.request(ROUTES.tracking, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(invalid.status).toBe(API_ERROR_HTTP_STATUS.bad_request);
    expect(ApiErrorSchema.parse(await invalid.json()).error).toEqual({
      code: 'bad_request',
      message: API_ERROR_MESSAGES.bad_request,
    });
  });

  it('rechaza las peticiones con campos que no están en su esquema', async () => {
    const { app } = createTestServer();
    // Credenciales con forma válida más un campo inventado: el estándar declara
    // additionalProperties: false, así que la respuesta es 400 y no 404 por folio inexistente.
    const response = await app.request(ROUTES.tracking, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folio: 'K7Q2-M9XP-4RTD', authKey: 'AAAA', inventado: 1 }),
    });
    expect(response.status).toBe(API_ERROR_HTTP_STATUS.bad_request);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe('bad_request');
  });
});
