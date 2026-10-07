// Anunciador global para lectores de pantalla: una sola región `role="status"` que vive en el
// Layout desde el inicio, para que los mensajes cortos sí se lean.

/** Identificador de la región persistente que pinta el Layout. */
export const ANNOUNCER_ID = 'global-announcer';

let pendingFrame: number | null = null;

/**
 * Anuncia un mensaje corto. Vacía la región y escribe el texto en el siguiente frame: así los
 * lectores lo leen aunque sea igual al anterior. Si la región no existe, no hace nada.
 */
export function announce(text: string): void {
  if (typeof document === 'undefined') return;
  const region = document.getElementById(ANNOUNCER_ID);
  if (region === null) return;
  if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
  region.textContent = '';
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = null;
    region.textContent = text;
  });
}
