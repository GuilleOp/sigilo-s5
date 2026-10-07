// Ayudantes del seguimiento: acceso con folio y 8 palabras.
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';

/** Abre /seguimiento y escribe el folio y las palabras del recibo. */
export async function submitTrackingLogin(
  page: Page,
  folio: string,
  words: readonly string[],
): Promise<void> {
  await page.goto('/seguimiento');
  const form = page.getByTestId('tracking-login');
  await expect(form).toBeVisible();
  await form.getByTestId('tracking-folio').fill(folio);
  for (const [index, word] of words.entries()) {
    await form.getByTestId(`receipt-word-${index + 1}`).fill(word);
  }
  await form.getByTestId('tracking-submit').click();
}

/** Entra al seguimiento y espera la vista con el comprobante verificado. */
export async function openTracking(
  page: Page,
  folio: string,
  words: readonly string[],
): Promise<void> {
  await submitTrackingLogin(page, folio, words);
  await expect(page.getByTestId('tracking-view')).toBeVisible();
}

/** Intenta entrar y devuelve el texto del error mostrado. */
export async function readTrackingError(
  page: Page,
  folio: string,
  words: readonly string[],
): Promise<string> {
  await submitTrackingLogin(page, folio, words);
  const error = page.getByTestId('tracking-error');
  await expect(error).toBeVisible();
  return error.innerText();
}
