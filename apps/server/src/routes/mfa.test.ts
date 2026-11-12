// Pruebas del segundo factor del panel: inscripción en el primer inicio de sesión, inicio en dos
// pasos con TOTP o código de recuperación, un solo uso por paso, el límite compartido con la
// contraseña (H05), el reinicio y la política `requerido` en las rutas de la autoridad, de la
// supervisión y de la operación del nodo.
import { describe, expect, it } from 'vitest';
import {
  LoginCodeStepSchema,
  LoginEnrollStepSchema,
  LoginResponseSchema,
  LoginSessionStepSchema,
  MfaConfirmResponseSchema,
  MfaEnrollmentSchema,
  ROUTES,
} from '@sigilo/contracts';
import { randomBytes } from '@sigilo/core';
import { createAuthorityRegistry } from '../security/authority-registry.ts';
import type { MfaPolicy } from '../security/mfa-policy.ts';
import { hashPassword } from '../security/passwords.ts';
import { createSessionStore } from '../security/sessions.ts';
import { fromBase32, generateTotpSecret, hotp, totpCode, totpStep } from '../security/totp.ts';
import { provisionMfa, resetMfa } from '../services/mfa-provisioning.ts';
import {
  createTestServer,
  getAsAuthority,
  postJson,
  TEST_ACCOUNTS,
  TEST_START,
  testAuthorityRegistry,
  testPassword,
  testToken,
} from '../test-support/harness.ts';
import type { TestAccountName, TestServer } from '../test-support/harness.ts';

const KEY = randomBytes(32);

function mfaServer(policy: MfaPolicy, overrides: Parameters<typeof createTestServer>[0] = {}) {
  return createTestServer({ mfa: { policy, key: KEY, recoveryLogN: 10 }, ...overrides });
}

function nowMs(server: TestServer): number {
  return server.ctx.deps.now().getTime();
}

/** Inscribe la cuenta directamente en la base, como la demostración. */
function enroll(server: TestServer, name: TestAccountName) {
  const secret = generateTotpSecret();
  const { recoveryCodes } = provisionMfa({
    db: server.db,
    key: KEY,
    accountId: TEST_ACCOUNTS[name].accountId,
    secret,
    now: server.ctx.deps.now(),
    recoveryLogN: 10,
  });
  return { secret, recoveryCodes };
}

async function passwordStep(
  server: TestServer,
  name: TestAccountName,
  password = testPassword(name),
) {
  const response = await postJson(server.app, ROUTES.authLogin, {
    username: TEST_ACCOUNTS[name].username,
    password,
  });
  expect(response.status).toBe(200);
  return LoginResponseSchema.parse(await response.json());
}

async function codeStep(server: TestServer, challenge: string, code: string) {
  return postJson(server.app, ROUTES.authLoginCode, { challenge, code });
}

/** Ambos pasos con el código dado; devuelve la respuesta del segundo. */
async function loginWithCode(server: TestServer, name: TestAccountName, code: string) {
  const first = LoginCodeStepSchema.parse(await passwordStep(server, name));
  return codeStep(server, first.challenge, code);
}

/** Rutas de cada función que deben cerrarse sin segundo factor. */
const GUARDED: [TestAccountName, string][] = [
  ['inboxIntake', ROUTES.authorityComplaints],
  ['oicInvestigator', ROUTES.authorityComplaints],
  ['oicSubstantiation', ROUTES.authorityComplaints],
  ['supervisor', ROUTES.authorityEscalations],
  ['nodeOperation', ROUTES.operationRegistrations],
];

