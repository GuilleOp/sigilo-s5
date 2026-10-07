// Área de texto con revisor de reidentificación, detección de caracteres invisibles y contador.
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { announce } from '../lib/announce.ts';
import { TextAreaField } from './Field.tsx';
import { InvisibleCharactersAlert } from './InvisibleCharactersAlert.tsx';
import { TextReviewPanel } from './TextReviewPanel.tsx';

interface ReviewedTextAreaProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  /** Mínimo de caracteres (sin espacios al inicio y al final) que pide la validación. */
  minLength?: number;
  maxLength?: number;
  rows?: number;
  required?: boolean;
}

/** Caracteres restantes a partir de los cuales se avisa que se acerca el máximo. */
const NEAR_LIMIT = 200;

function countText(length: number, minLength?: number, maxLength?: number): string {
  if (minLength !== undefined && length < minLength) {
    return `Llevas ${length} caracteres. Necesitas por lo menos ${minLength}.`;
  }
  if (maxLength !== undefined) {
    const left = maxLength - length;
    return left <= NEAR_LIMIT
      ? `Llevas ${length} caracteres. Te quedan ${left}.`
      : `Llevas ${length} caracteres. El máximo es ${maxLength.toLocaleString('es-MX')}.`;
  }
  return `Llevas ${length} caracteres.`;
}

/**
 * Anuncia solo los momentos útiles: al alcanzar el mínimo y al acercarse al máximo. Anunciar
 * cada tecla sería imposible de escuchar.
 */
function useCountAnnouncements(length: number, minLength?: number, maxLength?: number): void {
  const previous = useRef(length);
  useEffect(() => {
    const before = previous.current;
    previous.current = length;
    if (minLength !== undefined && before < minLength && length >= minLength) {
      announce('Ya escribiste lo necesario. Puedes seguir si quieres contar más.');
    }
    if (maxLength !== undefined) {
      const threshold = maxLength - NEAR_LIMIT;
      if (before < threshold && length >= threshold) {
        announce(`Te quedan ${maxLength - length} caracteres.`);
      }
      if (before < maxLength && length >= maxLength) announce('Llegaste al máximo de caracteres.');
    }
  }, [length, minLength, maxLength]);
}

/** Campo de texto libre que se revisa mientras se escribe. */
export function ReviewedTextArea({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  minLength,
  maxLength,
  rows = 8,
  required,
}: ReviewedTextAreaProps) {
  const length = value.trim().length;
  useCountAnnouncements(length, minLength, maxLength);
  return (
    <>
      <TextAreaField
        id={id}
        label={label}
        hint={hint}
        error={error}
        value={value}
        rows={rows}
        maxLength={maxLength}
        required={required}
        data-testid={`${id}-input`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="field__hint char-count" data-testid={`${id}-count`}>
        {countText(length, minLength, maxLength)}
      </p>
      <InvisibleCharactersAlert text={value} onChange={onChange} fieldLabel={label} fieldId={id} />
      <TextReviewPanel text={value} textareaId={id} idPrefix={id} />
    </>
  );
}
