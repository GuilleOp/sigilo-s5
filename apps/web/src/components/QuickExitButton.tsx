// Botón "Salida rápida": borra todo lo que hay en memoria y sale a una página neutra.
import { quickExit } from '../state/quick-exit.ts';

/** Texto de ayuda: queda fuera del botón para que su nombre sea corto y claro. */
export const QUICK_EXIT_HINT =
  'Borra lo que escribiste y abre una página del clima. También puedes pulsar dos veces la tecla Esc.';

/** Botón visible en la barra fija de todas las páginas; es el primer control del teclado. */
export function QuickExitButton() {
  return (
    <>
      <button
        type="button"
        className="button quick-exit"
        onClick={quickExit}
        data-testid="quick-exit"
        aria-describedby="quick-exit-hint"
      >
        Salida rápida
      </button>
      <p id="quick-exit-hint" hidden>
        {QUICK_EXIT_HINT}
      </p>
    </>
  );
}
