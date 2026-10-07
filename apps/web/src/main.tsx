// Punto de entrada: estilos propios, enrutador y limpieza para la salida rápida.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { createAppRouter } from './app/router.tsx';
import { onQuickExit } from './state/quick-exit.ts';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';

const container = document.getElementById('root');
if (container === null) throw new Error('Falta el contenedor de la aplicación.');

const root = createRoot(container);
root.render(
  <StrictMode>
    <RouterProvider router={createAppRouter()} />
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
