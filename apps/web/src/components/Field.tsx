// Campos de formulario con etiqueta, ayuda y error asociados mediante aria-describedby, y
// obligatoriedad anunciada con aria-required (los opcionales lo dicen en su etiqueta).
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  children: (describedBy: string | undefined) => ReactNode;
}

/** Envoltorio común: etiqueta visible, ayuda y error. */
export function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {children(ids === '' ? undefined : ids)}
      {error && (
        <p id={`${id}-error`} className="field__error">
          Error: {error}
        </p>
      )}
    </div>
  );
}

/**
 * Atributos para que el navegador no corrija, traduzca ni recuerde lo escrito.
 * Seguridad: el corrector ortográfico de algunos navegadores envía el texto a un servicio externo.
 */
export const PRIVATE_TEXT_ATTRIBUTES = {
  spellCheck: false,
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  translate: 'no',
} as const;

type BaseProps = {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  /**
   * Campo obligatorio: se anuncia con `aria-required`. No se usa `required` nativo para que el
   * navegador no muestre sus propios mensajes; la validación es la del asistente.
   */
  required?: boolean | undefined;
};

/** Campo de texto de una línea. */
export function TextField({
  id,
  label,
  hint,
  error,
  required,
  ...input
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <input
          id={id}
          type="text"
          {...PRIVATE_TEXT_ATTRIBUTES}
          {...input}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
        />
      )}
    </FieldShell>
  );
}

/** Área de texto. */
export function TextAreaField({
  id,
  label,
  hint,
  error,
  required,
  ...textarea
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <textarea
          id={id}
          {...PRIVATE_TEXT_ATTRIBUTES}
          {...textarea}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
        />
      )}
    </FieldShell>
  );
}

/** Lista desplegable. */
export function SelectField({
  id,
  label,
  hint,
  error,
  required,
  children,
  ...select
}: BaseProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      {(describedBy) => (
        <select
          id={id}
          {...select}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required ? true : undefined}
        >
          {children}
        </select>
      )}
    </FieldShell>
  );
}
