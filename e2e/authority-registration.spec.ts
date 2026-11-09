// Alta de autoridades: la institución pide su alta y crea sus llaves en el navegador; la operación
// del nodo entra sin llave, solo aprueba si la huella que le leen coincide y ve la entrada propuesta
// del directorio. La operación no ve denuncias.
import { expect, test } from '@playwright/test';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { E2E_ACCOUNTS, e2ePassword } from './support/environment.ts';

const INSTITUTION = 'Contraloría Ficticia de Prueba E2E';

test('una institución pide su alta y la operación del nodo la aprueba con la huella', async ({
  page,
}) => {
  await page.goto('/autoridad');
  await page.getByTestId('registration-link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Solicitar alta de mi institución',
  );
  await expectNoAccessibilityViolations(page, 'solicitud de alta');

  // Sin llaves ni datos, la solicitud no sale.
  await page.getByTestId('registration-submit').click();
  await expect(page.getByText('Crea las llaves de tu institución.').first()).toBeVisible();

  await page.getByTestId('registration-institution').fill(INSTITUTION);
  await page.getByTestId('registration-state').selectOption('20');
  await page.getByTestId('registration-applicant').fill('Persona Solicitante Ficticia');
  await page.getByTestId('registration-position').fill('Titular del área de quejas');
  await page.getByTestId('registration-appointment').fill('Oficio E2E/001/2026');
  await page.locator('#registration-person-0').fill('Persona Ficticia Uno');
  await page.getByTestId('create-authority-keys-generate').click();
  const fingerprint = (await page.getByTestId('authority-padlock-fingerprint').textContent()) ?? '';
  expect(fingerprint).toMatch(/^[0-9a-f]{4}( [0-9a-f]{4}){3}$/);
  await page.getByTestId('registration-submit').click();

  await expect(page.getByTestId('registration-folio')).toHaveText(/^ALTA-[0-9A-F]{12}$/);
  await expect(page.getByTestId('registration-fingerprint')).toHaveText(fingerprint);
  await expectNoAccessibilityViolations(page, 'solicitud enviada');

  // La operación entra sin archivo de llave.
  await page.goto('/autoridad');
  const form = page.getByTestId('authority-login');
  await form.getByTestId('authority-username').fill(E2E_ACCOUNTS.operation);
  await form.getByTestId('authority-password').fill(e2ePassword(E2E_ACCOUNTS.operation));
  await form.getByTestId('authority-login-submit').click();
  await expect(page.getByTestId('profile-badge')).toHaveAttribute('data-kind', 'operation');
  await page.getByTestId('registration-item').filter({ hasText: INSTITUTION }).click();
  await expectNoAccessibilityViolations(page, 'detalle de la solicitud de alta');

  const approve = page.getByTestId('registration-approve');
  await expect(approve).toBeDisabled();
  await page.getByTestId('registration-heard').fill('0000 0000 0000 0000');
  await expect(page.getByTestId('registration-fingerprint-check')).toContainText('No coincide');
  await expect(approve).toBeDisabled();
  await page.getByTestId('registration-heard').fill(fingerprint.toUpperCase().replaceAll(' ', ''));
  await expect(page.getByTestId('registration-fingerprint-check')).toContainText('Coincide');
  await approve.click();
  await page.getByTestId('registration-approve-confirm').click();

  await expect(page.getByTestId('registration-status')).toHaveText('Aprobada');
  const entry = page.getByTestId('registration-directory-entry');
  await expect(entry).toContainText('"stateCode": "20"');
  await expect(entry).toContainText('authority.contraloria-ficticia-de-prueba-e2e');
});
