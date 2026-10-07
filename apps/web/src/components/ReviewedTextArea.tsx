// Área de texto con revisor de reidentificación y detección de caracteres invisibles.
import type { ReactNode } from 'react';
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
  maxLength?: number;
  rows?: number;
}

/** Campo de texto libre que se revisa mientras se escribe. */
export function ReviewedTextArea({
  id,
  label,
  hint,
  error,
  value,
  onChange,
  maxLength,
  rows = 8,
}: ReviewedTextAreaProps) {
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
        data-testid={`${id}-input`}
        onChange={(event) => onChange(event.target.value)}
      />
      <InvisibleCharactersAlert text={value} onChange={onChange} fieldLabel={label} />
      <TextReviewPanel text={value} textareaId={id} idPrefix={id} />
    </>
  );
}
