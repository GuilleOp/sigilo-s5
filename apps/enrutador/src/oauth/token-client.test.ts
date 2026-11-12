// Pruebas del cliente OAuth 2.0 de la SESNA: petición con client_secret_basic en formulario, caché
// hasta poco antes de vencer, renovación con refresh_token en el flujo password y olvido del token
// rechazado. El servidor de autorización es uno falso que registra lo que recibe.
import { describe, expect, it } from 'vitest';
import { PDN_ROUTES, PDN_SCOPES } from '@sigilo/contracts';
import type { DirectoryNode } from '@sigilo/contracts';
import type { FetchLike } from '@sigilo/red';
import { createNodeTokenClient } from './token-client.ts';
import type { NodeCredential } from './node-credentials.ts';

const NODE = { id: 'node.queretaro', baseUrl: 'http://nodo.invalid' } as DirectoryNode;
const OTHER = { id: 'node.federal', baseUrl: 'http://otro.invalid' } as DirectoryNode;

function fakeServer(options: { refresh?: boolean; status?: number } = {}) {
  const requests: { authorization: string | null; type: string | null; body: URLSearchParams }[] =
    [];
  let counter = 0;
  const fetch: FetchLike = async (input, init) => {
    const request = new Request(input, init);
    expect(new URL(request.url).pathname).toBe(PDN_ROUTES.token);
    requests.push({
      authorization: request.headers.get('Authorization'),
      type: request.headers.get('Content-Type'),
      body: new URLSearchParams(await request.text()),
    });
    counter += 1;
    if (options.status !== undefined) return new Response('{}', { status: options.status });
    return Response.json({
      access_token: `token-${counter}`,
      token_type: 'Bearer',
      expires_in: 300,
      scope: PDN_SCOPES.deliveries,
      ...(options.refresh === true ? { refresh_token: `renovacion-${counter}` } : {}),
    });
  };
  return { fetch, requests };
}

const CREDENTIAL: NodeCredential = {
  clientId: 'sesna',
  clientSecret: 'secreto-sintetico-de-la-sesna',
  grantType: 'client_credentials',
};

describe('cliente OAuth 2.0 de la SESNA', () => {
  it('pide el token con client_secret_basic y lo guarda hasta 30 s antes de vencer', async () => {
    let now = 0;
    const server = fakeServer();
    const client = createNodeTokenClient({
      credentials: new Map([[NODE.id, CREDENTIAL]]),
      nodeUrl: (node) => node.baseUrl,
      fetch: server.fetch,
      clock: () => now,
    });
    expect(await client.token(NODE, PDN_SCOPES.deliveries)).toBe('token-1');
    expect(server.requests[0]?.authorization).toBe(
      `Basic ${Buffer.from('sesna:secreto-sintetico-de-la-sesna').toString('base64')}`,
    );
    expect(server.requests[0]?.type).toBe('application/x-www-form-urlencoded');
    expect(Object.fromEntries(server.requests[0]?.body ?? [])).toEqual({
      grant_type: 'client_credentials',
      scope: PDN_SCOPES.deliveries,
    });
    now = 269_000;
    expect(await client.token(NODE, PDN_SCOPES.deliveries)).toBe('token-1');
    now = 270_000;
    expect(await client.token(NODE, PDN_SCOPES.deliveries)).toBe('token-2');
    expect(server.requests).toHaveLength(2);
  });

  it('con password manda usuario y contraseña y renueva con refresh_token', async () => {
    const server = fakeServer({ refresh: true });
    const client = createNodeTokenClient({
      credentials: new Map([
        [
          NODE.id,
          {
            ...CREDENTIAL,
            grantType: 'password' as const,
            username: 'sesna.pdn',
            password: 'contraseña-sintética-larga',
          },
        ],
      ]),
      nodeUrl: (node) => node.baseUrl,
      fetch: server.fetch,
    });
    expect(await client.token(NODE, PDN_SCOPES.statistics)).toBe('token-1');
    expect(server.requests[0]?.body.get('grant_type')).toBe('password');
    expect(server.requests[0]?.body.get('username')).toBe('sesna.pdn');
    client.invalidate(NODE, PDN_SCOPES.statistics);
    expect(await client.token(NODE, PDN_SCOPES.statistics)).toBe('token-2');
    expect(Object.fromEntries(server.requests[1]?.body ?? [])).toEqual({
      grant_type: 'refresh_token',
      refresh_token: 'renovacion-1',
      scope: PDN_SCOPES.statistics,
    });
  });

  it('sin credenciales o si el nodo lo rechaza devuelve null', async () => {
    const server = fakeServer({ status: 401 });
    const client = createNodeTokenClient({
      credentials: new Map([[NODE.id, CREDENTIAL]]),
      nodeUrl: (node) => node.baseUrl,
      fetch: server.fetch,
    });
    expect(client.hasCredentials(OTHER)).toBe(false);
    expect(await client.token(OTHER, PDN_SCOPES.deliveries)).toBeNull();
    expect(await client.token(NODE, PDN_SCOPES.deliveries)).toBeNull();
  });
});
