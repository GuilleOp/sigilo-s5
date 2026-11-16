// «Compruébalo tú» de verdad (ADR 0012): al abrir /denunciar la web descarga los catálogos de todo
// el país; después, en modo avión, se elige estado e institución, se estima el grupo de anonimato y
// se ve «Tu denuncia llega a» sin ninguna petición. El envío pide conexión y sale al reconectar.
import { expect, test } from './support/fixtures.ts';
import { chooseOption } from './support/combobox.ts';
import { confirmReceipt, continueTo, readReceipt, startReport } from './support/report-wizard.ts';

/** Hechos sintéticos (caso ficticio de la demostración). */
const FACTS = {
  accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
  description:
    'En marzo el Departamento de Compras adjudicó de forma directa un contrato de equipo de cómputo a una empresa que aparece en la lista pública de contribuyentes con operaciones presuntamente inexistentes.',
};

test('con los catálogos descargados al empezar, los pasos 1 a 4 funcionan sin conexión', async ({
  page,
  context,
}) => {
  const catalogs: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/datos/')) catalogs.push(path);
  });
  await startReport(page, 'anonymous');
  await expect(page.getByTestId('offline-tip')).toContainText('unos 300 KB');
  const ready = page.getByTestId('offline-ready');
  await expect(ready).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
  await expect(ready).toContainText('Puedes desconectarte');
  // Todas las entidades y todo el catálogo de anonimato que publica el build de pruebas (el
  // sintético: índice, federal 00 y Morelos 17), siempre lo mismo: no revela la entidad.
  expect(new Set(catalogs.filter((path) => path.startsWith('/datos/entes/'))).size).toBe(33);
  expect(catalogs).toEqual(
    expect.arrayContaining([
      '/datos/grupos-anonimato/indice.json',
      '/datos/grupos-anonimato/00.json',
      '/datos/grupos-anonimato/17.json',
    ]),
  );

  await context.setOffline(true);
  const offline: string[] = [];
  page.on('request', (request) => offline.push(request.url()));

  await continueTo(page, 'facts');
  // Varias entidades sin conexión: cada una muestra sus instituciones reales.
  const entityHint = page.locator('#entityId-hint');
  await page.getByTestId('state-select').selectOption('09');
  await expect(entityHint).not.toContainText('No pudimos');
  await page.getByTestId('state-select').selectOption('22');
  await expect(entityHint).not.toContainText('No pudimos');
  await page.getByTestId('entity-select').fill('contraloria');
  await expect(
    page.getByTestId('entity-select-option').and(page.locator('[data-value="PDN-22-7176"]')),
  ).toHaveText('Secretaría de la Contraloría');
  await page.getByTestId('entity-select').fill('');
  await page.getByTestId('entity-select').press('Escape');
  // El caso se presenta contra una oficina ficticia: ninguna prueba acusa a una institución real.
  await chooseOption(page, 'entity-select', 'VE-INSTITUTO');
  await chooseOption(page, 'offense-select', 'LGRA-59');
  await page.getByTestId('period-month').selectOption('03');
  await page.getByTestId('period-year').selectOption(String(new Date().getFullYear()));
  await page.getByTestId('accused-input').fill(FACTS.accused);
  await page.getByTestId('description-input').fill(FACTS.description);
  await page.getByTestId('workplace-yes').check();
  await page.getByTestId('workplace-area').fill('Departamento de Compras');
  await continueTo(page, 'evidence');
  await continueTo(page, 'review');

  // El grupo de anonimato se estima con el catálogo ya en memoria (área de 5 personas: alto).
  const notice = page.getByTestId('anonymity-notice');
  await expect(notice).toHaveAttribute('data-risk', 'high');
  await expect(notice.getByTestId('anonymity-level')).toContainText('Alto');
  const routing = page.getByTestId('routing-panel');
  await expect(routing).toContainText('Tu denuncia llega a');
  await expect(routing.getByTestId('routing-single-node')).toContainText('buzón general');
  // Ni una petición desde que se cortó la red (solo fotos locales y datos en línea).
  expect(offline.filter((url) => !/^(blob|data):/u.test(url))).toEqual([]);

  // Para enviar sí hace falta conexión: se dice y el botón no envía.
  await continueTo(page, 'submit');
  await expect(page.getByTestId('submit-offline')).toContainText('Para enviar necesitas conexión');
  await expect(page.getByTestId('submit-report')).toHaveAttribute('aria-disabled', 'true');

  await context.setOffline(false);
  await expect(page.getByTestId('submit-offline')).toHaveCount(0);
  await page.getByTestId('submit-report').click();
  await expect(page.getByTestId('submit-success')).toBeVisible({ timeout: 20_000 });
  const receipt = await readReceipt(page);
  await confirmReceipt(page, receipt.words);
  await expect(page.getByTestId('submit-done')).toContainText(receipt.folio);
});
