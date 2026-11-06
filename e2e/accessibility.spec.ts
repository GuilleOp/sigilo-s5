// Accesibilidad: axe (WCAG 2.0 A y AA) sin violaciones en cada pantalla, en cada paso y estado del
// asistente, en el seguimiento y en el panel; recorrido básico del asistente solo con teclado;
// obligatorios anunciados y atajo de teclado de la salida rápida.
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import {
  prepareSealedComplaint,
  routeToInvestigation,
  seedAnonymousComplaint,
  seedPreparedComplaint,
  syntheticFacts,
} from './support/api.ts';
import { E2E_ACCOUNTS } from './support/environment.ts';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { loginAsAuthority, openComplaint } from './support/authority.ts';
import { expect, test } from './support/fixtures.ts';
import {
  confirmReceipt,
  continueTo,
  expectStep,
  fillFacts,
  fixturePath,
  NEUTRAL_FACTS,
  readReceipt,
  startReport,
} from './support/report-wizard.ts';
import { FIXTURE_FILES } from './support/synthetic-files.ts';
import { openTracking, readTrackingError } from './support/tracking.ts';

test('las pantallas públicas no tienen violaciones de accesibilidad', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('cta-report')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'inicio');

  await page.goto('/seguimiento');
  await expect(page.getByTestId('tracking-login')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'seguimiento: acceso');

  await page.goto('/autoridad');
  await expect(page.getByTestId('authority-login')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'autoridad: acceso');

  await page.goto('/datos-abiertos');
  await expect(page.getByTestId('suppressed-count')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'datos abiertos');

  await page.goto('/verificar');
  await expectNoAccessibilityViolations(page, 'verificar: inicio');
  await page.getByTestId('verify-ledger').click();
  await expect(page.getByTestId('ledger-valid')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'verificar: resultado');

  await page.goto('/ruta-que-no-existe');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoAccessibilityViolations(page, 'página no encontrada');
});

test('cada paso y estado del asistente no tiene violaciones de accesibilidad', async ({ page }) => {
  await page.goto('/denunciar');
  await expectStep(page, 'mode');
  await expectNoAccessibilityViolations(page, 'paso 1: modo');
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('error-summary')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'paso 1: errores');
  await startReport(page, 'sealed', 'Nombre Ficticio Accesible');
  await expectNoAccessibilityViolations(page, 'paso 1: identidad sellada');

  await continueTo(page, 'facts');
  await expectNoAccessibilityViolations(page, 'paso 2: hechos vacíos');
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('error-summary')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'paso 2: errores');
  await fillFacts(page, {
    ...NEUTRAL_FACTS,
    description: 'Soy la única auxiliar del área y mi correo es persona.prueba@ejemplo.test.',
  });
  await page.getByTestId('description-input').press('End');
  await page.keyboard.insertText(readFileSync(fixturePath(FIXTURE_FILES.invisibleText), 'utf8'));
  await expect(page.getByTestId('text-finding').first()).toBeVisible();
  await expect(page.getByTestId('invisible-characters-alert')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'paso 2: revisor y caracteres invisibles');
  await page.getByTestId('strip-invisible').click();

  await continueTo(page, 'evidence');
  await expectNoAccessibilityViolations(page, 'paso 3: pruebas vacías');
  const evidenceInput = page.getByTestId('evidence-input');
  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.photo));
  await expect(page.getByTestId('metadata-panel')).toBeVisible();
  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.docx));
  await expect(page.getByTestId('rejected-file')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'paso 3: metadatos y archivo rechazado');
  await page.getByTestId('clean-evidence').click();
  await expect(page.getByTestId('clean-verified')).toBeVisible();
  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.pdf));
  const pdf = page.getByTestId('evidence-item').filter({ hasText: FIXTURE_FILES.pdf });
  await pdf.getByTestId('clean-evidence').click();
  await expect(pdf).toHaveAttribute('data-status', 'clean');
  await expectNoAccessibilityViolations(page, 'paso 3: pruebas limpias');

  await continueTo(page, 'review');
  await expect(page.getByTestId('risk-meter')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'paso 4: revisión');

  await continueTo(page, 'submit');
  await expectNoAccessibilityViolations(page, 'paso 5: envío');
  await page.getByTestId('submit-report').click();
  const { words } = await readReceipt(page);
  await expectNoAccessibilityViolations(page, 'paso 5: recibo y confirmación');
  await page.getByTestId('confirm-receipt').click();
  await expect(page.getByTestId('receipt-confirmation').getByText('Error:').first()).toBeVisible();
  await expectNoAccessibilityViolations(page, 'paso 5: confirmación con error');
  await confirmReceipt(page, words);
  await expectNoAccessibilityViolations(page, 'paso 5: recibo confirmado');
});

