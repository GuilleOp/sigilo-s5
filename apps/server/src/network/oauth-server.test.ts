// Pruebas del servidor de autorización OAuth 2.0 del nodo: emisión con client_credentials, password
// y refresh_token, y validación del token (vencido, otro emisor, permiso faltante, firma inválida),
// clientes desconocidos y secretos incorrectos comparados en tiempo constante, y bloqueo por fallos
// solo del flujo password (los secretos de cliente equivocados nunca bloquean, H01).
import * as crypto from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDN_REFRESH_TOKEN_TTL_SECONDS, PDN_SCOPES } from '@sigilo/contracts';
import { hashPassword } from '../security/passwords.ts';
import {
  OAUTH_CLIENTS_FILE_NAME,
  clientSecretDigest,
  createNodeOAuthServer,
  loadOAuthClients,
} from './oauth-server.ts';
import type { OAuthClient, TokenOutcome } from './oauth-server.ts';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof crypto>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const SECRET = 'secreto-sintetico-de-la-sesna-para-pruebas';
const PASSWORD = 'contraseña-sintética-de-la-sesna';

const CLIENT: OAuthClient = {
  clientId: 'sesna',
  clientSecretDigest: clientSecretDigest(SECRET),
  scopes: [PDN_SCOPES.deliveries, PDN_SCOPES.statistics],
  grantTypes: ['client_credentials', 'password', 'refresh_token'],
  user: { username: 'sesna.pdn', passwordHash: hashPassword(PASSWORD, 10) },
};

function basic(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

function setup(options: { issuer?: string; key?: Uint8Array } = {}) {
  let now = Date.parse('2026-11-11T12:00:00Z');
  const server = createNodeOAuthServer({
    issuer: options.issuer ?? 'node.queretaro',
    clients: [CLIENT],
    clock: () => now,
    ...(options.key === undefined ? {} : { signingKey: options.key }),
  });
  return { server, advance: (ms: number) => (now += ms) };
}

function accessToken(outcome: TokenOutcome): string {
  if (outcome.status !== 200) throw new Error(`Sin token: ${outcome.body.error}`);
  return outcome.body.access_token;
}

describe('emisión de tokens', () => {
  it('client_credentials con client_secret_basic: token Bearer de 5 minutos sin renovación', async () => {
    const { server } = setup();
    const outcome = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'client_credentials', scope: PDN_SCOPES.deliveries },
    });
    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) return;
    expect(outcome.body).toMatchObject({
      token_type: 'Bearer',
      expires_in: 300,
      scope: PDN_SCOPES.deliveries,
    });
    expect(outcome.body.refresh_token).toBeUndefined();
    const [header, payload] = outcome.body.access_token.split('.');
    expect(JSON.parse(Buffer.from(header ?? '', 'base64url').toString())).toEqual({
      alg: 'HS256',
      typ: 'at+jwt',
    });
    expect(JSON.parse(Buffer.from(payload ?? '', 'base64url').toString())).toMatchObject({
      iss: 'node.queretaro',
      aud: 'node.queretaro',
      sub: 'sesna',
      scope: PDN_SCOPES.deliveries,
    });
  });

  it('password (flujo de la PDN) con client_secret_post y token de renovación de un solo uso', async () => {
    const { server } = setup();
    const outcome = await server.token({
      authorization: undefined,
      params: {
        grant_type: 'password',
        client_id: 'sesna',
        client_secret: SECRET,
        username: 'sesna.pdn',
        password: PASSWORD,
        scope: PDN_SCOPES.statistics,
      },
    });
    expect(outcome.status).toBe(200);
    if (outcome.status !== 200) return;
    expect(outcome.body.refresh_token_expires_in).toBe(PDN_REFRESH_TOKEN_TTL_SECONDS);
    const refresh = outcome.body.refresh_token ?? '';
    const renewed = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'refresh_token', refresh_token: refresh },
    });
    expect(renewed.status).toBe(200);
    expect(server.verify(`Bearer ${accessToken(renewed)}`, PDN_SCOPES.statistics).ok).toBe(true);
    // El mismo token de renovación ya no vale.
    const replay = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'refresh_token', refresh_token: refresh },
    });
    expect(replay).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
  });

  it('sin scope concede todos los del cliente; uno ajeno es invalid_scope', async () => {
    const { server } = setup();
    const all = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'client_credentials' },
    });
    expect(all.status === 200 && all.body.scope).toBe('sesna:entregas sesna:estadisticas');
    const foreign = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'client_credentials', scope: PDN_SCOPES.health },
    });
    expect(foreign).toMatchObject({ status: 400, body: { error: 'invalid_scope' } });
  });

  it('rechaza contraseña o usuario incorrectos, flujos no soportados y dos métodos a la vez', async () => {
    const { server } = setup();
    const auth = basic('sesna', SECRET);
    const wrongPassword = await server.token({
      authorization: auth,
      params: { grant_type: 'password', username: 'sesna.pdn', password: 'otra' },
    });
    expect(wrongPassword).toMatchObject({ status: 400, body: { error: 'invalid_grant' } });
    const wrongUser = await server.token({
      authorization: auth,
      params: { grant_type: 'password', username: 'otra.persona', password: PASSWORD },
    });
    expect(wrongUser).toEqual(wrongPassword);
    expect(
      await server.token({ authorization: auth, params: { grant_type: 'authorization_code' } }),
    ).toMatchObject({ status: 400, body: { error: 'unsupported_grant_type' } });
    expect(
      await server.token({
        authorization: auth,
        params: { grant_type: 'client_credentials', client_id: 'sesna' },
      }),
    ).toMatchObject({ status: 400, body: { error: 'invalid_request' } });
  });
});

