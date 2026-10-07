// Configuración de la aplicación que puede ajustarse al compilar con variables `VITE_*`.

/**
 * Página neutra a la que lleva "Salida rápida". Configurable con `VITE_QUICK_EXIT_URL` al
 * compilar; por omisión, una búsqueda del clima.
 */
export const QUICK_EXIT_URL: string = readHttpsUrl(
  import.meta.env.VITE_QUICK_EXIT_URL,
  'https://www.google.com.mx/search?q=clima',
);

/** Muestra el aviso de demostración. Se desactiva con `VITE_DEMO_NOTICE=false`. */
export const SHOW_DEMO_NOTICE: boolean = import.meta.env.VITE_DEMO_NOTICE !== 'false';

/** Segundos tras los cuales se intenta vaciar el portapapeles después de copiar el recibo. */
export const CLIPBOARD_CLEAR_SECONDS = 60;

function readHttpsUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    // Seguridad: solo se admite https para no convertir la salida en un enlace manipulable.
    return new URL(value).protocol === 'https:' ? value : fallback;
  } catch {
    return fallback;
  }
}
