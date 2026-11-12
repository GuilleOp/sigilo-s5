// Punto de entrada: estilos propios, enrutador, limpieza para la salida rápida y su atajo de
// teclado (Esc dos veces).
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { createAppRouter } from './app/router.tsx';
import { initRuntimeConfig } from './config/runtime-config.ts';
import { onQuickExit, quickExit } from './state/quick-exit.ts';
import {
  applyDisplay,
  DEFAULT_DISPLAY,
  readStoredDisplay,
  setInitialDisplay,
} from './state/display-settings.ts';
import { applyTheme, readStoredTheme, setInitialTheme } from './state/theme.ts';
import { modesFromQuery, setInitialModes } from './state/usage-modes.ts';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/features/index.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Falta el contenedor de la aplicación.');

// Seguridad: la ruta de entrada (un enlace directo, por ejemplo /seguimiento) solo decide la
// pantalla inicial. Después la entrada del historial se reemplaza por la raíz y el enrutador vive
// en memoria, así que el historial no conserva qué pantallas se visitaron.
const initialPath = location.pathname;
// Un quiosco o un módulo de atención se configura con `?modo=quiosco` (y otros modos) en su enlace.
const initialModes = modesFromQuery(location.search);
setInitialModes(initialModes);
// El tema se aplica antes de pintar para no parpadear. En quiosco no se lee el de otra persona.
const initialTheme = initialModes.isKiosk ? 'system' : readStoredTheme();
setInitialTheme(initialTheme);
applyTheme(initialTheme, document.documentElement);
// Lo mismo con el tamaño y el espaciado del texto que eligió la persona.
const initialDisplay = initialModes.isKiosk ? DEFAULT_DISPLAY : readStoredDisplay();
setInitialDisplay(initialDisplay);
applyDisplay(initialDisplay, document.documentElement);
history.replaceState(null, '', '/');

// Llaves del nodo, raíz de la red y ventanilla desde `/config/sigilo.json` (ADR 0011), antes de
// montar: ningún módulo las lee al cargarse, solo al pintar o al enviar.
const configStatus = await initRuntimeConfig();

/** Aviso sin la aplicación: una web sin llaves válidas no debe cifrar nada. */
function showConfigurationProblem(target: HTMLElement, status: 'missing' | 'invalid'): void {
  const main = document.createElement('main');
  main.className = 'container';
  const title = document.createElement('h1');
  title.textContent = 'Este sitio no está disponible por ahora';
  const text = document.createElement('p');
  text.textContent =
    status === 'missing'
      ? 'La instalación de este nodo no terminó: falta su configuración. Si operas el nodo, corre ./sigilo iniciar.'
      : 'La configuración de este sitio no es válida, así que no se envía nada desde aquí. Si operas el nodo, corre ./sigilo diagnostico.';
  main.append(title, text);
  target.replaceChildren(main);
}

if (configStatus === 'missing' || configStatus === 'invalid') {
  showConfigurationProblem(container, configStatus);
} else {
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
}

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
