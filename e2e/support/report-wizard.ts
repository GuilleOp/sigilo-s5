// Ayudantes del asistente de denuncia: llenado con datos sintéticos, avance entre pasos y captura
// del recibo de 8 palabras con su confirmación.
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';
import { fixturesDir } from './environment.ts';
import type { FIXTURE_FILES } from './synthetic-files.ts';

/** Identificador de cada paso del asistente. */
export type WizardStep = 'mode' | 'facts' | 'evidence' | 'review' | 'submit';

/** Hechos sintéticos (caso ficticio de la demostración). */
export interface SyntheticFacts {
  accused: string;
  description: string;
}

/** Hechos por omisión: no identifican a nadie y no disparan el revisor de texto. */
export const NEUTRAL_FACTS: SyntheticFacts = {
  accused: 'La persona titular de la Dirección de Obras de Villa Ejemplo',
  description:
    'Se adjudicó de forma directa la pavimentación de calles a una empresa sin experiencia previa, ' +
    'sin publicar convocatoria y con un precio superior al de mercado.',
};

/** Recibo entregado al enviar. */
export interface Receipt {
  folio: string;
  words: string[];
}

/** Ruta de un archivo sintético generado por el `globalSetup`. */
export function fixturePath(name: (typeof FIXTURE_FILES)[keyof typeof FIXTURE_FILES]): string {
  return join(fixturesDir(), name);
}

/** Espera a que el asistente muestre el paso indicado. */
export async function expectStep(page: Page, step: WizardStep): Promise<void> {
  await expect(page.getByTestId(`step-${step}`)).toBeVisible();
}

/** Pulsa "Continuar" y espera el paso siguiente. */
export async function continueTo(page: Page, step: WizardStep): Promise<void> {
  await page.getByTestId('step-next').click();
  await expectStep(page, step);
}

/** Abre el asistente y elige el modo; en modo sellado escribe el nombre sintético. */
export async function startReport(
  page: Page,
  mode: 'anonymous' | 'sealed',
  fullName?: string,
): Promise<void> {
  await page.goto('/denunciar');
  await expectStep(page, 'mode');
  await page.getByTestId(`mode-${mode}`).check();
  if (mode === 'sealed') {
    if (fullName === undefined) throw new Error('El modo sellado requiere un nombre sintético.');
    await page.getByTestId('identity-name').fill(fullName);
  }
}

/** Llena el paso de hechos con catálogos válidos y el texto indicado. */
export async function fillFacts(page: Page, facts: SyntheticFacts = NEUTRAL_FACTS): Promise<void> {
  await expectStep(page, 'facts');
  await page.getByTestId('state-select').selectOption('22');
  await page.getByTestId('entity-select').selectOption({ index: 1 });
  await page.getByTestId('offense-select').selectOption({ index: 1 });
  await page.getByTestId('period-month').selectOption('01');
  await page.getByTestId('period-year').selectOption(String(new Date().getFullYear()));
  await page.getByTestId('accused-input').fill(facts.accused);
  await page.getByTestId('description-input').fill(facts.description);
}

/** Recorre el asistente sin pruebas hasta el paso de envío. */
export async function reachSubmitStep(
  page: Page,
  mode: 'anonymous' | 'sealed',
  fullName?: string,
): Promise<void> {
  await startReport(page, mode, fullName);
  await continueTo(page, 'facts');
  await fillFacts(page);
  await continueTo(page, 'evidence');
  await continueTo(page, 'review');
  await continueTo(page, 'submit');
}

/** Lee el folio y las 8 palabras del recibo (las muestra con el botón correspondiente). */
export async function readReceipt(page: Page): Promise<Receipt> {
  const card = page.getByTestId('receipt-card');
  await expect(card).toBeVisible();
  const folio = (await card.getByTestId('receipt-folio').innerText()).trim();
  await card.getByTestId('toggle-receipt').click();
  const items = card.getByTestId('receipt-words').getByRole('listitem');
  await expect(items).toHaveCount(8);
  // Cada elemento es «N. palabra»: se quita la numeración.
  const words = (await items.allInnerTexts()).map((text) => text.replace(/^\d+\.\s*/u, '').trim());
  return { folio, words };
}

/** Escribe las dos palabras que pide la confirmación del recibo y la completa. */
export async function confirmReceipt(page: Page, words: readonly string[]): Promise<void> {
  const form = page.getByTestId('receipt-confirmation');
  const inputs = form.locator('[data-testid^="confirm-word-"]');
  await expect(inputs).toHaveCount(2);
  for (const input of await inputs.all()) {
    const testId = (await input.getAttribute('data-testid')) ?? '';
    const position = Number(testId.replace('confirm-word-', ''));
    await input.fill(words[position - 1] ?? '');
  }
  await form.getByTestId('confirm-receipt').click();
  await expect(page.getByTestId('submit-done')).toBeVisible();
}

/** Envía la denuncia desde el paso de envío, captura el recibo y lo confirma. */
export async function submitAndKeepReceipt(page: Page): Promise<Receipt> {
  await page.getByTestId('submit-report').click();
  await expect(page.getByTestId('submit-success')).toBeVisible({ timeout: 20_000 });
  const receipt = await readReceipt(page);
  await confirmReceipt(page, receipt.words);
  return receipt;
}
