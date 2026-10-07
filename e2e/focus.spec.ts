// Gestión del foco en un celular pequeño (320×568): tras cada acción que destruye el control
// pulsado, el foco no cae en <body>; y el elemento enfocado no queda debajo de la barra fija.
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.ts';
import {
  continueTo,
  expectStep,
  fillFacts,
  fixturePath,
  readReceipt,
  startReport,
} from './support/report-wizard.ts';
import { FIXTURE_FILES } from './support/synthetic-files.ts';

test.use({ viewport: { width: 320, height: 568 }, hasTouch: true });

/** Datos del elemento con el foco y de la barra fija, medidos en la página. */
interface FocusReport {
  isBody: boolean;
  description: string;
  top: number;
  headerBottom: number;
  isHeaderSticky: boolean;
}

async function readFocus(page: Page): Promise<FocusReport> {
  return page.evaluate(() => {
    const active = document.activeElement;
    const header = document.querySelector('.site-header');
    const headerRect = header?.getBoundingClientRect();
    const isSticky = header !== null && getComputedStyle(header).position === 'sticky';
    const element = active instanceof HTMLElement ? active : null;
    return {
      isBody: active === null || active === document.body,
      description:
        element === null
          ? 'ninguno'
          : `${element.tagName.toLowerCase()}#${element.id} ${element.textContent?.slice(0, 40) ?? ''}`,
      top: element?.getBoundingClientRect().top ?? 0,
      headerBottom: headerRect?.bottom ?? 0,
      isHeaderSticky: isSticky,
    };
  });
}

/** El foco existe, no está en <body> y su borde superior queda debajo de la barra fija. */
async function expectFocusVisible(page: Page, after: string): Promise<void> {
  // Se espera a que el destino del foco aparezca (el foco se mueve en el siguiente frame).
  await expect
    .poll(async () => (await readFocus(page)).isBody, { message: `foco en <body> tras ${after}` })
    .toBe(false);
  const focus = await readFocus(page);
  expect(focus.isHeaderSticky, 'la barra mínima es fija en 320×568').toBe(true);
  expect(
    focus.top,
    `«${focus.description}» queda debajo de la barra fija tras ${after}`,
  ).toBeGreaterThanOrEqual(focus.headerBottom - 1);
}

test('la barra fija es mínima y no tapa el contenido enfocado', async ({ page }) => {
  await page.goto('/denunciar');
  await expectStep(page, 'mode');
  const headerHeight = await page.locator('.site-header').evaluate((header) => header.clientHeight);
  expect(headerHeight).toBeLessThanOrEqual(72);

  // El primer Tab lleva a la salida rápida; su ayuda está fuera del botón.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('quick-exit')).toBeFocused();
  await expect(page.getByTestId('quick-exit')).toHaveAccessibleName('Salida rápida');
  await expect(page.getByTestId('quick-exit')).toHaveAccessibleDescription(/página del clima/u);

  // Resumen de errores: recibe el foco; su enlace lleva al primer radio y deja la leyenda visible.
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('error-summary')).toBeFocused();
  await expectFocusVisible(page, 'intentar avanzar sin elegir modo');
  await page.getByTestId('error-summary').getByRole('link').first().click();
  await expect(page.getByTestId('mode-anonymous')).toBeFocused();
  await expectFocusVisible(page, 'ir al modo desde el resumen');
  const legendTop = await page
    .locator('#mode legend')
    .evaluate((legend) => legend.getBoundingClientRect().top);
  const headerBottom = (await readFocus(page)).headerBottom;
  expect(legendTop).toBeGreaterThanOrEqual(headerBottom - 1);

  // Recorrido hacia atrás con Mayúsculas+Tab desde el final del paso de hechos.
  await page.getByTestId('mode-anonymous').check();
  await continueTo(page, 'facts');
  await expect(page.getByTestId('step-heading')).toBeFocused();
  await page.getByTestId('description-input').focus();
  for (let presses = 0; presses < 8; presses++) {
    await page.keyboard.press('Shift+Tab');
    await expectFocusVisible(page, `Mayúsculas+Tab número ${presses + 1}`);
  }
});

test('en un celular horizontal (poca altura) la barra no es fija', async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto('/');
  const position = await page
    .locator('.site-header')
    .evaluate((header) => getComputedStyle(header).position);
  expect(position).not.toBe('sticky');
});

