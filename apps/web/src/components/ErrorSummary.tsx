// Resumen de errores al intentar avanzar: enlaza a cada campo y recibe el foco.
import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { scrollAnchorFor } from '../lib/focus.ts';
import type { FieldErrors } from '../state/report-validation.ts';

interface ErrorSummaryProps {
  errors: FieldErrors;
  /** Identificador del campo en el DOM para cada clave de error. */
  fieldIds?: Readonly<Record<string, string>>;
  /** Cambia en cada intento para volver a enfocar el resumen. */
  attempt: number;
}

/**
 * Lleva el foco al campo y deja visible su etiqueta o leyenda (debajo de la barra fija, por
 * `scroll-margin-top`). Sin esto, el navegador solo desplaza al campo y la etiqueta queda oculta.
 */
export function focusField(id: string): boolean {
  const field = document.getElementById(id);
  if (field === null) return false;
  scrollAnchorFor(field).scrollIntoView({ block: 'start' });
  field.focus({ preventScroll: true });
  return true;
}

/** Lista de errores con enlaces a los campos. */
export function ErrorSummary({ errors, fieldIds = {}, attempt }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const focusedAttempt = useRef(0);
  const entries = Object.entries(errors);
  const hasErrors = entries.length > 0;

  // Solo se enfoca una vez por intento: si la persona corrige y vuelve a fallar mientras escribe,
  // el foco no se le quita del campo.
  useEffect(() => {
    if (attempt > 0 && hasErrors && focusedAttempt.current !== attempt) {
      focusedAttempt.current = attempt;
      ref.current?.focus();
    }
  }, [attempt, hasErrors]);

  /** Seguridad: no se sigue el enlace `#campo` para no agregar entradas al historial. */
  function goToField(event: MouseEvent<HTMLAnchorElement>, id: string): void {
    event.preventDefault();
    focusField(id);
  }

  if (!hasErrors) return null;
  return (
    <div
      className="alert alert--danger"
      role="alert"
      tabIndex={-1}
      ref={ref}
      data-testid="error-summary"
    >
      <p className="alert__title">Revisa {entries.length === 1 ? 'este dato' : 'estos datos'}:</p>
      <ul>
        {entries.map(([field, message]) => {
          const id = fieldIds[field] ?? field;
          return (
            <li key={field}>
              <a href={`#${id}`} onClick={(event) => goToField(event, id)}>
                {message}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