describe('política del segundo factor en las rutas', () => {
  it('con «requerido», una sesión de solo contraseña no entra a ninguna función', async () => {
    const server = mfaServer('requerido');
    for (const [name, route] of GUARDED) {
      const response = await getAsAuthority(server.app, route, testToken(name));
      expect(response.status, `${name} ${route}`).toBe(401);
      expect((await getAsAuthority(server.app, ROUTES.authSession, testToken(name))).status).toBe(
        401,
      );
    }
  });

  it('con «requerido», una sesión con segundo factor entra a la ruta de su función', async () => {
    const sessions = createSessionStore(() => TEST_START);
    const server = mfaServer('requerido', { sessions });
    for (const [name, route] of GUARDED) {
      enroll(server, name);
      const token = sessions.issue(TEST_ACCOUNTS[name].accountId, undefined, 'mfa');
      expect((await getAsAuthority(server.app, route, token)).status, `${name} ${route}`).toBe(200);
    }
  });

  it('con «opcional», la contraseña basta solo a una cuenta sin inscribir', async () => {
    const server = mfaServer('opcional');
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityComplaints, testToken('inboxIntake')))
        .status,
    ).toBe(200);
    enroll(server, 'inboxIntake');
    // Inscrita, su sesión de solo contraseña ya no sirve.
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityComplaints, testToken('inboxIntake')))
        .status,
    ).toBe(401);
    expect(
      (await getAsAuthority(server.app, ROUTES.operationRegistrations, testToken('nodeOperation')))
        .status,
    ).toBe(200);
  });

  it('con «opcional», la marca requireMfa de una cuenta la obliga a inscribirse', async () => {
    const base = testAuthorityRegistry();
    const account = TEST_ACCOUNTS.oicInvestigator;
    const registry = createAuthorityRegistry(
      {
        version: 1,
        inboxAuthorityId: base.inboxAuthorityId,
        authorities: base.listAuthorities().map((item) => ({
          authorityId: item.authorityId,
          name: item.name,
        })),
        accounts: [
          {
            ...account,
            functions: [...account.functions],
            passwordHash: hashPassword(testPassword('oicInvestigator'), 10),
            requireMfa: true,
          },
        ],
      },
      { minScryptLogN: 10 },
    );
    const server = mfaServer('opcional', { authorities: registry });
    const step = await passwordStep(server, 'oicInvestigator');
    expect(step.step).toBe('enroll');
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityComplaints, testToken('oicInvestigator')))
        .status,
    ).toBe(401);
  });
});

describe('inscripción en el primer inicio de sesión', () => {
  it('pide inscribir, no deja ver nada antes, y entrega 10 códigos de recuperación', async () => {
    const server = mfaServer('requerido');
    const step = LoginEnrollStepSchema.parse(await passwordStep(server, 'oicInvestigator'));
    const limited = step.token;
    // La sesión limitada no ve el panel ni la sesión.
    expect((await getAsAuthority(server.app, ROUTES.authorityComplaints, limited)).status).toBe(
      401,
    );
    expect((await getAsAuthority(server.app, ROUTES.authSession, limited)).status).toBe(401);

    const enrollment = MfaEnrollmentSchema.parse(
      await (await postJson(server.app, ROUTES.authMfaEnroll, {}, limited)).json(),
    );
    expect(enrollment.otpauthUri).toContain(`secret=${enrollment.secret}`);
    expect(enrollment.otpauthUri).toContain('investigacion.oic.uno');
    const secret = fromBase32(enrollment.secret);

    const wrong = await postJson(server.app, ROUTES.authMfaConfirm, { code: '000000' }, limited);
    expect(wrong.status).toBe(400);
    const code = totpCode(secret, nowMs(server));
    const confirmed = await postJson(server.app, ROUTES.authMfaConfirm, { code }, limited);
    expect(confirmed.status).toBe(200);
    const body = MfaConfirmResponseSchema.parse(await confirmed.json());
    expect(new Set(body.recoveryCodes).size).toBe(10);
    // Token nuevo con segundo factor; el limitado ya no vale.
    expect(body.session.token).not.toBe(limited);
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityComplaints, body.session.token)).status,
    ).toBe(200);
    expect((await getAsAuthority(server.app, ROUTES.authSession, limited)).status).toBe(401);
    // Ya inscrita: no se puede inscribir otra vez ni con el token nuevo.
    expect((await postJson(server.app, ROUTES.authMfaEnroll, {}, body.session.token)).status).toBe(
      401,
    );
    // El código de la confirmación no sirve para entrar.
    expect((await loginWithCode(server, 'oicInvestigator', code)).status).toBe(401);
    const kinds = server.ctx.securityLog
      .listByAccount(TEST_ACCOUNTS.oicInvestigator.accountId)
      .map((event) => event.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'mfa_enrollment_required',
        'mfa_failed',
        'mfa_enrolled',
        'login_succeeded',
      ]),
    );
    // El registro nunca lleva el secreto ni los códigos.
    const log = JSON.stringify(server.ctx.securityLog.listAll());
    expect(log).not.toContain(enrollment.secret);
    expect(log).not.toContain(body.recoveryCodes[0]);
  });

  it('sin secreto por confirmar responde 409', async () => {
    const server = mfaServer('requerido');
    const step = LoginEnrollStepSchema.parse(await passwordStep(server, 'oicIntake'));
    const response = await postJson(
      server.app,
      ROUTES.authMfaConfirm,
      { code: '123456' },
      step.token,
    );
    expect(response.status).toBe(409);
  });
});