test('el seguimiento y el panel de autoridad no tienen violaciones de accesibilidad', async ({
  page,
  request,
}) => {
  const { folio, words } = await seedAnonymousComplaint(request);
  // La pregunta por el buzón la hace la investigación de la autoridad que aceptó la denuncia.
  await routeToInvestigation(request, folio);
  await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
  await expect(page.getByTestId('complaint-list')).toBeVisible();
  await expectNoAccessibilityViolations(page, 'autoridad: listado');
  await openComplaint(page, folio);
  await expectNoAccessibilityViolations(page, 'autoridad: detalle');
  await page.getByTestId('authority-question').fill('¿Me puede dar su nombre y teléfono?');
  await page.getByTestId('send-question').click();
  await expect(page.getByTestId('mailbox-message')).toHaveCount(1);
  await expectNoAccessibilityViolations(page, 'autoridad: pregunta enviada');

  await readTrackingError(page, folio, [...words].reverse());
  await expectNoAccessibilityViolations(page, 'seguimiento: error');
  await openTracking(page, folio, words);
  await expect(page.getByTestId('personal-data-warning')).toBeVisible();
  await page.getByTestId('reply-input').fill('Soy la única persona del área con acceso.');
  await expect(page.getByTestId('text-finding').first()).toBeVisible();
  await expectNoAccessibilityViolations(page, 'seguimiento: vista con mensaje y revisor');
});

test('el analizador sí detecta una violación inyectada (control)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.src = 'data:,';
    document.querySelector('main')?.append(image);
  });
  await expect(expectNoAccessibilityViolations(page, 'control')).rejects.toThrow(/image-alt/u);
});

test('el asistente se puede recorrer solo con teclado', async ({ page }) => {
  await page.goto('/denunciar');
  await expectStep(page, 'mode');

  // Desde el inicio del documento, el primer Tab lleva a la salida rápida y el segundo al enlace
  // para saltar al contenido.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('quick-exit')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contenido')).toBeFocused();

  // Tab hasta la primera opción de modo y se elige con la barra espaciadora.
  const anonymous = page.getByTestId('mode-anonymous');
  await tabUntilFocused(page, anonymous);
  await page.keyboard.press('Space');
  await expect(anonymous).toBeChecked();
  // Las flechas cambian de opción dentro del grupo de radios.
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('mode-sealed')).toBeChecked();
  await expect(page.getByTestId('identity-name')).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(anonymous).toBeChecked();

  // "Continuar" con Enter: el foco pasa al encabezado del paso nuevo.
  await tabUntilFocused(page, page.getByTestId('step-next'));
  await page.keyboard.press('Enter');
  await expectStep(page, 'facts');
  await expect(page.getByTestId('step-heading')).toBeFocused();

  // Intentar avanzar sin datos muestra el resumen de errores con el foco en él.
  await tabUntilFocused(page, page.getByTestId('step-next'));
  await page.keyboard.press('Enter');
  const summary = page.getByTestId('error-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toBeFocused();

  // Un enlace del resumen lleva el foco al campo con error.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('state-select')).toBeFocused();

  // Se escribe la descripción con el teclado y se regresa con "Atrás".
  await tabUntilFocused(page, page.getByTestId('description-input'));
  await page.keyboard.type('Texto escrito solo con el teclado.');
  await expect(page.getByTestId('description-input')).toHaveValue(
    'Texto escrito solo con el teclado.',
  );
  await tabUntilFocused(page, page.getByTestId('step-back'));
  await page.keyboard.press('Enter');
  await expectStep(page, 'mode');
  await expect(anonymous).toBeChecked();
});

/** Pulsa Tab hasta que el elemento reciba el foco (con un límite para no ciclar sin fin). */
async function tabUntilFocused(page: Page, target: Locator): Promise<void> {
  for (let presses = 0; presses < 80; presses++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('El elemento no recibió el foco con Tab.');
}

test('los datos obligatorios se anuncian y el periodo es un grupo con leyenda', async ({
  page,
}) => {
  await startReport(page, 'sealed', 'Nombre Ficticio Accesible');
  await expect(page.getByTestId('required-note')).toContainText('menos los que dicen «opcional»');
  await expect(page.getByTestId('identity-name')).toHaveAttribute('aria-required', 'true');
  await expect(page.getByTestId('mode-anonymous')).toHaveAttribute('required', '');
  await continueTo(page, 'facts');
  await expect(page.getByTestId('state-select')).toHaveAttribute('aria-required', 'true');
  await expect(page.getByTestId('description-input')).toHaveAttribute('aria-required', 'true');
  const period = page.getByRole('group', { name: '¿Cuándo pasó? (mes y año, aproximados)' });
  await expect(period.getByLabel('Mes')).toBeVisible();
  await expect(period.getByLabel('Año')).toBeVisible();
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('period-month')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('period-year')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('period-month')).toHaveAccessibleDescription(/Error:/u);
  // El progreso es una lista: el número y «(listo)» están en el texto.
  const progress = page.getByRole('list', { name: /Avance de tu denuncia/u });
  await expect(progress.getByRole('listitem').first()).toHaveText('1. Modo (listo)');
  await expect(progress.locator('[aria-current="step"]')).toHaveText('2. Hechos');
});

