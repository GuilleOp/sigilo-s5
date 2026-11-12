// Pruebas del acceso de la autoridad con cuentas individuales: inicio de sesión, respuesta uniforme,
// límite de intentos por usuario, registro de fallos sin IP, cierre y vencimiento de la sesión.
import { describe, expect, it } from 'vitest';
import { AuthoritySessionInfoSchema, AuthoritySessionSchema, ROUTES } from '@sigilo/contracts';
import { createSessionStore } from '../security/sessions.ts';
import {
  createTestServer,
  getAsAuthority,
  postJson,
  TEST_ACCOUNTS,
  TEST_START,
  testPassword,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

function login(server: TestServer, username: string, password: string) {
  return postJson(server.app, ROUTES.authLogin, { username, password });
}

describe('inicio de sesión', () => {
  it('abre una sesión con la cuenta propia y su token sirve para el panel', async () => {
    const server = createTestServer();
    const { username, accountId } = TEST_ACCOUNTS.oicInvestigator;
    const response = await login(server, username, testPassword('oicInvestigator'));
    expect(response.status).toBe(200);
    const session = AuthoritySessionSchema.parse(await response.json());
    expect(session.account).toEqual({
      accountId,
      authorityId: TEST_ACCOUNTS.oicInvestigator.authorityId,
      functions: ['investigation'],
    });
    expect(session.idleTimeoutSeconds).toBeLessThanOrEqual(30 * 60);
    const info = await getAsAuthority(server.app, ROUTES.authSession, session.token);
    expect(AuthoritySessionInfoSchema.parse(await info.json()).authority.name).toBe(
      'Órgano interno de control de prueba',
    );
    const list = await getAsAuthority(server.app, ROUTES.authorityComplaints, session.token);
    expect(list.status).toBe(200);
    // La respuesta nunca incluye el usuario ni el digesto de la contraseña.
    expect(JSON.stringify(session)).not.toContain(username);
    const events = server.ctx.securityLog.listByAccount(accountId);
    expect(events.map((event) => event.kind)).toEqual(['login_succeeded']);
  });

  it('responde igual a un usuario inexistente y a una contraseña equivocada, y lo registra sin IP', async () => {
    const server = createTestServer();
    const wrong = await login(server, TEST_ACCOUNTS.inboxIntake.username, 'contraseña-equivocada');
    const unknown = await login(server, 'no.existe', 'contraseña-equivocada');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.text()).toBe(await unknown.text());
    const events = server.ctx.securityLog.listAll();
    expect(events.map((event) => [event.kind, event.accountId])).toEqual(
      expect.arrayContaining([
        ['login_failed', TEST_ACCOUNTS.inboxIntake.accountId],
        ['login_failed', null],
      ]),
    );
    // El registro guarda el minuto, el tipo y el seudónimo: nada del usuario tecleado ni de la red.
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(['accountId', 'at', 'folioDigest', 'kind']);
      expect(event.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/u);
    }
    expect(JSON.stringify(events)).not.toContain('no.existe');
  });

  it('limita los fallos por usuario sin afectar a los demás', async () => {
    const server = createTestServer();
    const { username } = TEST_ACCOUNTS.inboxIntake;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect((await login(server, username, 'contraseña-equivocada')).status).toBe(401);
    }
    // Ya limitado, otro fallo responde 429 (con el mismo costo) y no se cuenta como acierto.
    const limited = await login(server, username, 'contraseña-equivocada');
    expect(limited.status).toBe(429);
    // H05: durante la ventana también la contraseña correcta recibe 429, con la misma respuesta:
    // el tope frena la adivinanza y no revela si se acertó.
    const correct = await login(server, username, testPassword('inboxIntake'));
    expect(correct.status).toBe(429);
    expect(await correct.text()).toBe(await limited.text());
    const other = TEST_ACCOUNTS.oicIntake;
    expect((await login(server, other.username, testPassword('oicIntake'))).status).toBe(200);
    // Al vencer la ventana, la contraseña correcta vuelve a abrir la sesión.
    server.setNow(new Date(TEST_START.getTime() + 16 * 60 * 1000));
    expect((await login(server, username, testPassword('inboxIntake'))).status).toBe(200);
    const kinds = server.ctx.securityLog
      .listByAccount(TEST_ACCOUNTS.inboxIntake.accountId)
      .map((event) => event.kind);
    expect(kinds.filter((kind) => kind === 'login_failed')).toHaveLength(10);
    expect(kinds).toContain('login_rate_limited');
  });

  it('rechaza cuerpos con campos de más o contraseñas cortas', async () => {
    const server = createTestServer();
    const extra = await postJson(server.app, ROUTES.authLogin, {
      username: TEST_ACCOUNTS.inboxIntake.username,
      password: testPassword('inboxIntake'),
      rol: 'admin',
    });
    expect(extra.status).toBe(400);
    expect((await login(server, TEST_ACCOUNTS.inboxIntake.username, 'corta')).status).toBe(400);
  });
});

describe('sesiones', () => {
  it('cerrar sesión la invalida en el servidor', async () => {
    const server = createTestServer();
    const response = await login(
      server,
      TEST_ACCOUNTS.supervisor.username,
      testPassword('supervisor'),
    );
    const { token } = AuthoritySessionSchema.parse(await response.json());
    const logout = await server.app.request(ROUTES.authLogout, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logout.status).toBe(204);
    expect((await getAsAuthority(server.app, ROUTES.authSession, token)).status).toBe(401);
    // Cerrar una sesión que no existe responde igual, sin confirmar nada.
    const again = await server.app.request(ROUTES.authLogout, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(again.status).toBe(204);
  });

  it('vence a los 15 minutos sin actividad y lo registra', async () => {
    let now = new Date('2026-10-20T15:42:17Z');
    const sessions = createSessionStore(() => now);
    const server = createTestServer({ sessions, now: () => now });
    const response = await login(
      server,
      TEST_ACCOUNTS.oicIntake.username,
      testPassword('oicIntake'),
    );
    const { token } = AuthoritySessionSchema.parse(await response.json());
    now = new Date('2026-10-20T15:56:00Z');
    expect((await getAsAuthority(server.app, ROUTES.authorityComplaints, token)).status).toBe(200);
    now = new Date('2026-10-20T16:12:00Z');
    expect((await getAsAuthority(server.app, ROUTES.authorityComplaints, token)).status).toBe(401);
    const kinds = server.ctx.securityLog
      .listByAccount(TEST_ACCOUNTS.oicIntake.accountId)
      .map((event) => event.kind);
    expect(kinds).toEqual(['login_succeeded', 'session_expired']);
  });
});