describe('inicio de sesión con segundo factor', () => {
  it('con TOTP: la contraseña sola no abre sesión y el código sí', async () => {
    const server = mfaServer('requerido');
    const { secret } = enroll(server, 'supervisor');
    const first = await passwordStep(server, 'supervisor');
    expect(first.step).toBe('code');
    const response = await codeStep(
      server,
      LoginCodeStepSchema.parse(first).challenge,
      totpCode(secret, nowMs(server)),
    );
    expect(response.status).toBe(200);
    const session = LoginSessionStepSchema.parse(await response.json());
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityEscalations, session.token)).status,
    ).toBe(200);
  });

  it('la respuesta del primer paso no revela si la contraseña era correcta', async () => {
    const server = mfaServer('requerido');
    enroll(server, 'supervisor');
    const right = LoginCodeStepSchema.parse(await passwordStep(server, 'supervisor'));
    const wrong = LoginCodeStepSchema.parse(
      await passwordStep(server, 'supervisor', 'contraseña-equivocada'),
    );
    expect(Object.keys(right).sort()).toEqual(Object.keys(wrong).sort());
    expect(right.expiresInSeconds).toBe(wrong.expiresInSeconds);
    expect(right.challenge).toHaveLength(wrong.challenge.length);
  });

  it('rechaza un código equivocado y la contraseña equivocada aunque el código sea bueno', async () => {
    const server = mfaServer('requerido');
    const { secret } = enroll(server, 'supervisor');
    const code = totpCode(secret, nowMs(server));
    const wrongCode = code === '000000' ? '111111' : '000000';
    const bad = await loginWithCode(server, 'supervisor', wrongCode);
    expect(bad.status).toBe(401);
    const decoy = LoginCodeStepSchema.parse(
      await passwordStep(server, 'supervisor', 'contraseña-equivocada'),
    );
    const viaDecoy = await codeStep(server, decoy.challenge, code);
    expect(viaDecoy.status).toBe(401);
    expect(await viaDecoy.text()).toBe(await bad.text());
    // El código sigue sin usarse: con la contraseña correcta, entra.
    expect((await loginWithCode(server, 'supervisor', code)).status).toBe(200);
  });

  it('cada código sirve una sola vez, aunque siga vigente', async () => {
    const server = mfaServer('requerido');
    const { secret } = enroll(server, 'nodeOperation');
    const code = totpCode(secret, nowMs(server));
    expect((await loginWithCode(server, 'nodeOperation', code)).status).toBe(200);
    expect((await loginWithCode(server, 'nodeOperation', code)).status).toBe(401);
    // El del paso anterior tampoco: ya se aceptó uno posterior.
    const previous = hotp(secret, totpStep(nowMs(server)) - 1);
    expect((await loginWithCode(server, 'nodeOperation', previous)).status).toBe(401);
    // Treinta segundos después, el código nuevo entra.
    server.setNow(new Date(nowMs(server) + 30_000));
    expect(
      (await loginWithCode(server, 'nodeOperation', totpCode(secret, nowMs(server)))).status,
    ).toBe(200);
  });

  it('con un código de recuperación, que queda usado', async () => {
    const server = mfaServer('requerido');
    const { recoveryCodes } = enroll(server, 'oicSubstantiation');
    const code = recoveryCodes[4] ?? '';
    const response = await loginWithCode(server, 'oicSubstantiation', code.toLowerCase());
    expect(response.status).toBe(200);
    expect((await loginWithCode(server, 'oicSubstantiation', code)).status).toBe(401);
    expect((await loginWithCode(server, 'oicSubstantiation', recoveryCodes[5] ?? '')).status).toBe(
      200,
    );
    const kinds = server.ctx.securityLog
      .listByAccount(TEST_ACCOUNTS.oicSubstantiation.accountId)
      .map((event) => event.kind);
    expect(kinds.filter((kind) => kind === 'mfa_recovery_used')).toHaveLength(2);
    expect(JSON.stringify(server.ctx.securityLog.listAll())).not.toContain(code);
  });

  it('un reto vence a los 5 minutos y admite 5 intentos', async () => {
    const server = mfaServer('requerido');
    const { secret } = enroll(server, 'supervisor');
    const first = LoginCodeStepSchema.parse(await passwordStep(server, 'supervisor'));
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await codeStep(server, first.challenge, '000001')).status).toBe(401);
    }
    expect((await codeStep(server, first.challenge, totpCode(secret, nowMs(server)))).status).toBe(
      401,
    );
    const second = LoginCodeStepSchema.parse(await passwordStep(server, 'supervisor'));
    server.setNow(new Date(nowMs(server) + 5 * 60 * 1000));
    expect((await codeStep(server, second.challenge, totpCode(secret, nowMs(server)))).status).toBe(
      401,
    );
  });
});

