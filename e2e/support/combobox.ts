// Elige una opción de un campo de catálogo (escribe o elige en la misma lista).
import type { Page } from '@playwright/test';

/** Abre la lista del campo y pulsa la opción con ese valor, o la primera si no se indica. */
export async function chooseOption(page: Page, testId: string, value?: string): Promise<void> {
  await page.getByTestId(testId).click();
  const options = page.getByTestId(`${testId}-option`);
  const option =
    value === undefined ? options.first() : options.and(page.locator(`[data-value="${value}"]`));
  await option.click();
}
