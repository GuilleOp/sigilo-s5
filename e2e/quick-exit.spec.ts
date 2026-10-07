// Salida rápida: borra lo escrito y sale a una página neutra sin dejar la pantalla en el historial.
// La página externa se intercepta con `page.route`, así que nada sale a la red.
import { expect, test } from './support/fixtures.ts';

const EXIT_HOST = 'www.google.com.mx';
const SYNTHETIC_NAME = 'Nombre Ficticio de Prueba';

interface ExitState {
  title: string;
  rootChildren: number;
  hasName: boolean;
}

// La salida rápida navega a un host externo a propósito; aquí se permite porque se intercepta.
test.use({ allowedExternalHosts: [EXIT_HOST] });

test('la salida rápida borra el borrador y navega fuera de la aplicación', async ({ page }) => {
  // Al empezar a salir (`beforeunload`) la página informa qué quedó en el documento.
  let reportState: (state: ExitState) => void = () => undefined;
  const stateAtExit = new Promise<ExitState>((resolve) => {
    reportState = resolve;
  });
  await page.exposeFunction('reportExitState', (state: ExitState) => reportState(state));
  await page.addInitScript((name) => {
    addEventListener('beforeunload', () => {
      const report = (window as unknown as { reportExitState: (state: ExitState) => void })
        .reportExitState;
      report({
        title: document.title,
        rootChildren: document.getElementById('root')?.childElementCount ?? -1,
        hasName: document.documentElement.outerHTML.includes(name),
      });
    });
  }, SYNTHETIC_NAME);

  const attempted: string[] = [];
  await page.route(`https://${EXIT_HOST}/**`, async (route) => {
    attempted.push(route.request().url());
    await route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: '<!doctype html><title>Clima</title><p>Pronóstico simulado.</p>',
    });
  });

  await page.goto('/');
  await page.getByTestId('cta-report').click();
  await page.getByTestId('mode-sealed').check();
  await page.getByTestId('identity-name').fill(SYNTHETIC_NAME);

  await page.getByTestId('quick-exit').click();
  await page.waitForURL(`https://${EXIT_HOST}/**`);

  expect(attempted).toEqual([`https://${EXIT_HOST}/search?q=clima`]);
  expect(await stateAtExit).toEqual({ title: 'Clima', rootChildren: 0, hasName: false });

  // "Atrás" no regresa al formulario: la entrada se reemplazó y la aplicación vuelve vacía.
  await page.goBack();
  await expect(page).toHaveURL('/');
  await page.getByTestId('cta-report').click();
  await expect(page.getByTestId('mode-sealed')).not.toBeChecked();
  await expect(page.getByTestId('identity-name')).toHaveCount(0);
});
