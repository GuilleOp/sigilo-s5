// Configuración de Playwright: levanta el servidor con datos temporales y `vite preview` de la web
// ya construida (con la CSP estricta real) y ejecuta los flujos de `e2e/` en Chromium.
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import {
  API_ORIGIN,
  AUTHORITY_TOKEN,
  clockFilePath,
  ensureWorkspace,
  REPO_ROOT,
  WEB_ORIGIN,
} from './e2e/support/environment.ts';

const workspace = ensureWorkspace();

export default defineConfig({
  testDir: 'e2e',
  // Las pruebas comparten un servidor con estado (bitácora, límites de intentos): una a la vez.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/support/global-setup.ts',
  globalTeardown: './e2e/support/global-teardown.ts',
  use: {
    baseURL: WEB_ORIGIN,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node apps/server/src/main.ts',
      cwd: REPO_ROOT,
      url: `${API_ORIGIN}/api/v1/keys`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        SIGILO_DATA_DIR: join(workspace, 'data'),
        SIGILO_AUTHORITY_TOKEN: AUTHORITY_TOKEN,
        // Vacío desactiva CORS: la web y la API comparten origen a través del proxy.
        SIGILO_ALLOWED_ORIGIN: '',
        // Reloj de solo pruebas: la bitácora y los datos abiertos publican solo días y meses
        // anteriores, así que las pruebas adelantan el reloj del servidor (ver e2e/support/clock.ts).
        // El servidor solo lo acepta en un entorno de pruebas declarado (SIGILO_E2E=1).
        SIGILO_E2E: '1',
        SIGILO_TEST_CLOCK_FILE: clockFilePath(workspace),
        // Dificultad baja pero real: la web la resuelve en su Web Worker en cada envío.
        SIGILO_POW_BITS: '8',
      },
    },
    {
      command: 'npx vite preview --strictPort',
      cwd: join(REPO_ROOT, 'apps/web'),
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
