// Caja con desplazamiento horizontal para tablas anchas (WCAG 1.4.10 y 2.1.1): se puede enfocar
// con el teclado para desplazarla, y es una región nombrada por el título (caption) de su tabla.
import type { ReactNode } from 'react';

interface TableScrollProps {
  /** Identificador del `caption` de la tabla, que nombra la región. */
  labelledBy: string;
  children: ReactNode;
}

/** Caja desplazable de una tabla. */
export function TableScroll({ labelledBy, children }: TableScrollProps) {
  return (
    // La región es enfocable para que quien usa teclado pueda desplazar la tabla.
    <div className="table-scroll" role="region" aria-labelledby={labelledBy} tabIndex={0}>
      {children}
    </div>
  );
}
