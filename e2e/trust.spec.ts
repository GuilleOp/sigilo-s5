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

test('el inicio es breve y «Cómo te cuidamos» dice quién sabe qué y los límites', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('promises')).toContainText('Nadie sabe que fuiste tú');
  await expect(page.getByTestId('who-knows-what')).toHaveCount(0);
  const words = await page.evaluate(
    () => document.getElementById('contenido')?.innerText.trim().split(/\s+/u).length ?? 0,
  );
  expect(words).toBeLessThan(200);
  await page.getByTestId('protection-link').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cómo te cuidamos');
  const table = page.getByTestId('who-knows-what');
  await expect(table).toContainText('Pero no sabe quién eres');
  await table.getByText('Ver la explicación completa').click();
  await expect(table.getByRole('table')).toContainText('El enrutador ciego');
  await table.getByText('¿Y si el gobierno quiere saber quién soy?').click();
  await expect(table).toContainText('tu nombre no se guarda en ningún lado');
  await expect(page.getByTestId('honest-limits')).toContainText('cara a cara');
  await expectNoAccessibilityViolations(page, 'cómo te cuidamos');
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

test('quien no trabaja en la oficina ve el aviso ciudadano y el revisor marca su trámite', async ({
  page,
}) => {
  await startReport(page, 'anonymous');
  await continueTo(page, 'facts');
  await fillFacts(page, {
    accused: 'La persona que atiende la ventanilla de licencias',
    description:
      'En la ventanilla de licencias me pidieron 800 pesos para entregar mi trámite número A-2026-0042 el mismo día, y revisaron las placas ABC-123-D.',
  });
  await page.getByTestId('workplace-no').check();
  await expect(page.getByTestId('workplace-area')).toHaveCount(0);
  const review = page.getByTestId('description-review');
  await expect(review).toContainText('Número de trámite o expediente');
  await expect(review).toContainText('Placas de un vehículo');
  await continueTo(page, 'evidence');
  await continueTo(page, 'review');
  const notice = page.getByTestId('citizen-notice');
  await expect(notice).toContainText('Te atendieron en persona');
  await notice.getByText('Cómo protegerte').click();
  await notice.getByText('¿Te pidieron dinero y lo pagaste?').click();
  await expect(notice.getByTestId('citizen-bribe')).toContainText('artículos 88 y 89');
  await notice.getByText('¿Y si me niegan el trámite o me amenazan?').click();
  await expect(notice.getByTestId('citizen-retaliation')).toContainText(
    'no prevé medidas equivalentes para particulares',
  );
  await expect(page.getByTestId('anonymity-notice')).toHaveCount(0);
  await expectNoAccessibilityViolations(page, 'paso 4: aviso ciudadano');
});