test.describe('atajo de la salida rápida', () => {
  const exitHost = 'www.google.com.mx';
  test.use({ allowedExternalHosts: [exitHost] });

  test('pulsar Esc dos veces seguidas sale de la aplicación', async ({ page }) => {
    await page.route(`https://${exitHost}/**`, (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<title>Clima</title>' }),
    );
    await page.goto('/denunciar');
    await expectStep(page, 'mode');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForURL(`https://${exitHost}/**`);
  });
});

/** Temas de la dirección A y anchos que se revisan (celular y escritorio). */
const THEMES = ['light', 'dark', 'contrast'] as const;
const WIDTHS = [390, 1280] as const;

/** Carpeta opcional para guardar capturas de cada pantalla (SIGILO_SCREENSHOTS_DIR). */
const SCREENSHOTS_DIR = process.env['SIGILO_SCREENSHOTS_DIR'] ?? '';

async function checkScreen(page: Page, name: string, theme: string, width: number) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expectNoAccessibilityViolations(page, `${name} (${theme}, ${width} px)`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${name} se desplaza a lo ancho en ${width} px`).toBeLessThanOrEqual(0);
  if (SCREENSHOTS_DIR !== '') {
    await page.screenshot({
      path: `${SCREENSHOTS_DIR}/${name}-${theme}-${width}.png`,
      fullPage: true,
    });
  }
}

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    test(`las pantallas principales cumplen AA en el tema ${theme} a ${width} px`, async ({
      page,
      request,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      // El tema elegido se recuerda en el navegador: así se fija antes de cargar cada pantalla.
      await page.addInitScript((value) => {
        try {
          window.localStorage.setItem('sigilo-tema', value);
        } catch {
          // Sin almacenamiento: el selector seguiría funcionando en la página.
        }
      }, theme);

      await page.goto('/');
      await expect(page.getByTestId('shield')).toBeVisible();
      await checkScreen(page, 'inicio', theme, width);

      // Denunciar: la revisión con el grupo de anonimato y el navegador de pasos.
      await startReport(page, 'anonymous');
      await continueTo(page, 'facts');
      await page.getByTestId('state-select').selectOption('22');
      await page.getByTestId('entity-select').selectOption('VE-INSTITUTO');
      await page.getByTestId('offense-select').selectOption('LGRA-59');
      await page.getByTestId('period-month').selectOption('03');
      await page.getByTestId('period-year').selectOption(String(new Date().getFullYear()));
      await page.getByTestId('accused-input').fill(NEUTRAL_FACTS.accused);
      await page.getByTestId('description-input').fill(NEUTRAL_FACTS.description);
      await page.getByTestId('workplace-yes').check();
      await continueTo(page, 'evidence');
      await continueTo(page, 'review');
      await expect(page.getByTestId('anonymity-notice')).toBeVisible();
      await checkScreen(page, 'denunciar', theme, width);

      // Seguimiento de una denuncia sellada y turnada.
      const prepared = await prepareSealedComplaint(
        request,
        'Persona Ficticia Temas',
        syntheticFacts({ entityId: 'VE-INSTITUTO', offenseCode: 'LGRA-59' }),
      );
      const { folio, words } = await seedPreparedComplaint(request, prepared);
      await routeToInvestigation(request, folio);
      await openTracking(page, folio, words);
      await expect(page.getByTestId('identity-status')).toBeVisible();
      await checkScreen(page, 'seguimiento', theme, width);

      // Panel: la ficha de la denuncia.
      await loginAsAuthority(page, E2E_ACCOUNTS.iffeInvestigator);
      await openComplaint(page, folio);
      await expect(page.getByTestId('context-sheet')).toBeVisible();
      await checkScreen(page, 'panel', theme, width);

      await page.goto('/observatorio');
      await expect(page.getByTestId('coverage-matrix')).toBeVisible();
      await checkScreen(page, 'observatorio', theme, width);
    });
  }
}

test('el selector de tema cambia los colores y recuerda la elección', async ({ page }) => {
  await page.goto('/');
  await page.getByText('Alto contraste', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  expect(await page.evaluate(() => window.localStorage.getItem('sigilo-tema'))).toBe('contrast');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await page.getByText('Como mi sistema', { exact: true }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/u);
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});
