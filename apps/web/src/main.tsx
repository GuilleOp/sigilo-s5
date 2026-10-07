// Punto de entrada: estilos propios, enrutador, limpieza para la salida rápida y su atajo de
// teclado (Esc dos veces).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { createAppRouter } from './app/router.tsx';
import { onQuickExit, quickExit } from './state/quick-exit.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Falta el contenedor de la aplicación.');

// Seguridad: la ruta de entrada (un enlace directo, por ejemplo /seguimiento) solo decide la
// pantalla inicial. Después la entrada del historial se reemplaza por la raíz y el enrutador vive
// en memoria, así que el historial no conserva qué pantallas se visitaron.
const initialPath = location.pathname;
history.replaceState(null, '', '/');

const root = createRoot(container);
root.render(
  <StrictMode>
    <RouterProvider router={createAppRouter(initialPath)} />
  </StrictMode>,
);

// Seguridad: la salida rápida desmonta la aplicación y vacía el DOM antes de navegar.
onQuickExit(() => {
  root.unmount();
  container.replaceChildren();
});

// Seguridad: si el navegador restaura esta página desde la caché de retroceso, se recarga vacía.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});

/** Tiempo máximo entre las dos pulsaciones de Esc para activar la salida rápida. */
const DOUBLE_ESCAPE_MS = 1000;
let lastEscapeAt = Number.NEGATIVE_INFINITY;

// Atajo: Esc dos veces en menos de un segundo hace la salida rápida desde cualquier pantalla.
// Se escucha en la fase de captura para que ningún componente lo pueda detener.
window.addEventListener(
  'keydown',
  (event) => {
    if (event.key !== 'Escape' || event.repeat) return;
    const now = performance.now();
    if (now - lastEscapeAt < DOUBLE_ESCAPE_MS) quickExit();
    lastEscapeAt = now;
  },
  { capture: true },
);
