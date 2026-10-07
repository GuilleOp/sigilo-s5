// Estructura común: salto al contenido, encabezado con salida rápida, navegación y pie.
import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { QuickExitButton } from '../components/QuickExitButton.tsx';
import { SHOW_DEMO_NOTICE } from '../config/app-config.ts';
import { PATHS } from './paths.ts';

const NAV_ITEMS = [
  { to: PATHS.home, label: 'Inicio' },
  { to: PATHS.report, label: 'Denunciar' },
  { to: PATHS.tracking, label: 'Dar seguimiento' },
  { to: PATHS.openData, label: 'Datos abiertos' },
  { to: PATHS.verify, label: 'Verificar bitácora' },
  { to: PATHS.authority, label: 'Panel de autoridad' },
] as const;

/** Layout de todas las pantallas. Al cambiar de ruta, el foco va al contenido principal. */
export function Layout() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    mainRef.current?.focus();
  }, [location.pathname]);

  const isWide = location.pathname === PATHS.authority || location.pathname === PATHS.openData;

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header no-print">
        {SHOW_DEMO_NOTICE && (
          <p className="demo-notice">Demostración: no envíes denuncias reales.</p>
        )}
        <div className="site-header__bar">
          <NavLink to={PATHS.home} className="site-brand">
            SIGILO
          </NavLink>
          <QuickExitButton />
        </div>
        <nav className="site-nav" aria-label="Principal">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.to === PATHS.home}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="contenido" ref={mainRef} tabIndex={-1} className={isWide ? 'wide' : undefined}>
        <Outlet />
      </main>
      <footer className="site-footer no-print">
        <p>
          SIGILO no usa cookies ni guarda nada en tu navegador. Todo lo que escribes se borra al
          cerrar o recargar la página.
        </p>
      </footer>
    </>
  );
}
