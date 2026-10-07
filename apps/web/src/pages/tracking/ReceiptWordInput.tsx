// Casilla para una palabra del recibo con autocompletado local (completeWord) y sin guardar nada.
// Seguridad: es un campo de texto, no de contraseña, para que el navegador no ofrezca guardarla.
import type { ClipboardEvent } from 'react';
import { PRIVATE_TEXT_ATTRIBUTES } from '../../components/Field.tsx';
import { focusAfterRender } from '../../lib/focus.ts';
import { wordStatus } from '../../lib/receipt-words.ts';

interface ReceiptWordInputProps {
  position: number;
  value: string;
  showErrors: boolean;
  /** El recibo rechazó esta palabra al intentar entrar. */
  isRejected?: boolean;
  onChange: (value: string) => void;
  onPaste: (event: ClipboardEvent<HTMLInputElement>) => void;
}

/** Identificador de la casilla de una palabra. */
export function wordInputId(position: number): string {
  return `word-${position}`;
}

/** Mensaje de error de una palabra, o `null` si es válida. */
export function wordError(position: number, value: string): string | null {
  const status = wordStatus(value);
  if (status.kind === 'empty') return `Escribe la palabra ${position + 1}.`;
  if (status.kind === 'unknown') return `La palabra ${position + 1} no está en la lista.`;
  if (status.kind === 'several') return `Escribe más letras de la palabra ${position + 1}.`;
  return null;
}

/** Una palabra del recibo. */
export function ReceiptWordInput({
  position,
  value,
  showErrors,
  isRejected = false,
  onChange,
  onPaste,
}: ReceiptWordInputProps) {
  const id = wordInputId(position);
  const status = wordStatus(value);
  const isInvalid =
    isRejected ||
    (showErrors &&
      (status.kind === 'empty' || status.kind === 'unknown' || status.kind === 'several'));
  const message = isRejected
    ? 'Esta palabra no está en la lista. Revisa tu recibo.'
    : status.kind === 'unique'
      ? `Palabra reconocida: ${status.word}`
      : status.kind === 'exact'
        ? 'Palabra reconocida.'
        : status.kind === 'unknown'
          ? 'Esta palabra no está en la lista. Revisa tu recibo.'
          : status.kind === 'several'
            ? 'Escribe más letras o elige una opción.'
            : showErrors
              ? 'Escribe esta palabra.'
              : '';
  return (
    <div className="field">
      <label htmlFor={id}>Palabra {position + 1}</label>
      <input
        id={id}
        type="text"
        {...PRIVATE_TEXT_ATTRIBUTES}
        value={value}
        aria-required="true"
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
              onClick={() => {
                onChange(option);
                // Las opciones desaparecen al elegir: el foco vuelve a la casilla.
                focusAfterRender(id);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
