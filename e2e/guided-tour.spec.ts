// Recorrido guiado, como el tutorial de la bandeja del S5 pero a pedido: se abre desde el inicio o
// desde «Accesibilidad», resalta lo que explica, avanza con Siguiente o flechas, Esc lo cierra y el
// foco regresa. En el panel, el recorrido cambia según la función de la cuenta. Todo con axe.
import { seedAnonymousComplaint } from './support/api.ts';
import { expectNoAccessibilityViolations } from './support/accessibility.ts';
import { openAccessibilityMenu } from './support/accessibility-menu.ts';
import { loginAsAuthority } from './support/authority.ts';
import { expect, test } from './support/fixtures.ts';

test('el recorrido de quien denuncia resalta la salida rápida y se cierra con Esc', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('tour-start-home').click();
  const tour = page.getByTestId('guided-tour');
  await expect(tour.getByRole('heading', { name: 'Bienvenida' })).toBeFocused();
  await expect(tour).toContainText('1/7');
  await expectNoAccessibilityViolations(page, 'recorrido: bienvenida');

  await tour.getByTestId('tour-next').click();
  await expect(tour).toContainText('Esc dos veces');
  await expect(page.getByTestId('quick-exit')).toHaveClass(/tour-target/u);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('a11y-toggle')).toHaveClass(/tour-target/u);
  await expect(page.getByTestId('quick-exit')).not.toHaveClass(/tour-target/u);

  await page.keyboard.press('Escape');
  await expect(tour).toHaveCount(0);
  await expect(page.getByTestId('a11y-toggle')).not.toHaveClass(/tour-target/u);
  await expect(page.getByTestId('tour-start-home')).toBeFocused();
  // Nada se guarda para saber si ya se vio: el equipo no delata que se usó SIGILO.
  expect(await page.evaluate(() => window.localStorage.length)).toBe(0);
});

test('desde «Accesibilidad» en otra pantalla, el recorrido lleva al inicio', async ({ page }) => {
  await page.goto('/verificar');
  await openAccessibilityMenu(page);
  await page.getByTestId('a11y-tour').click();
  await expect(page.getByTestId('guided-tour')).toBeVisible();
  await expect(page.getByTestId('promises')).toBeVisible();
  for (let index = 0; index < 6; index += 1) await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('protection-link')).toHaveClass(/tour-target/u);
  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('guided-tour')).toHaveCount(0);
});

test('el panel ofrece el recorrido de la función de la cuenta', async ({ page, request }) => {
  await seedAnonymousComplaint(request);
  await loginAsAuthority(page);
  await expect(page.getByRole('heading', { name: 'Bandeja general de turnado' })).toBeVisible();
  await expect(page.getByTestId('s5-code').first()).toHaveText(/SIN TURNAR|TURNADA/u);
  await page.getByTestId('tour-start-authority').click();
  const tour = page.getByTestId('guided-tour');
  await expect(tour).toContainText('Tu función: recepción y turnado');
  await page.getByTestId('tour-next').click();
  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('complaint-list')).toHaveClass(/tour-target/u);
  await expectNoAccessibilityViolations(page, 'recorrido del panel');
});
