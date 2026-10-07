// Ayudantes del panel de autoridad: inicio de sesión con token y llave, y apertura de una denuncia.
import type { Page } from '@playwright/test';
import { AUTHORITY_TOKEN } from './environment.ts';
import { expect } from './fixtures.ts';
import { fixturePath } from './report-wizard.ts';
import { FIXTURE_FILES } from './synthetic-files.ts';

/** Inicia sesión en /autoridad con el token de prueba y `authority-demo-key.json`. */
export async function loginAsAuthority(page: Page): Promise<void> {
  await page.goto('/autoridad');
  const form = page.getByTestId('authority-login');
  await form.getByTestId('authority-token').fill(AUTHORITY_TOKEN);
  await form
    .getByTestId('authority-key-file')
    .setInputFiles(fixturePath(FIXTURE_FILES.authorityKey));
  await form.getByTestId('authority-login-submit').click();
  await expect(page.getByTestId('authority-logout')).toBeVisible();
}

/** Abre el detalle de la denuncia con el folio indicado desde el listado. */
export async function openComplaint(page: Page, folio: string): Promise<void> {
  await page.getByTestId('open-complaint').filter({ hasText: folio }).click();
  await expect(page.getByTestId('complaint-detail')).toContainText(folio);
}