describe('límite compartido con la contraseña (H05)', () => {
  it('contraseñas y códigos equivocados suman en el mismo tope por usuario', async () => {
    const server = mfaServer('requerido');
    const { secret } = enroll(server, 'supervisor');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await passwordStep(server, 'supervisor', 'contraseña-equivocada');
    }
    // Cinco códigos equivocados en retos reales: el décimo fallo agota el tope.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await loginWithCode(server, 'supervisor', '000002')).status).toBe(401);
    }
    const limited = await postJson(server.app, ROUTES.authLogin, {
      username: TEST_ACCOUNTS.supervisor.username,
      password: testPassword('supervisor'),
    });
    expect(limited.status).toBe(429);
    // Al vencer la ventana, contraseña y código correctos vuelven a abrir la sesión.
    server.setNow(new Date(TEST_START.getTime() + 16 * 60 * 1000));
    expect(
      (await loginWithCode(server, 'supervisor', totpCode(secret, nowMs(server)))).status,
    ).toBe(200);
  });

  it('un reto ya emitido responde 429 con el usuario bloqueado, aunque el código sea bueno', async () => {
    const server = mfaServer('requerido');
    const { secret } = enroll(server, 'supervisor');
    const pending = LoginCodeStepSchema.parse(await passwordStep(server, 'supervisor'));
    // Los códigos en retos señuelo también cuentan (no revelan que la contraseña fallaba).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const decoy = LoginCodeStepSchema.parse(
        await passwordStep(server, 'supervisor', 'contraseña-equivocada'),
      );
      expect((await codeStep(server, decoy.challenge, '000003')).status).toBe(401);
    }
    const response = await codeStep(server, pending.challenge, totpCode(secret, nowMs(server)));
    expect(response.status).toBe(429);
    const kinds = server.ctx.securityLog
      .listByAccount(TEST_ACCOUNTS.supervisor.accountId)
      .map((event) => event.kind);
    expect(kinds).toContain('login_rate_limited');
  });

  it('confirmar la inscripción con códigos equivocados también agota el tope', async () => {
    const server = mfaServer('requerido');
    const step = LoginEnrollStepSchema.parse(await passwordStep(server, 'oicIntake'));
    await postJson(server.app, ROUTES.authMfaEnroll, {}, step.token);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await postJson(server.app, ROUTES.authMfaConfirm, { code: '000004' }, step.token);
    }
    const response = await postJson(
      server.app,
      ROUTES.authMfaConfirm,
      { code: '000004' },
      step.token,
    );
    expect(response.status).toBe(429);
  });
});

describe('reinicio del segundo factor', () => {
  it('cierra el panel a las sesiones abiertas y pide inscribir de nuevo, sin secretos en el registro', async () => {
    const sessions = createSessionStore(() => TEST_START);
    const server = mfaServer('requerido', { sessions });
    const { secret } = enroll(server, 'inboxIntake');
    const session = LoginSessionStepSchema.parse(
      await (await loginWithCode(server, 'inboxIntake', totpCode(secret, nowMs(server)))).json(),
    );
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityComplaints, session.token)).status,
    ).toBe(200);
    expect(resetMfa(server.db, TEST_ACCOUNTS.inboxIntake.accountId, TEST_START)).toBe(true);
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityComplaints, session.token)).status,
    ).toBe(401);
    expect((await passwordStep(server, 'inboxIntake')).step).toBe('enroll');
    const events = server.ctx.securityLog.listByAccount(TEST_ACCOUNTS.inboxIntake.accountId);
    expect(events.map((event) => event.kind)).toContain('mfa_reset');
    expect(server.ctx.mfa.enrollments.isEnrolled(TEST_ACCOUNTS.inboxIntake.accountId)).toBe(false);
    // Reiniciar una cuenta sin inscripción lo registra igual y dice que no había nada.
    expect(resetMfa(server.db, TEST_ACCOUNTS.inboxIntake.accountId, TEST_START)).toBe(false);
  });
});
