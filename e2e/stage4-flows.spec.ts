// Recorridos de la Etapa 4 con un solo nodo (el envío por la red se prueba contra la red en memoria
// en apps/web/src/network/network-flow.integration.test.ts): aviso del grupo de anonimato y su
// factor en el semáforo, destino de la denuncia, corroboración opcional, seguimiento con
// «turnada», plazos y ventana de inconformidad, panel con ficha de contexto y conflicto de interés,
// observatorio con la matriz de cobertura y modos de quiosco y lectura fácil. Todo con axe.
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { applyProcedure, seedAnonymousComplaint, syntheticFacts } from './support/api.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { E2E_ACCOUNTS, E2E_AUTHORITY } from './support/environment.ts';
import { expect, test } from './support/fixtures.ts';
import { continueTo, expectStep, reachSubmitStep, startReport } from './support/report-wizard.ts';
import { openTracking } from './support/tracking.ts';
import { turnOnEasyReading } from './support/accessibility-menu.ts';

/** Hechos del caso de Marta (docs/demo-escenario.md, sección 4.1), ya corregidos. */
const MARTA_FACTS = syntheticFacts({
  entityId: 'VE-INSTITUTO',
  offenseCode: 'LGRA-59',
  accused: 'Servidor Ficticio Uno, Jefe del Departamento de Compras',
  description:
    'En marzo el Departamento de Compras adjudicó de forma directa un contrato de equipo de cómputo a una empresa que aparece en la lista pública de contribuyentes con operaciones presuntamente inexistentes.',
});

const AGREEMENT =
  'Con fundamento en el artículo 100 de la Ley General de Responsabilidades Administrativas, se califica la conducta como falta no grave, toda vez que no se cuenta con elementos suficientes. Notifíquese.';

test('la persona ve el aviso de su grupo de anonimato, su factor en el semáforo y a quién va', async ({
  page,
}) => {
  await startReport(page, 'anonymous');
  await continueTo(page, 'facts');
  await page.getByTestId('state-select').selectOption('22');
  await page.getByTestId('entity-select').selectOption('VE-INSTITUTO');
  await page.getByTestId('offense-select').selectOption('LGRA-59');
  await page.getByTestId('period-month').selectOption('03');
  await page.getByTestId('period-year').selectOption(String(new Date().getFullYear()));
  await page.getByTestId('accused-input').fill(MARTA_FACTS.accused);
  await page.getByTestId('description-input').fill(MARTA_FACTS.description);
  await page.getByTestId('workplace-yes').check();
  await page.getByTestId('workplace-area').fill('Departamento de Compras');
  await continueTo(page, 'evidence');
  // Con un solo nodo no hay evaluador en el directorio: se dice y se envía igual.
  await expect(page.getByTestId('corroboration-unavailable')).toContainText('no está disponible');
  await continueTo(page, 'review');

  const notice = page.getByTestId('anonymity-notice');
  await expect(notice).toHaveAttribute('data-risk', 'high');
  await expect(notice.getByTestId('anonymity-level')).toContainText('Alto');
  await expect(page.getByTestId('risk-meter')).toContainText('Pocas personas comparten tu ente');
  await expect(page.getByTestId('routing-single-node')).toContainText('buzón general');
  await expectNoAccessibilityViolations(page, 'revisión con grupo de anonimato y destino');

  // «Generalizar el relato» lleva a la descripción.
  await notice.getByTestId('anonymity-generalize').click();
  await expectStep(page, 'facts');
  await expect(page.locator('#description-title')).toBeFocused();
});

test('el seguimiento explica «turnada», el plazo con su unidad y la calificación de no grave', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request, MARTA_FACTS);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
  });

  await openTracking(page, folio, words);
  await expect(page.getByTestId('tracking-headline')).toContainText(
    'Turnada: tu denuncia ya está con la autoridad que puede investigarla. Desde hoy corre su plazo.',
  );
  // El estado vigente es uno solo: al aceptarla, el titular ya no dice «Turnada».
  await applyProcedure(request, E2E_ACCOUNTS.iffeIntake, folio, { action: 'accept' });
  await openTracking(page, folio, words);
  await expect(page.getByRole('heading', { name: 'Estado: Aceptada' })).toBeVisible();
  await expect(page.getByTestId('tracking-headline')).not.toContainText('Turnada');
  const deadline = page.getByTestId('deadline-serious_offense_start');
  await expect(deadline).toBeVisible();
  await expect(deadline.getByTestId('deadline-remaining')).toContainText('días naturales');
  await expect(deadline).toContainText('En curso');
  await expect(page.getByTestId('identity-status')).toContainText('Tu identidad');
  await expectNoAccessibilityViolations(page, 'seguimiento con plazos');

  // El OIC califica la falta grave como no grave (escenario, día 30). La denuncia es anónima: la
  // inconformidad no está disponible y se explica por qué.
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'investigation',
  });
  await applyProcedure(request, E2E_ACCOUNTS.iffeInvestigator, folio, {
    action: 'advance_stage',
    stage: 'qualification',
    qualification: {
      severity: 'non_serious',
      legalBasis: 'LGRA, art. 100: calificación de la falta (fundamento sintético).',
      agreement: AGREEMENT,
    },
  });
  await openTracking(page, folio, words);
  await expect(page.getByTestId('tracking-headline')).toContainText(
    'La autoridad calificó la conducta como falta no grave.',
  );
  const appeal = page.getByTestId('tracking-appeal');
  await expect(appeal).toContainText('Falta no grave');
  await expect(appeal.getByTestId('appeal-anonymous')).toContainText('no está disponible');
  await expect(appeal.getByTestId('appeal-form')).toHaveCount(0);
  await expectNoAccessibilityViolations(page, 'seguimiento con calificación de no grave');
});

