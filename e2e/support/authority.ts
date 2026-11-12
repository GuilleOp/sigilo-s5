// Ayudantes del panel de autoridad: inicio de sesión con una cuenta individual y la llave (y el
// código del segundo factor si la cuenta lo tiene), y apertura de una denuncia.
import type { Page } from '@playwright/test';
import { E2E_ACCOUNTS, e2ePassword } from './environment.ts';
import { expect } from './fixtures.ts';
import { hasE2eMfa, nextTotpCode } from './mfa.ts';
import { fixturePath } from './report-wizard.ts';
import { FIXTURE_FILES } from './synthetic-files.ts';

/**
 * Segundo paso del acceso de una cuenta con segundo factor: escribe el código TOTP que el servidor
 * aceptará ahora (calculado con el secreto sintético de la cuenta) y lo envía. No hace nada si la
 * cuenta no tiene segundo factor en E2E.
 */
export async function completeTotpStep(page: Page, username: string): Promise<void> {
  if (!hasE2eMfa(username)) return;
  const form = page.getByTestId('authority-code-form');
  await expect(form).toBeVisible();
  await form.getByTestId('authority-code').fill(await nextTotpCode(username));
  await form.getByTestId('authority-code-submit').click();
}

/**
 * Inicia sesión en /autoridad con la cuenta `username` (por omisión, la recepción del buzón
 * general, donde llegan las denuncias nuevas) y `authority-demo-key.json`; si la cuenta tiene
 * segundo factor, completa el código TOTP.
 */
export async function loginAsAuthority(
  page: Page,
  username: string = E2E_ACCOUNTS.inboxIntake,
): Promise<void> {
  await page.goto('/autoridad');
  const form = page.getByTestId('authority-login');
  await form.getByTestId('authority-username').fill(username);
  await form.getByTestId('authority-password').fill(e2ePassword(username));
  await form
    .getByTestId('authority-key-file')
    .setInputFiles(fixturePath(FIXTURE_FILES.authorityKey));
  await form.getByTestId('authority-login-submit').click();
  await completeTotpStep(page, username);
  await expect(page.getByTestId('authority-logout')).toBeVisible();
}

/** Abre el detalle de la denuncia con el folio indicado desde el listado. */
export async function openComplaint(page: Page, folio: string): Promise<void> {
  await page.getByTestId('open-complaint').filter({ hasText: folio }).click();
  await expect(page.getByTestId('complaint-detail')).toContainText(folio);
}
