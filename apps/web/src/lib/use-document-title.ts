// Título de la pestaña por pantalla o paso (WCAG 2.4.2).
import { useEffect } from 'react';

/** Fija el título del documento con el sufijo del sitio. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} | SIGILO`;
  }, [title]);
}
