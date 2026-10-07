// Configuración de Vite para la aplicación web: React, proxy de la API y CSP de desarrollo.
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Servidor de la API en desarrollo; el proxy lo vuelve del mismo origen. */
const API_TARGET = 'http://127.0.0.1:8787';

const API_PROXY = {
  '/api': { target: API_TARGET, changeOrigin: false, secure: true },
};

/**
 * Seguridad: la CSP de `index.html` es la de producción. El servidor de desarrollo de Vite inyecta
 * scripts y estilos en línea (refresco en caliente), así que solo en `vite dev` se relaja.
 * El build conserva la CSP estricta sin cambios.
 */
function developmentCsp(): Plugin {
  return {
    name: 'sigilo-development-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws: wss:");
    },
  };
}

export default defineConfig({
  plugins: [react(), developmentCsp()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: API_PROXY },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: API_PROXY },
  build: {
    target: 'es2023',
    sourcemap: false,
    // Seguridad: nada se incrusta como data: (en particular el worker de pdf.js, que debe ser un
    // archivo del mismo origen).
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
});
