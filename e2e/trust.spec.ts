// Confianza verificable: la denuncia se escribe y sus fotos se limpian sin conexión (modo avión) y
// se envía al reconectar; «Lo que sale de tu equipo» dice qué viaja y qué no; la portada explica
// quién sabe qué y los límites; /verificar cuenta, con la bitácora ya comprobada, las denuncias y
// las aperturas de nombres.
import { seedAnonymousComplaint } from './support/api.ts';
import { advanceServerClockToNextDay } from './support/clock.ts';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { expect, test } from './support/fixtures.ts';
import {
  confirmReceipt,
  continueTo,
  fillFacts,
  fixturePath,
  readReceipt,
  startReport,
} from './support/report-wizard.ts';
import { FIXTURE_FILES } from './support/synthetic-files.ts';

test('la portada dice quién sabe qué y lo que SIGILO no puede hacer', async ({ page }) => {
  await page.goto('/');
  const table = page.getByTestId('who-knows-what');
  await expect(table.getByRole('table')).toContainText('El enrutador ciego');
  await table.getByText('¿Y si el gobierno quiere saber quién soy?').click();
  await expect(table).toContainText('tu nombre no se guarda en ningún lado');
  await expect(page.getByTestId('honest-limits')).toContainText('cara a cara');
  await expectNoAccessibilityViolations(page, 'inicio: confianza');
});

test('se escribe sin conexión, se ve lo que saldrá y se envía al reconectar', async ({
  page,
  context,
}) => {
  await startReport(page, 'anonymous');
  await expect(page.getByTestId('offline-tip')).toContainText('modo avión');
  await context.setOffline(true);
  // Desde aquí y hasta enviar, nada puede salir del equipo.
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await continueTo(page, 'facts');
  await fillFacts(page);
  await continueTo(page, 'evidence');
  await page.getByTestId('evidence-input').setInputFiles(fixturePath(FIXTURE_FILES.photo));
  const photo = page.getByTestId('evidence-item').filter({ hasText: FIXTURE_FILES.photo });
  await photo.getByTestId('clean-evidence').click();
  await expect(photo).toHaveAttribute('data-status', 'clean');
  await continueTo(page, 'review');

  const outgoing = page.getByTestId('outgoing');
  await outgoing.getByTestId('outgoing-toggle').click();
  await expect(outgoing.getByTestId('outgoing-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(outgoing.getByTestId('outgoing-travels')).toContainText('Una prueba limpia');
  await expect(outgoing.getByTestId('outgoing-stays')).toContainText('Tus 8 palabras.');
  await expect(outgoing.getByTestId('outgoing-stays')).toContainText(
    'no los pedimos, y no hay cuenta',
  );
  await expectNoAccessibilityViolations(page, 'paso 4: lo que sale de tu equipo');
  // Solo las fotos locales (blob:) y los datos en línea; ninguna petición de red.
  expect(requests.filter((url) => !/^(blob|data):/u.test(url))).toEqual([]);

  await context.setOffline(false);
  await continueTo(page, 'submit');
  await page.getByTestId('submit-report').click();
  await expect(page.getByTestId('submit-success')).toBeVisible();
  const receipt = await readReceipt(page);
  await confirmReceipt(page, receipt.words);
  await expect(page.getByTestId('submit-done')).toContainText(receipt.folio);
});

test('/verificar cuenta denuncias y aperturas con la bitácora ya comprobada', async ({
  page,
  request,
}) => {
  await seedAnonymousComplaint(request);
  await advanceServerClockToNextDay();
  await page.goto('/verificar');
  await expect(page.getByTestId('ledger-figures')).toHaveCount(0);
  await page.getByTestId('verify-ledger').click();
  await expect(page.getByTestId('ledger-valid')).toBeVisible();
  const figures = page.getByTestId('ledger-figures');
  await expect(figures).toContainText('las contó tu equipo');
  expect(Number(await figures.getByTestId('figure-complaints').textContent())).toBeGreaterThan(0);
  for (const id of ['figure-opened', 'figure-released']) {
    await expect(figures.getByTestId(id)).toHaveText(/^\d+$/u);
  }
  await expectNoAccessibilityViolations(page, 'verificar: cifras');
});
