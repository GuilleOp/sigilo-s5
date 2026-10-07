// Rutas de la aplicación. Las pantallas pesadas se cargan bajo demanda.
import { createBrowserRouter } from 'react-router';
import { HomePage } from '../pages/home/HomePage.tsx';
import { NotFoundPage } from '../pages/not-found/NotFoundPage.tsx';
import { Layout } from './Layout.tsx';
import { PATHS } from './paths.ts';

/** Crea el enrutador del navegador. */
export function createAppRouter() {
  return createBrowserRouter([
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
  ]);
}
