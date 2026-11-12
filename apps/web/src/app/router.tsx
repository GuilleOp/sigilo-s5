// Rutas de la aplicación. Las pantallas pesadas se cargan bajo demanda. Cada perfil de la web
// (`completo`, `ventanilla` o `panel`) sirve sus pantallas y, en las demás, un aviso de dónde están.
// Seguridad: el enrutador vive en memoria, así que navegar dentro del sitio no agrega entradas al
// historial del navegador (ni rutas ni títulos que delaten qué pantallas se visitaron).
import { createMemoryRouter } from 'react-router';
import type { RouteObject } from 'react-router';
import type { ComponentType } from 'react';
import { WEB_PROFILE } from '../config/app-config.ts';
import type { WebProfile } from '../config/app-config.ts';
import { HomePage } from '../pages/home/HomePage.tsx';
import { NotFoundPage } from '../pages/not-found/NotFoundPage.tsx';
import { PanelNoticePage, VentanillaNoticePage } from '../pages/profile/ProfileNotices.tsx';
import { Layout } from './Layout.tsx';
import { PATHS } from './paths.ts';
import { routeAvailability } from './profile.ts';

type LazyScreen = () => Promise<ComponentType>;

/** Pantallas que se cargan bajo demanda, por ruta. */
const SCREENS: readonly (readonly [string, LazyScreen])[] = [
  [PATHS.report, async () => (await import('../pages/report/ReportPage.tsx')).ReportPage],
  [PATHS.tracking, async () => (await import('../pages/tracking/TrackingPage.tsx')).TrackingPage],
  [
    PATHS.authority,
    async () => (await import('../pages/authority/AuthorityPage.tsx')).AuthorityPage,
  ],
  [PATHS.openData, async () => (await import('../pages/open-data/OpenDataPage.tsx')).OpenDataPage],
  [
    PATHS.observatory,
    async () => (await import('../pages/observatory/ObservatoryPage.tsx')).ObservatoryPage,
  ],
  [
    PATHS.protection,
    async () => (await import('../pages/protection/ProtectionPage.tsx')).ProtectionPage,
  ],
  [
    PATHS.registration,
    async () => (await import('../pages/registration/RegistrationPage.tsx')).RegistrationPage,
  ],
  [
    PATHS.whoHandles,
    async () => (await import('../pages/who-handles/WhoHandlesPage.tsx')).WhoHandlesPage,
  ],
  [PATHS.verify, async () => (await import('../pages/verify/VerifyPage.tsx')).VerifyPage],
];

/** Ruta del perfil: la pantalla o el aviso que corresponda. */
function screenRoute(profile: WebProfile, path: string, load: LazyScreen): RouteObject {
  const availability = routeAvailability(profile, path);
  if (availability === 'ventanilla-notice') return { path, Component: VentanillaNoticePage };
  if (availability === 'panel-notice') return { path, Component: PanelNoticePage };
  return { path, lazy: async () => ({ Component: await load() }) };
}

/**
 * Crea el enrutador en memoria que empieza en `initialPath` (por ejemplo, un enlace directo), con
 * las pantallas del perfil indicado (por omisión, el del despliegue).
 */
export function createAppRouter(
  initialPath: string = PATHS.home,
  profile: WebProfile = WEB_PROFILE,
) {
  const isPanel = routeAvailability(profile, PATHS.home) === 'ventanilla-notice';
  return createMemoryRouter(
    [
      {
        path: PATHS.home,
        Component: Layout,
        children: [
          { index: true, Component: isPanel ? VentanillaNoticePage : HomePage },
          ...SCREENS.map(([path, load]) => screenRoute(profile, path, load)),
          { path: '*', Component: isPanel ? VentanillaNoticePage : NotFoundPage },
        ],
      },
    ],
    { initialEntries: [initialPath] },
  );
}