describe('autenticación del cliente', () => {
  beforeEach(() => {
    vi.mocked(crypto.timingSafeEqual).mockClear();
  });

  it('cliente desconocido y secreto incorrecto responden igual y comparan en tiempo constante', async () => {
    const { server } = setup();
    const unknown = await server.token({
      authorization: basic('desconocido', SECRET),
      params: { grant_type: 'client_credentials' },
    });
    const unknownCalls = vi.mocked(crypto.timingSafeEqual).mock.calls.length;
    vi.mocked(crypto.timingSafeEqual).mockClear();
    const wrong = await server.token({
      authorization: basic('sesna', 'secreto-equivocado'),
      params: { grant_type: 'client_credentials' },
    });
    const wrongCalls = vi.mocked(crypto.timingSafeEqual).mock.calls.length;
    expect(unknown).toEqual({
      status: 401,
      body: { error: 'invalid_client', error_description: 'No se pudo autenticar al cliente.' },
      basicChallenge: true,
    });
    expect(wrong).toEqual(unknown);
    // Ambos caminos hacen exactamente una comparación de digestos de 32 bytes.
    expect(unknownCalls).toBe(1);
    expect(wrongCalls).toBe(1);
    for (const [left, right] of vi.mocked(crypto.timingSafeEqual).mock.calls) {
      expect((left as Buffer).length).toBe(32);
      expect((right as Buffer).length).toBe(32);
    }
  });

  it('H01: los secretos equivocados nunca bloquean al cliente legítimo', async () => {
    const { server } = setup();
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const wrong = await server.token({
        authorization: basic('sesna', `equivocado-${attempt}`),
        params: { grant_type: 'client_credentials' },
      });
      expect(wrong.status).toBe(401);
    }
    const legit = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'client_credentials' },
    });
    expect(legit.status).toBe(200);
    // Tampoco el flujo password: sin el secreto del cliente no se llega a contar nada.
    const password = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'password', username: 'sesna.pdn', password: PASSWORD },
    });
    expect(password.status).toBe(200);
  });

  it('H01: un refresh_token inventado no cuenta para el tope', async () => {
    const { server } = setup();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const outcome = await server.token({
        authorization: basic('sesna', SECRET),
        params: { grant_type: 'refresh_token', refresh_token: `inventado-${attempt}` },
      });
      expect(outcome.status).toBe(400);
    }
    const legit = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'password', username: 'sesna.pdn', password: PASSWORD },
    });
    expect(legit.status).toBe(200);
  });

  it('password: tras 10 fallos del cliente autenticado responde 429 sin correr scrypt', async () => {
    const { server, advance } = setup();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const wrong = await server.token({
        authorization: basic('sesna', SECRET),
        params: { grant_type: 'password', username: 'sesna.pdn', password: `mala-${attempt}` },
      });
      expect(wrong.status).toBe(400);
    }
    const blocked = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'password', username: 'sesna.pdn', password: PASSWORD },
    });
    expect(blocked.status).toBe(429);
    // client_credentials sigue funcionando con el flujo password bloqueado.
    const credentials = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'client_credentials' },
    });
    expect(credentials.status).toBe(200);
    advance(15 * 60 * 1000);
    const again = await server.token({
      authorization: basic('sesna', SECRET),
      params: { grant_type: 'password', username: 'sesna.pdn', password: PASSWORD },
    });
    expect(again.status).toBe(200);
  });

  it('sin credenciales o con una cabecera Basic mal formada: invalid_client', async () => {
    const { server } = setup();
    expect(
      await server.token({
        authorization: undefined,
        params: { grant_type: 'client_credentials' },
      }),
    ).toMatchObject({ status: 401, body: { error: 'invalid_client' } });
    expect(
      await server.token({
        authorization: 'Basic %%%',
        params: { grant_type: 'client_credentials' },
      }),
    ).toMatchObject({ status: 401, body: { error: 'invalid_client' } });
  });
});

