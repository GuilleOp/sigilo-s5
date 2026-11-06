// Flujo de la autoridad con cuentas individuales: inicio de sesión (y su rechazo), turnar desde el
// buzón general, aceptar, investigar y cerrar con fundamento y acuerdo en versión pública; la
// persona denunciante ve la línea de tiempo explicada, el cierre y los plazos.
import { ROUTES, TrackingViewSchema } from '@sigilo/contracts';
import { deriveReceiptKeys, phraseToEntropy, toBase64Url } from '@sigilo/core';
import { seedAnonymousComplaint } from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { API_ORIGIN, E2E_ACCOUNTS, E2E_AUTHORITY } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import { fixturePath } from './support/report-wizard.ts';
import { FIXTURE_FILES } from './support/synthetic-files.ts';

const AGREEMENT =
  'Acuerdo sintético en versión pública: se requirió información a la unidad compradora ficticia y se comprobó la entrega completa de los bienes; se concluye la investigación.';
const LEGAL_BASIS = 'LGRA, art. 100: conclusión con elementos (fundamento sintético).';

test('una contraseña equivocada no abre el panel y no dice si el usuario existe', async ({
  page,
}) => {
  await page.goto('/autoridad');
  const form = page.getByTestId('authority-login');
  await form.getByTestId('authority-username').fill(E2E_ACCOUNTS.inboxIntake);
  await form.getByTestId('authority-password').fill('contrasena-equivocada-e2e');
  await form
    .getByTestId('authority-key-file')
    .setInputFiles(fixturePath(FIXTURE_FILES.authorityKey));
  await form.getByTestId('authority-login-submit').click();
  await expect(page.getByTestId('authority-error')).toContainText('No tienes permiso');
  await expect(page.getByTestId('authority-logout')).toHaveCount(0);
});

test('el buzón turna, la autoridad acepta, investiga y cierra con acuerdo; la persona lo ve', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);

  // Recepción del buzón general: turna al OIC con una nota pública.
  await loginAsAuthority(page);
  await openComplaint(page, folio);
  let detail = page.getByTestId('complaint-detail');
  await detail.getByTestId('procedure-authority').selectOption(E2E_AUTHORITY);
  await detail
    .getByTestId('procedure-note')
    .fill('Se turna al órgano interno de control (nota sintética).');
  await detail.getByTestId('apply-procedure').click();
  await expect(detail.getByTestId('procedure-message')).toHaveText(
    'Listo: Turnar a una autoridad. La denuncia ya no está en tu bandeja.',
  );

  // Recepción del OIC: acepta.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeIntake);
  await openComplaint(page, folio);
  detail = page.getByTestId('complaint-detail');
  await expect(detail.getByTestId('procedure-action')).toHaveValue('accept');
  await detail.getByTestId('apply-procedure').click();
  await expect(detail.getByTestId('procedure-state')).toHaveText('Aceptada');
  // Quien recibe y turna no tiene acciones de investigación.
  await expect(detail.getByTestId('procedure-panel')).toContainText(
    'Tu función no tiene acciones del trámite en este estado.',
  );

  // Investigación del OIC: inicia la investigación y cierra con fundamento y acuerdo.
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await openComplaint(page, folio);
  detail = page.getByTestId('complaint-detail');
  await detail.getByTestId('procedure-stage').selectOption('investigation');
  await detail.getByTestId('apply-procedure').click();
  await expect(detail.getByTestId('procedure-state')).toHaveText('Aceptada · Etapa: Investigación');
  await detail.getByTestId('procedure-action').selectOption('close');
  await detail.getByTestId('procedure-reason').selectOption('attended');
  await detail.getByTestId('procedure-legal-basis').fill(LEGAL_BASIS);
  await detail.getByTestId('procedure-agreement').fill(AGREEMENT);
  await detail.getByTestId('apply-procedure').click();
  await expect(detail.getByTestId('detail-status')).toHaveText(/^Cerrada/u);

  // La persona denunciante ve cada paso con su explicación, el cierre y su acuerdo.
  const keys = deriveReceiptKeys(phraseToEntropy(words));
  const response = await request.post(`${API_ORIGIN}${ROUTES.tracking}`, {
    data: { folio, authKey: toBase64Url(keys.authKey) },
  });
  const view = TrackingViewSchema.parse(await response.json());
  expect(view.status).toBe('resolved');
  expect(view.procedure?.steps.map((step) => step.action)).toEqual([
    'received',
    'routed',
    'accepted',
    'stage_advanced',
    'closed',
  ]);
  expect(view.procedure?.steps[1]?.note).toBe(
    'Se turna al órgano interno de control (nota sintética).',
  );
  expect(view.procedure?.closure).toMatchObject({
    reason: 'attended',
    legalBasis: LEGAL_BASIS,
    agreement: AGREEMENT,
  });
  // Ningún dato del seguimiento identifica a la cuenta que actuó.
  expect(JSON.stringify(view)).not.toContain('acct-');
});
