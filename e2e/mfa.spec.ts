// Segundo factor del panel (TOTP, RFC 6238): inscripción en el primer inicio de sesión con QR,
// clave y códigos de recuperación; entrada con el código de la app; rechazo de un código
// equivocado y de uno ya usado; y entrada con un código de recuperación, que queda gastado.
import type { Page } from '@playwright/test';
import { LoginResponseSchema, ROUTES } from '@sigilo/contracts';
import { fromBase32, hotp } from '../apps/server/src/security/totp.ts';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { API_ORIGIN, E2E_MFA_ENROLLMENT_USER, e2ePassword } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import {
  currentStep,
  e2eRecoveryCodes,
  lastAcceptedStep,
  nextTotpCode,
  totpAt,
} from './support/mfa.ts';
import { fixturePath } from './support/report-wizard.ts';
import { FIXTURE_FILES } from './support/synthetic-files.ts';

/** Cuenta de la fiscalía: segundo factor inscrito al preparar la corrida. */
const PROSECUTOR = 'fiscalia';

/** Escribe usuario, contraseña y llave y envía el primer paso. */
async function submitPassword(page: Page, username: string): Promise<void> {
  await page.goto('/autoridad');
  const form = page.getByTestId('authority-login');
  await form.getByTestId('authority-username').fill(username);
  await form.getByTestId('authority-password').fill(e2ePassword(username));
  await form
    .getByTestId('authority-key-file')
    .setInputFiles(fixturePath(FIXTURE_FILES.authorityKey));
  await form.getByTestId('authority-login-submit').click();
}

async function submitCode(page: Page, code: string): Promise<void> {
  const form = page.getByTestId('authority-code-form');
  await form.getByTestId('authority-code').fill(code);
  await form.getByTestId('authority-code-submit').click();
}

async function logout(page: Page): Promise<void> {
  await page.getByTestId('authority-logout').click();
  await expect(page.getByTestId('authority-login')).toBeVisible();
}

test('una cuenta sin segundo factor lo inscribe al entrar y recibe sus códigos de recuperación', async ({
  page,
}) => {
  await submitPassword(page, E2E_MFA_ENROLLMENT_USER);
  const enroll = page.getByTestId('mfa-enroll');
  await expect(enroll).toBeVisible();
  // El panel no se abre antes de inscribir el segundo factor.
  await expect(page.getByTestId('authority-logout')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Activa la verificación en dos pasos' }),
  ).toBeFocused();
  await expect(enroll.getByTestId('mfa-qr')).toBeVisible();
  const code = enroll.getByTestId('mfa-enroll-code');
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expectNoAccessibilityViolations(page, 'inscripción del segundo factor');

  // La app de autenticación de la prueba: el secreto que se escribiría a mano.
  const secret = fromBase32(
    ((await enroll.getByTestId('mfa-secret').textContent()) ?? '').replace(/\s/gu, ''),
  );
  await code.fill('000000');
  await enroll.getByTestId('mfa-enroll-submit').click();
  await expect(page.getByTestId('mfa-enroll-error')).toContainText('no coincide');
  await code.fill(hotp(secret, currentStep()));
  await enroll.getByTestId('mfa-enroll-submit').click();

  const recovery = page.getByTestId('mfa-recovery');
  await expect(recovery).toBeVisible();
  await expect(recovery.getByTestId('mfa-recovery-code')).toHaveCount(10);
  const codes = await recovery.getByTestId('mfa-recovery-code').allTextContents();
  for (const item of codes) expect(item).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/u);
  await expect(recovery.getByTestId('mfa-recovery-download')).toHaveAttribute(
    'download',
    'sigilo-codigos-de-recuperacion.txt',
  );
  const download = page.waitForEvent('download');
  await recovery.getByTestId('mfa-recovery-download').click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe('sigilo-codigos-de-recuperacion.txt');
  await expectNoAccessibilityViolations(page, 'códigos de recuperación');
  // Sin confirmar que los guardó, no sigue.
  await recovery.getByTestId('mfa-recovery-continue').click();
  await expect(page.getByTestId('authority-logout')).toHaveCount(0);
  await recovery.getByTestId('mfa-recovery-saved').check();
  await recovery.getByTestId('mfa-recovery-continue').click();
  await expect(page.getByTestId('authority-logout')).toBeVisible();

  // La siguiente vez entra con el código de la app (uno posterior al de la confirmación).
  await logout(page);
  await submitPassword(page, E2E_MFA_ENROLLMENT_USER);
  await expect(page.getByTestId('authority-code-form')).toBeVisible();
  const step = Math.max(currentStep(), lastAcceptedStep(E2E_MFA_ENROLLMENT_USER) + 1);
  while (step > currentStep() + 1) await page.waitForTimeout(500);
  await submitCode(page, hotp(secret, step));
  await expect(page.getByTestId('authority-logout')).toBeVisible();
});

