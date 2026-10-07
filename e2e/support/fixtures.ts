// `test` de Playwright con un vigilante de terceros: toda petición que salga de 127.0.0.1 o
// localhost hace fallar la prueba. Úsese en lugar de `@playwright/test` en todos los archivos.
import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { WEB_ORIGIN } from './environment.ts';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

/** Indica si la URL es local o no viaja por red (blob:, data:, about:). */
function isLocalRequest(url: string, allowedHosts: readonly string[]): boolean {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  return LOCAL_HOSTS.has(parsed.hostname) || allowedHosts.includes(parsed.hostname);
}

interface GuardOptions {
  /** Hosts externos permitidos en una prueba concreta (por ejemplo, la salida rápida simulada). */
  allowedExternalHosts: string[];
}

interface GuardFixtures {
  /** Peticiones a terceros detectadas en la prueba; debe quedar vacío. */
  externalRequests: string[];
  /** Abre una página en un contexto nuevo (otra persona u otro navegador) con el vigilante. */
  openIsolatedPage: () => Promise<Page>;
}

export const test = base.extend<GuardOptions & GuardFixtures>({
  allowedExternalHosts: [[], { option: true }],

  externalRequests: [
    async ({ context, allowedExternalHosts }, use) => {
      const found: string[] = [];
      watchContext(context, allowedExternalHosts, found);
      await use(found);
      expect(found, 'La aplicación no debe hacer peticiones a terceros').toEqual([]);
    },
    { auto: true },
  ],

  openIsolatedPage: async ({ browser, allowedExternalHosts, externalRequests }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({
        baseURL: WEB_ORIGIN,
        locale: 'es-MX',
        timezoneId: 'America/Mexico_City',
      });
      contexts.push(context);
      watchContext(context, allowedExternalHosts, externalRequests);
      return context.newPage();
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

function watchContext(context: BrowserContext, allowedHosts: readonly string[], found: string[]) {
  context.on('request', (request) => {
    if (!isLocalRequest(request.url(), allowedHosts)) found.push(request.url());
  });
}

export { expect };
