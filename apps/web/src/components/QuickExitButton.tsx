// Botón "Salida rápida": borra todo lo que hay en memoria y sale a una página neutra.
import { quickExit } from '../state/quick-exit.ts';

/** Botón visible en el encabezado de todas las páginas. */
export function QuickExitButton() {
  return (
    <button
      type="button"
      className="button quick-exit"
      onClick={quickExit}
      data-testid="quick-exit"
      aria-describedby="quick-exit-hint"
    >
      Salida rápida
      <span id="quick-exit-hint" className="visually-hidden">
        Borra lo que escribiste y abre una página de clima.
      </span>
    </button>
  );
}
