// Sin terceros: cada pantalla carga y funciona solo con peticiones a 127.0.0.1 o localhost.
// El vigilante automático de `support/fixtures.ts` hace fallar la prueba ante cualquier otra.
import { expect, test } from './support/fixtures.ts';

const SCREENS = [
  { path: '/', ready: 'cta-report' },
  { path: '/denunciar', ready: 'step-mode' },
  { path: '/seguimiento', ready: 'tracking-login' },
  { path: '/autoridad', ready: 'authority-login' },
  { path: '/datos-abiertos', ready: 'suppressed-count' },
  { path: '/verificar', ready: 'verify-ledger' },
] as const;

for (const screen of SCREENS) {
  test(`la pantalla ${screen.path} no hace peticiones a terceros`, async ({
    page,
    externalRequests,
  }) => {
    const localRequests: string[] = [];
    page.on('request', (request) => localRequests.push(request.url()));
    await page.goto(screen.path);
    await expect(page.getByTestId(screen.ready)).toBeVisible();
    await page.waitForLoadState('networkidle');
    // Control: el vigilante sí ve el tráfico propio de la aplicación.
    expect(localRequests.length).toBeGreaterThan(0);
    expect(externalRequests).toEqual([]);
  });
}

test('la verificación de la bitácora y una ruta inexistente tampoco salen a terceros', async ({
  page,
  externalRequests,
}) => {
  await page.goto('/verificar');
  await page.getByTestId('verify-ledger').click();
  await expect(page.getByTestId('ledger-valid')).toBeVisible();
  await page.goto('/ruta-que-no-existe');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(externalRequests).toEqual([]);
});
