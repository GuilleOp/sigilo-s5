// Estructura común: barra fija mínima con salida rápida, salto al contenido, menú, anunciador
// global, pie y aviso antes de salir de una pantalla con el recibo sin confirmar.
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { LeaveDialog } from '../components/LeaveDialog.tsx';
import { QuickExitButton } from '../components/QuickExitButton.tsx';
import { SHOW_DEMO_NOTICE } from '../config/app-config.ts';
import { ANNOUNCER_ID } from '../lib/announce.ts';
import { focusAfterRender, focusElement } from '../lib/focus.ts';
import { navigationWarning } from '../lib/navigation-guard.ts';
import { PATHS } from './paths.ts';

/** Menú de la persona denunciante. */
const NAV_ITEMS = [
  { to: PATHS.home, label: 'Inicio' },
  { to: PATHS.report, label: 'Denunciar' },
  { to: PATHS.tracking, label: 'Dar seguimiento' },
  { to: PATHS.openData, label: 'Datos abiertos' },
] as const;

/** Enlaces secundarios, en el pie. */
const FOOTER_ITEMS = [
  { to: PATHS.verify, label: 'Verificar bitácora' },
  { to: PATHS.authority, label: 'Panel de autoridad' },
] as const;

/**
 * Lleva el foco al contenido principal sin cambiar la URL, igual que un enlace `#contenido`.
 * Seguridad: el enlace normal agregaría una entrada al historial del navegador.
 */
function skipToContent(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
  const main = document.getElementById('contenido');
  if (main !== null) focusElement(main);
}

/** Layout de todas las pantallas. Al cambiar de ruta, el foco va al `h1` de la pantalla nueva. */
export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const isFirstRender = useRef(true);
  const [pendingLeave, setPendingLeave] = useState<{ to: string; message: string } | null>(null);

  useEffect(() => {
    if (menuRef.current) menuRef.current.open = false;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    return focusAfterRender(
      () =>
        document.querySelector<HTMLElement>('#contenido h1') ??
        document.getElementById('contenido'),
    );
  }, [location.pathname]);

  /** Seguridad: si hay un recibo sin confirmar, el menú pregunta antes de salir. */
  function guardNavigation(event: MouseEvent<HTMLAnchorElement>, to: string): void {
    const message = navigationWarning();
    if (message === null || to === location.pathname) return;
    event.preventDefault();
    setPendingLeave({ to, message });
  }

  function navLink(item: { to: string; label: string }) {
    return (
      <li key={item.to}>
        <NavLink
          to={item.to}
          end={item.to === PATHS.home}
          onClick={(event) => guardNavigation(event, item.to)}
        >
          {item.label}
        </NavLink>
      </li>
    );
  }

  const isWide = location.pathname === PATHS.authority || location.pathname === PATHS.openData;

  return (
    <>
      <header className="site-header no-print">
        <div className="site-header__bar">
          <QuickExitButton />
          <a className="skip-link" href="#contenido" onClick={skipToContent}>
            Saltar al contenido
          </a>
          <NavLink
            to={PATHS.home}
            className="site-brand"
            onClick={(event) => guardNavigation(event, PATHS.home)}
          >
            SIGILO
          </NavLink>
        </div>
      </header>
      {SHOW_DEMO_NOTICE && (
        <p className="demo-notice no-print">Demostración: no envíes denuncias reales.</p>
      )}
      <nav className="site-nav no-print" aria-label="Principal">
        <details className="site-nav__menu" ref={menuRef}>
          <summary>Menú</summary>
          <ul>{NAV_ITEMS.map(navLink)}</ul>
        </details>
        <ul className="site-nav__list">{NAV_ITEMS.map(navLink)}</ul>
      </nav>
      <main id="contenido" tabIndex={-1} className={isWide ? 'wide' : undefined}>
        <Outlet />
      </main>
      <footer className="site-footer no-print">
        <nav aria-label="Otros enlaces">
          <ul>{FOOTER_ITEMS.map(navLink)}</ul>
        </nav>
        <p>
          SIGILO no usa cookies ni guarda nada en tu navegador. Todo lo que escribes se borra al
          cerrar o recargar la página.
        </p>
      </footer>
      {/* Anunciador global: existe desde el inicio para que los lectores lean sus cambios. */}
      <p id={ANNOUNCER_ID} role="status" aria-live="polite" className="visually-hidden" />
      <LeaveDialog
        message={pendingLeave?.message ?? null}
        onStay={() => setPendingLeave(null)}
        onLeave={() => {
          const target = pendingLeave?.to;
          setPendingLeave(null);
          if (target !== undefined) void navigate(target);
        }}
      />
    </>
  );
}
