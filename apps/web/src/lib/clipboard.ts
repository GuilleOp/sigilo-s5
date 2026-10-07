// Copia al portapapeles con borrado posterior cuando el navegador lo permite.

/**
 * Copia el texto y programa vaciar el portapapeles a los `seconds` segundos.
 * Seguridad: solo se vacía si sigue conteniendo nuestro texto (cuando se puede leer); si el
 * navegador no lo permite, se intenta escribir una cadena vacía. Devuelve una función para cancelar.
 */
export async function copyWithAutoClear(
  text: string,
  seconds: number,
  clipboard: Clipboard | undefined = globalThis.navigator?.clipboard,
): Promise<() => void> {
  if (clipboard === undefined) throw new Error('Tu navegador no permite copiar automáticamente.');
  await clipboard.writeText(text);
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const current = await clipboard.readText().catch(() => text);
        if (current === text) await clipboard.writeText('');
      } catch {
        // El navegador puede negar el acceso si la pestaña no tiene el foco.
      }
    })();
  }, seconds * 1000);
  return () => clearTimeout(timer);
}
