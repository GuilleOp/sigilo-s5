// Gestión del foco cuando el control pulsado desaparece: se mueve a un destino estable para que
// el teclado y los lectores de pantalla no regresen al inicio de la página.
import { useCallback, useEffect, useRef } from 'react';

/** Destino del foco: un identificador del DOM o una función que devuelve el elemento. */
export type FocusTarget = string | (() => HTMLElement | null);

/** Frames de espera (alrededor de un segundo) por si el destino tarda en aparecer. */
const MAX_FRAMES = 60;

function resolve(target: FocusTarget): HTMLElement | null {
  return typeof target === 'string' ? document.getElementById(target) : target();
}

/**
 * Elemento que debe quedar visible al enfocar un campo: la `legend` si pertenece a un grupo
 * marcado con `data-group-field` (periodo, modo), si no su `label`, y si no el propio elemento.
 */
export function scrollAnchorFor(element: HTMLElement): HTMLElement {
  const legend = element.closest('fieldset[data-group-field]')?.querySelector('legend');
  if (legend instanceof HTMLElement) return legend;
  const label = element.id === '' ? null : document.querySelector(`label[for="${element.id}"]`);
  return label instanceof HTMLElement ? label : element;
}

/** Borde inferior de la barra fija (0 si no es fija). */
function stickyHeaderBottom(): number {
  const header = document.querySelector('.site-header');
  if (header === null || getComputedStyle(header).position !== 'sticky') return 0;
  return header.getBoundingClientRect().bottom;
}

/**
 * Enfoca el elemento. Si no es enfocable por sí mismo (un encabezado, por ejemplo) se le agrega
 * `tabIndex = -1`. Si su borde superior queda tapado por la barra fija o fuera de la pantalla,
 * desplaza su etiqueta (o el elemento) al inicio de la vista; `scroll-margin-top` deja libre la
 * barra. El navegador, por sí solo, no desplaza un campo alto que ya se ve en parte.
 */
export function focusElement(element: HTMLElement): void {
  if (element.tabIndex < 0 && !element.hasAttribute('tabindex')) element.tabIndex = -1;
  element.focus({ preventScroll: true });
  const top = element.getBoundingClientRect().top;
  if (top < stickyHeaderBottom() || top > window.innerHeight - 40) {
    scrollAnchorFor(element).scrollIntoView({ block: 'start' });
  }
}

/**
 * Enfoca el destino después de que React pinte el cambio. Reintenta unos frames por si el
 * destino aparece un poco después (por ejemplo, tras cambiar de paso). Devuelve una función para
 * cancelar.
 */
export function focusAfterRender(target: FocusTarget): () => void {
  let frame = 0;
  let handle = 0;
  const attempt = (): void => {
    const element = resolve(target);
    if (element !== null) {
      focusElement(element);
      return;
    }
    frame += 1;
    if (frame < MAX_FRAMES) handle = requestAnimationFrame(attempt);
  };
  handle = requestAnimationFrame(attempt);
  return () => cancelAnimationFrame(handle);
}

/** Hook con `focusAfterRender` que se cancela si el componente se desmonta. */
export function useFocusAfter(): (target: FocusTarget) => void {
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  return useCallback((target: FocusTarget) => {
    cancel.current?.();
    cancel.current = focusAfterRender(target);
  }, []);
}
