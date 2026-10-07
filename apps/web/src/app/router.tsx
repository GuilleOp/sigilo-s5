// Rutas de la aplicación. Las pantallas pesadas se cargan bajo demanda.
// Seguridad: el enrutador vive en memoria, así que navegar dentro del sitio no agrega entradas al
// historial del navegador (ni rutas ni títulos que delaten qué pantallas se visitaron).
import { createMemoryRouter } from 'react-router';
import { HomePage } from '../pages/home/HomePage.tsx';
import { NotFoundPage } from '../pages/not-found/NotFoundPage.tsx';
import { Layout } from './Layout.tsx';
import { PATHS } from './paths.ts';

/** Crea el enrutador en memoria que empieza en `initialPath` (por ejemplo, un enlace directo). */
export function createAppRouter(initialPath: string = PATHS.home) {
  return createMemoryRouter(
    [
      {
        path: PATHS.home,
        Component: Layout,
        children: [
          { index: true, Component: HomePage },
          {
            path: PATHS.report,
            lazy: async () => ({
              Component: (await import('../pages/report/ReportPage.tsx')).ReportPage,
            }),
          },
          {
            path: PATHS.tracking,
            lazy: async () => ({
              Component: (await import('../pages/tracking/TrackingPage.tsx')).TrackingPage,
            }),
          },
          {
            path: PATHS.authority,
            lazy: async () => ({
              Component: (await import('../pages/authority/AuthorityPage.tsx')).AuthorityPage,
            }),
          },
          {
            path: PATHS.openData,
            lazy: async () => ({
              Component: (await import('../pages/open-data/OpenDataPage.tsx')).OpenDataPage,
            }),
          },
          {
            path: PATHS.verify,
            lazy: async () => ({
              Component: (await import('../pages/verify/VerifyPage.tsx')).VerifyPage,
            }),
          },
          { path: '*', Component: NotFoundPage },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
}