describe('validación del token', () => {
  async function issue(server: ReturnType<typeof setup>['server'], scope: string) {
    return accessToken(
      await server.token({
        authorization: basic('sesna', SECRET),
        params: { grant_type: 'client_credentials', scope },
      }),
    );
  }

  it('acepta un token vigente con el permiso pedido', async () => {
    const { server } = setup();
    const token = await issue(server, PDN_SCOPES.deliveries);
    expect(server.verify(`Bearer ${token}`, PDN_SCOPES.deliveries)).toEqual({
      ok: true,
      clientId: 'sesna',
      scopes: [PDN_SCOPES.deliveries],
    });
  });

  it('rechaza un token vencido', async () => {
    const { server, advance } = setup();
    const token = await issue(server, PDN_SCOPES.deliveries);
    advance(300 * 1000);
    expect(server.verify(`Bearer ${token}`, PDN_SCOPES.deliveries)).toEqual({
      ok: false,
      error: 'invalid_token',
    });
  });

  it('rechaza un token de otro nodo (otro aud) aunque compartiera la llave', async () => {
    const key = new Uint8Array(32).fill(3);
    const queretaro = setup({ issuer: 'node.queretaro', key });
    const federal = setup({ issuer: 'node.federal', key });
    const token = await issue(federal.server, PDN_SCOPES.deliveries);
    expect(queretaro.server.verify(`Bearer ${token}`, PDN_SCOPES.deliveries).ok).toBe(false);
  });

  it('rechaza un permiso faltante con insufficient_scope', async () => {
    const { server } = setup();
    const token = await issue(server, PDN_SCOPES.statistics);
    expect(server.verify(`Bearer ${token}`, PDN_SCOPES.deliveries)).toEqual({
      ok: false,
      error: 'insufficient_scope',
    });
  });

  it('rechaza una firma inválida, un token alterado y cabeceras mal formadas', async () => {
    const { server } = setup();
    const token = await issue(server, PDN_SCOPES.deliveries);
    const [header, payload, signature = ''] = token.split('.');
    const flipped = `${signature.slice(0, -2)}${signature.endsWith('AA') ? 'BB' : 'AA'}`;
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const forged = Buffer.from(
      JSON.stringify({ ...claims, scope: 'sesna:entregas sesna:estadisticas' }),
    ).toString('base64url');
    for (const candidate of [
      `Bearer ${header}.${payload}.${flipped}`,
      `Bearer ${header}.${forged}.${signature}`,
      `Bearer ${token}x`,
      token,
      'Bearer ',
      undefined,
    ]) {
      expect(server.verify(candidate, PDN_SCOPES.deliveries).ok, String(candidate)).toBe(false);
    }
    // Otro proceso (otra llave aleatoria) no acepta el token.
    expect(setup().server.verify(`Bearer ${token}`, PDN_SCOPES.deliveries).ok).toBe(false);
  });
});

describe('oauth-clients.json', () => {
  function write(value: unknown): string {
    const path = join(mkdtempSync(join(tmpdir(), 'sigilo-oauth-')), OAUTH_CLIENTS_FILE_NAME);
    writeFileSync(path, JSON.stringify(value));
    return path;
  }

  it('sin archivo no hay clientes; con archivo valida digestos, flujos y usuarios', () => {
    expect(loadOAuthClients(join(tmpdir(), 'no-existe', OAUTH_CLIENTS_FILE_NAME))).toEqual([]);
    expect(loadOAuthClients(write({ version: 1, clients: [CLIENT] }))).toEqual([CLIENT]);
    expect(() =>
      loadOAuthClients(write({ version: 1, clients: [{ ...CLIENT, user: undefined }] })),
    ).toThrow('password');
    expect(() =>
      loadOAuthClients(write({ version: 1, clients: [{ ...CLIENT, clientSecret: SECRET }] })),
    ).toThrow('formato');
    expect(() => loadOAuthClients(write({ version: 1, clients: [CLIENT, CLIENT] }))).toThrow(
      'repetido',
    );
  });
});
