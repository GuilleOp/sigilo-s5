// Casilla para una palabra del recibo con autocompletado local (completeWord) y sin guardar nada.
// Seguridad: es un campo de texto, no de contraseña, para que el navegador no ofrezca guardarla.
import type { ClipboardEvent } from 'react';
import { PRIVATE_TEXT_ATTRIBUTES } from '../../components/Field.tsx';
import { wordStatus } from '../../lib/receipt-words.ts';

interface ReceiptWordInputProps {
  position: number;
  value: string;
  showErrors: boolean;
  onChange: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
}

/** Una palabra del recibo. */
export function ReceiptWordInput({
  position,
  value,
  showErrors,
  onChange,
  onPaste,
}: ReceiptWordInputProps) {
  const id = `word-${position}`;
  const status = wordStatus(value);
  const isInvalid =
    showErrors &&
    (status.kind === 'empty' || status.kind === 'unknown' || status.kind === 'several');
  const message =
    status.kind === 'unique'
      ? `Palabra reconocida: ${status.word}`
      : status.kind === 'exact'
        ? 'Palabra reconocida.'
        : status.kind === 'unknown'
          ? 'Esta palabra no está en la lista. Revisa tu recibo.'
          : status.kind === 'several'
            ? 'Escribe más letras o elige una opción.'
            : '';
  return (
    <div className="field">
      <label htmlFor={id}>Palabra {position + 1}</label>
      <input
        id={id}
        type="text"
        {...PRIVATE_TEXT_ATTRIBUTES}
        value={value}
        aria-invalid={isInvalid ? true : undefined}
        aria-describedby={`${id}-status`}
        data-testid={`receipt-word-${position + 1}`}
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        onBlur={() => {
          if (status.kind === 'unique') onChange(status.word);
        }}
      />
      <p id={`${id}-status`} className={isInvalid ? 'field__error' : 'field__hint'}>
        {message}
      </p>
      {status.kind === 'several' && (
        <div
          className="actions"
          role="group"
          aria-label={`Opciones para la palabra ${position + 1}`}
        >
          {status.options.map((option) => (
            <button
              key={option}
              type="button"
              className="button button--secondary"
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
