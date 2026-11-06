// Menú «Accesibilidad» de la barra fija, como en la versión de pruebas del S5: contador de ajustes,
// alto contraste, tamaño y espaciado del texto en paneles flotantes que se recuerdan (salvo en
// quiosco), lector con voces del equipo, guía de teclado, Esc y celular. Todo con axe.
import type { Page } from '@playwright/test';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { openAccessibilityMenu } from './support/accessibility-menu.ts';
import { expect, test } from './support/fixtures.ts';

const rootFontSize = (page: Page) =>
  page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));

test('el menú cuenta los ajustes, agranda y espacia el texto y lo recuerda al recargar', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('a11y-count')).toHaveCount(0);
  await openAccessibilityMenu(page);
  await expectNoAccessibilityViolations(page, 'menú de accesibilidad');

  await page.getByTestId('a11y-contrast').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  await expect(page.getByTestId('a11y-count')).toContainText('1');

  const before = await rootFontSize(page);
  await page.getByTestId('a11y-open-text').click();
  const textPanel = page.getByTestId('a11y-panel-text');
  await expect(textPanel.getByRole('heading', { name: 'Tamaño del texto' })).toBeFocused();
  await textPanel.getByRole('button', { name: 'Más: tamaño' }).click();
  await textPanel.getByRole('button', { name: 'Más: tamaño' }).click();
  await expect(textPanel.locator('output')).toHaveText('120 %');
  expect(await rootFontSize(page)).toBeCloseTo(before * 1.2, 1);

  await openAccessibilityMenu(page);
  await page.getByTestId('a11y-open-spacing').click();
  const spacing = page.getByTestId('a11y-panel-spacing');
  await spacing.getByRole('button', { name: 'Más: espacio entre líneas' }).click();
  await expect(spacing.locator('output').first()).toHaveText('1.6');
  await expect(page.getByTestId('a11y-count')).toContainText('3');
  await expectNoAccessibilityViolations(page, 'paneles de accesibilidad');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'contrast');
  expect(await rootFontSize(page)).toBeCloseTo(before * 1.2, 1);
  expect(
    await page.evaluate(() => JSON.parse(window.localStorage.getItem('sigilo-lectura') ?? '{}')),
  ).toEqual({ textScale: 120, lineHeight: 1.6, letterSpacing: 0 });

  await openAccessibilityMenu(page);
  await page.getByTestId('a11y-reset-all').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/u);
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test('Esc cierra el menú y regresa el foco; la guía y el lector se abren y se cierran', async ({
  page,
}) => {
  await page.goto('/');
  await openAccessibilityMenu(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('a11y-menu')).toBeHidden();
  await expect(page.getByTestId('a11y-toggle')).toBeFocused();

  await openAccessibilityMenu(page);
  await page.getByTestId('a11y-open-keys').click();
  const keys = page.getByTestId('a11y-panel-keys');
  await expect(keys).toContainText('Esc dos veces');

  await openAccessibilityMenu(page);
  await page.getByTestId('a11y-open-reader').click();
  const reader = page.getByTestId('a11y-panel-reader');
  // Sin voces locales (el navegador de pruebas no tiene), lo explica y no usa voces en línea.
  await expect(reader).toContainText(/voz/u);
  await expectNoAccessibilityViolations(page, 'guía de teclado y lector');

  await reader.getByRole('button', { name: 'Cerrar leer en voz alta' }).click();
  await expect(reader).toHaveCount(0);
  await expect(page.getByTestId('a11y-toggle')).toBeFocused();
});

test('en quiosco no se recuerda nada y en 360 px no hay desplazamiento a lo ancho', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/?modo=quiosco');
  await openAccessibilityMenu(page);
  await page.getByTestId('a11y-open-text').click();
  await page.getByTestId('a11y-panel-text').getByRole('button', { name: 'Más: tamaño' }).click();
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await expectNoAccessibilityViolations(page, 'accesibilidad en celular');
});
