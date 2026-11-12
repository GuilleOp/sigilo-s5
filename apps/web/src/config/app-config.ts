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

/**
 * Perfil de la web, fijado al compilar con `VITE_SIGILO_PERFIL`:
 * - `completo` (por omisión): un solo nodo con todas las pantallas, para pruebas y E2E.
 * - `ventanilla`: la ventanilla única que sirve la SESNA junto al enrutador (pantallas públicas).
 * - `panel`: la web de un nodo estatal o federal; solo el panel de autoridades.
 */
export type WebProfile = 'completo' | 'ventanilla' | 'panel';

/** Lee el perfil; cualquier otro valor es `completo`. */
export function readWebProfile(value: unknown): WebProfile {
  return value === 'ventanilla' || value === 'panel' ? value : 'completo';
}

export const WEB_PROFILE: WebProfile = readWebProfile(import.meta.env.VITE_SIGILO_PERFIL);

/**
 * Origen de la ventanilla única para los enlaces del perfil panel (`VITE_SIGILO_VENTANILLA_URL`),
 * o `null`. Admite http solo en 127.0.0.1 o localhost (la demostración local).
 */
export function readVentanillaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value === '') return null;
  try {
    const url = new URL(value);
    const isLocal = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    // Seguridad: fuera de este equipo, solo https, para no convertir el enlace en uno manipulable.
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const VENTANILLA_URL: string | null = readVentanillaUrl(
  import.meta.env.VITE_SIGILO_VENTANILLA_URL,
);

function readHttpsUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    // Seguridad: solo se admite https para no convertir la salida en un enlace manipulable.
    return new URL(value).protocol === 'https:' ? value : fallback;
  } catch {
    return fallback;
  }
}
