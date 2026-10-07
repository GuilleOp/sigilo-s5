// Resumen de errores al intentar avanzar: enlaza a cada campo y recibe el foco.
import { useEffect, useRef } from 'react';
import type { FieldErrors } from '../state/report-validation.ts';

interface ErrorSummaryProps {
  errors: FieldErrors;
  /** Identificador del campo en el DOM para cada clave de error. */
  fieldIds?: Readonly<Record<string, string>>;
  /** Cambia en cada intento para volver a enfocar el resumen. */
  attempt: number;
}

/** Lista de errores con enlaces a los campos. */
export function ErrorSummary({ errors, fieldIds = {}, attempt }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const entries = Object.entries(errors);
  const hasErrors = entries.length > 0;

  useEffect(() => {
    if (attempt > 0 && hasErrors) ref.current?.focus();
  }, [attempt, hasErrors]);

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
        {entries.map(([field, message]) => (
          <li key={field}>
            <a href={`#${fieldIds[field] ?? field}`}>{message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