test('el panel muestra la ficha de contexto y el conflicto de interés, y registra la justificación', async ({
  page,
  request,
}) => {
  const { folio } = await seedAnonymousComplaint(request, MARTA_FACTS);
  await applyProcedure(request, E2E_ACCOUNTS.inboxIntake, folio, {
    action: 'route',
    authorityId: E2E_AUTHORITY,
  });
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeIntake);
  await openComplaint(page, folio);
  const detail = page.getByTestId('complaint-detail');
  const sheet = detail.getByTestId('context-sheet');
  await expect(sheet.getByTestId('priority-level')).toContainText('Prioridad');
  await expect(sheet.getByTestId('priority-factors')).toContainText('Puntos');
  const conflict = detail.getByTestId('conflict-panel');
  await expect(conflict).toHaveAttribute('data-outcome', 'possible-conflict');
  await expect(conflict).toContainText('Inmobiliaria Ficticia Ejemplo');
  await expectNoAccessibilityViolations(page, 'panel con ficha y conflicto');

  await conflict.getByTestId('conflict-response-justification').check();
  await conflict
    .getByTestId('conflict-note')
    .fill('La titular no participa en esta investigación (nota sintética).');
  await conflict.getByTestId('conflict-submit').click();
  await conflict.getByTestId('conflict-confirm-submit').click();
  await expect(detail.getByTestId('conflict-response')).toContainText('Justifico');
});

test('el observatorio muestra «¿Sirvió denunciar?» y la matriz de cobertura con «Sin cobertura»', async ({
  page,
}) => {
  await page.goto('/observatorio');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('¿Sirvió denunciar?');
  await expect(page.getByTestId('chart-outcomes')).toContainText(
    'Archivadas por falta de elementos',
  );
  await expect(page.getByTestId('authority-indicators')).toContainText('75 %');
  const matrix = page.getByTestId('coverage-matrix');
  await expect(matrix).toContainText('Estado Ejemplo (ficticio)');
  await expect(matrix).toContainText('Sin cobertura');
  await expect(page.getByTestId('open-datasets').getByRole('link').first()).toHaveAttribute(
    'href',
    /^\/datos\/abiertos\//u,
  );
  await expectNoAccessibilityViolations(page, 'observatorio');
});

test('el quiosco no deja copiar el recibo y borra todo al terminar; la franja del prototipo está', async ({
  page,
}) => {
  await page.goto('/denunciar?modo=quiosco');
  await expect(page.getByTestId('prototype-notice')).toContainText(
    'Prototipo para el Datatón 2026 · no es el sistema oficial',
  );
  await expect(page.getByTestId('kiosk-bar')).toBeVisible();
  await page.getByTestId('mode-anonymous').check();
  await page.getByTestId('kiosk-finish').click();
  await expect(page.getByTestId('step-mode')).toHaveCount(0);
  // Sin recargar: el borrador ya no existe y el equipo sigue en modo quiosco.
  await page
    .locator('.site-nav__list')
    .getByRole('link', { name: 'Denunciar', exact: true })
    .click();
  await expect(page.getByTestId('mode-anonymous')).not.toBeChecked();
  await expect(page.getByTestId('kiosk-bar')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'quiosco');

  // Lectura fácil desde el menú «Accesibilidad».
  await turnOnEasyReading(page);
  await expect(page.locator('html')).toHaveAttribute('data-reading', 'easy');
});

test('en un celular de 390 px el observatorio no se desplaza a lo ancho', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/observatorio');
  await expect(page.getByTestId('coverage-matrix')).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('el recibo es un talón y al imprimir solo sale el talón', async ({ page }) => {
  await reachSubmitStep(page, 'anonymous');
  await page.getByTestId('submit-report').click();
  await expect(page.getByTestId('submit-success')).toBeVisible({ timeout: 20_000 });
  const stub = page.getByTestId('stub');
  await expect(stub).toContainText('Folio');
  await expectNoAccessibilityViolations(page, 'talón del recibo');
  await page.emulateMedia({ media: 'print' });
  // En la hoja de impresión, el título de la página y los avisos no se ven; el talón y sus
  // 8 palabras, sí.
  await expect(page.getByRole('heading', { level: 1 })).not.toBeVisible();
  await expect(stub).toBeVisible();
  await expect(stub.locator('.receipt-words.print-only li')).toHaveCount(8);
  await page.emulateMedia({ media: 'screen' });
});
