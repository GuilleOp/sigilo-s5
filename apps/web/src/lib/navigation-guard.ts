// Aviso antes de salir de una pantalla con información que no se puede recuperar (el recibo).
// Solo lo consulta el menú interno del Layout; la salida rápida nunca pregunta.

/** Texto del aviso mientras haya algo que se perdería; `null` si se puede salir sin preguntar. */
let activeWarning: string | null = null;

/** Activa el aviso con el texto indicado. Devuelve una función para desactivarlo. */
export function setNavigationWarning(text: string): () => void {
  activeWarning = text;
  return () => {
    if (activeWarning === text) activeWarning = null;
  };
}

/** Aviso activo, si hay. */
export function navigationWarning(): string | null {
  return activeWarning;
}