test('el foco no se pierde cuando desaparece el botón pulsado', async ({ page }) => {
  await startReport(page, 'anonymous');
  await continueTo(page, 'facts');
  await fillFacts(page);
  const municipality = page.getByTestId('municipality-select');
  if (await municipality.isVisible()) await municipality.selectOption({ index: 1 });

  // Caracteres invisibles: el aviso desaparece y el foco vuelve a la descripción.
  await page.getByTestId('description-input').press('End');
  await page.keyboard.insertText(readFileSync(fixturePath(FIXTURE_FILES.invisibleText), 'utf8'));
  await page.getByTestId('strip-invisible').click();
  await expect(page.getByTestId('invisible-characters-alert')).toBeHidden();
  await expect(page.getByTestId('description-input')).toBeFocused();
  await expectFocusVisible(page, 'eliminar caracteres invisibles');

  // Pruebas: archivo rechazado, limpiar foto, quitar PDF.
  await continueTo(page, 'evidence');
  const evidenceInput = page.getByTestId('evidence-input');
  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.docx));
  await page.getByTestId('dismiss-rejected').click();
  await expect(page.getByTestId('rejected-file')).toHaveCount(0);
  await expect(evidenceInput).toBeFocused();
  await expectFocusVisible(page, '«Entendido» en un archivo rechazado');

  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.photo));
  const photo = page.getByTestId('evidence-item').filter({ hasText: FIXTURE_FILES.photo });
  await expect(photo.getByTestId('metadata-panel')).toBeVisible();
  await expect(photo.getByRole('heading', { level: 4, name: 'Esta foto revela:' })).toBeVisible();
  await photo.getByTestId('clean-evidence').click();
  await expect(photo).toHaveAttribute('data-status', 'clean');
  await expectFocusVisible(page, '«Limpiar foto»');
  await expect(photo.getByRole('heading', { level: 3 })).toBeFocused();

  await evidenceInput.setInputFiles(fixturePath(FIXTURE_FILES.pdf));
  const pdf = page.getByTestId('evidence-item').filter({ hasText: FIXTURE_FILES.pdf });
  await expect(pdf).toHaveAttribute('data-status', 'needs-cleaning');
  await pdf.getByTestId('remove-evidence').click();
  await expect(pdf).toHaveCount(0);
  await expectFocusVisible(page, '«Quitar» una prueba');

  // Semáforo: quitar el municipio enfoca el título del riesgo.
  await continueTo(page, 'review');
  const removeMunicipality = page.getByTestId('risk-action-remove-municipality');
  if (await removeMunicipality.isVisible()) {
    await removeMunicipality.click();
    await expect(page.locator('#risk-title')).toBeFocused();
    await expectFocusVisible(page, 'una acción del semáforo');
  }

  // Envío: el botón conserva el foco y después el foco va al encabezado del resultado.
  await continueTo(page, 'submit');
  await page.getByTestId('submit-report').click();
  const resultTitle = page.locator('#submit-result-title');
  await expect(resultTitle).toBeFocused({ timeout: 20_000 });
  await expect(resultTitle).toHaveText('Tu denuncia fue recibida');
  await expectFocusVisible(page, 'enviar la denuncia');

  // El menú interno avisa antes de salir mientras el recibo no está confirmado.
  await page.locator('.site-nav__menu summary').click();
  await page.locator('.site-nav__menu').getByRole('link', { name: 'Inicio' }).click();
  const dialog = page.getByTestId('leave-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Quedarme aquí' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Quedarme aquí' }).click();
  await expect(dialog).toBeHidden();
  await expectStep(page, 'submit');

  // Confirmación con una palabra equivocada: el foco va a la primera casilla incorrecta.
  const { words } = await readReceipt(page);
  const form = page.getByTestId('receipt-confirmation');
  await page.getByTestId('confirm-receipt').click();
  await expect(form.locator('#confirm-word-0')).toBeFocused();
  await expect(form).toContainText(/La palabra número \d no coincide/u);
  await expectFocusVisible(page, 'confirmar con palabras vacías');

  // Basta con las primeras 4 letras.
  const inputs = form.locator('[data-testid^="confirm-word-"]');
  for (const input of await inputs.all()) {
    const position = Number(
      (await input.getAttribute('data-testid'))?.replace('confirm-word-', ''),
    );
    await input.fill((words[position - 1] ?? '').slice(0, 4));
  }
  await page.getByTestId('confirm-receipt').click();
  await expect(page.getByTestId('submit-done')).toBeVisible();
  await expect(resultTitle).toBeFocused();
  await expectFocusVisible(page, 'confirmar el recibo');
});

test('elegir una opción de palabra en el seguimiento deja el foco en su casilla', async ({
  page,
}) => {
  await page.goto('/seguimiento');
  const first = page.getByTestId('receipt-word-1');
  await first.fill('ab');
  const options = page.getByRole('group', { name: 'Opciones para la palabra 1' });
  await expect(options).toBeVisible();
  await options.getByRole('button').first().click();
  await expect(options).toBeHidden();
  await expect(first).toBeFocused();
  await expectFocusVisible(page, 'elegir una opción de palabra');

  // El resumen de errores recibe el foco y lleva al folio.
  await page.getByTestId('tracking-submit').click();
  await expect(page.getByTestId('error-summary')).toBeFocused();
  await page.getByTestId('error-summary').getByRole('link').first().click();
  await expect(page.getByTestId('tracking-folio')).toBeFocused();
  await expectFocusVisible(page, 'ir al folio desde el resumen');
});

test('al cambiar de ruta el foco va al h1 de la pantalla nueva', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('cta-tracking').click();
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await expectFocusVisible(page, 'cambiar de ruta');
});