test('con segundo factor, la contraseña sola no abre el panel y el código de la app sí', async ({
  page,
}) => {
  await submitPassword(page, PROSECUTOR);
  const form = page.getByTestId('authority-code-form');
  await expect(form).toBeVisible();
  await expect(page.getByTestId('authority-logout')).toHaveCount(0);
  const code = form.getByTestId('authority-code');
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expectNoAccessibilityViolations(page, 'código del segundo factor');
  await submitCode(page, await nextTotpCode(PROSECUTOR));
  await expect(page.getByTestId('authority-logout')).toBeVisible();
});

test('un código equivocado no abre el panel', async ({ page }) => {
  await submitPassword(page, PROSECUTOR);
  const right = await nextTotpCode(PROSECUTOR);
  await submitCode(page, right === '000000' ? '111111' : '000000');
  await expect(page.getByTestId('authority-code-error')).toContainText(
    'El código no es válido o ya se usó',
  );
  await expect(page.getByTestId('authority-logout')).toHaveCount(0);
  // Con el código correcto, en el mismo reto, entra.
  await submitCode(page, right);
  await expect(page.getByTestId('authority-logout')).toBeVisible();
});

test('el mismo código no sirve dos veces', async ({ request }) => {
  const passwordStep = async () => {
    const response = await request.post(`${API_ORIGIN}${ROUTES.authLogin}`, {
      data: { username: PROSECUTOR, password: e2ePassword(PROSECUTOR) },
    });
    const parsed = LoginResponseSchema.parse(await response.json());
    if (parsed.step !== 'code') throw new Error('Se esperaba el segundo factor.');
    return parsed.challenge;
  };
  const code = await nextTotpCode(PROSECUTOR);
  const first = await request.post(`${API_ORIGIN}${ROUTES.authLoginCode}`, {
    data: { challenge: await passwordStep(), code },
  });
  expect(first.status()).toBe(200);
  const again = await request.post(`${API_ORIGIN}${ROUTES.authLoginCode}`, {
    data: { challenge: await passwordStep(), code },
  });
  expect(again.status()).toBe(401);
  // El nodo recuerda el paso de ese código como el último aceptado de la cuenta.
  const step = lastAcceptedStep(PROSECUTOR);
  expect(code).toBe(totpAt(PROSECUTOR, step));
});

test('un código de recuperación abre el panel una sola vez', async ({ page }) => {
  const [code] = e2eRecoveryCodes(PROSECUTOR);
  if (code === undefined) throw new Error('Faltan códigos de recuperación.');
  await submitPassword(page, PROSECUTOR);
  await page.getByTestId('authority-use-recovery').click();
  const field = page.getByTestId('authority-code');
  await expect(field).toBeFocused();
  await expect(page.getByText('Código de recuperación', { exact: true })).toBeVisible();
  await submitCode(page, code.toLowerCase());
  await expect(page.getByTestId('authority-logout')).toBeVisible();

  // Ya se usó: el mismo código no vuelve a abrir el panel.
  await logout(page);
  await submitPassword(page, PROSECUTOR);
  await page.getByTestId('authority-use-recovery').click();
  await submitCode(page, code);
  await expect(page.getByTestId('authority-code-error')).toContainText(
    'El código no es válido o ya se usó',
  );
  await expect(page.getByTestId('authority-logout')).toHaveCount(0);
});
