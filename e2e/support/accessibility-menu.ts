// Ayudantes del menú «Accesibilidad» de la barra fija.
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';

/** Abre el menú «Accesibilidad» si está cerrado. */
export async function openAccessibilityMenu(page: Page): Promise<void> {
  const toggle = page.getByTestId('a11y-toggle');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await expect(page.getByTestId('a11y-menu')).toBeVisible();
}

/** Activa «Lectura fácil» desde el menú. */
export async function turnOnEasyReading(page: Page): Promise<void> {
  await openAccessibilityMenu(page);
  const easy = page.getByTestId('usage-isEasyReading');
  if ((await easy.getAttribute('aria-pressed')) !== 'true') await easy.click();
  await expect(easy).toHaveAttribute('aria-pressed', 'true');
}
