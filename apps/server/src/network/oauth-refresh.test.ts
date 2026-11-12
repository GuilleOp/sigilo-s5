// Pruebas del token de renovación con la regla de ValidAPI (la herramienta con la que la SESNA
// prueba a los proveedores): vive entre 5 y 10 minutos más que el de acceso, es de un solo uso y,
// vencido, falla aunque nunca se haya usado.
import { describe, expect, it } from 'vitest';
import {
  PDN_ACCESS_TOKEN_TTL_SECONDS,
  PDN_REFRESH_TOKEN_TTL_SECONDS,
  PDN_SCOPES,
} from '@sigilo/contracts';
import { hashPassword } from '../security/passwords.ts';
import { clientSecretDigest, createNodeOAuthServer } from './oauth-server.ts';

const SECRET = 'secreto-sintetico-de-la-sesna-para-renovacion';
const PASSWORD = 'contraseña-sintética-de-renovacion';

function setup() {
  let now = Date.parse('2026-11-11T12:00:00Z');
  const server = createNodeOAuthServer({
    issuer: 'node.queretaro',
    clients: [
      {
        clientId: 'sesna',
        clientSecretDigest: clientSecretDigest(SECRET),
        scopes: [PDN_SCOPES.statistics],
        grantTypes: ['password', 'refresh_token'],
        user: { username: 'sesna.pdn', passwordHash: hashPassword(PASSWORD, 10) },
      },
    ],
    clock: () => now,
  });
  const issue = async () => {
    const outcome = await server.token({
      authorization: undefined,
      params: {
        grant_type: 'password',
        client_id: 'sesna',
        client_secret: SECRET,
        username: 'sesna.pdn',
        password: PASSWORD,
      },
    });
    if (outcome.status !== 200) throw new Error('Sin token.');
    return outcome.body;
  };
  const refresh = (token: string) =>
    server.token({
      authorization: undefined,
      params: {
        grant_type: 'refresh_token',
        client_id: 'sesna',
        client_secret: SECRET,
        refresh_token: token,
      },
    });
  return { issue, refresh, advance: (seconds: number) => (now += seconds * 1000) };
}

describe('token de renovación', () => {
  it('vive entre 5 y 10 minutos más que el token de acceso de 5 minutos', () => {
    expect(PDN_ACCESS_TOKEN_TTL_SECONDS).toBe(300);
    const extra = PDN_REFRESH_TOKEN_TTL_SECONDS - PDN_ACCESS_TOKEN_TTL_SECONDS;
    expect(extra).toBeGreaterThanOrEqual(5 * 60);
    expect(extra).toBeLessThanOrEqual(10 * 60);
  });

  it('es de un solo uso: el segundo uso falla con invalid_grant', async () => {
    const { issue, refresh } = setup();
    const issued = await issue();
    expect(issued.refresh_token_expires_in).toBe(PDN_REFRESH_TOKEN_TTL_SECONDS);
    const token = issued.refresh_token ?? '';
    expect((await refresh(token)).status).toBe(200);
    const reused = await refresh(token);
    expect(reused.status).toBe(400);
    expect(reused.body).toMatchObject({ error: 'invalid_grant' });
  });

  it('vencido falla aunque nunca se haya usado, y sirve justo antes de vencer', async () => {
    const early = setup();
    const fresh = await early.issue();
    early.advance(PDN_REFRESH_TOKEN_TTL_SECONDS - 1);
    expect((await early.refresh(fresh.refresh_token ?? '')).status).toBe(200);

    const late = setup();
    const stale = await late.issue();
    late.advance(PDN_REFRESH_TOKEN_TTL_SECONDS);
    const outcome = await late.refresh(stale.refresh_token ?? '');
    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: 'invalid_grant' });
  });
});
