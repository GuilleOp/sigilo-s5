// Confirmación del recibo: la persona escribe dos palabras elegidas al azar.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { matchesWord, pickConfirmationPositions } from '../lib/receipt-confirmation.ts';
import { TextField } from './Field.tsx';

interface ReceiptConfirmationProps {
  words: readonly string[];
  onConfirmed: () => void;
}

/** Formulario de confirmación de dos palabras. */
export function ReceiptConfirmation({ words, onConfirmed }: ReceiptConfirmationProps) {
  const [positions] = useState(() => pickConfirmationPositions(words.length));
  const [typed, setTyped] = useState<[string, string]>(['', '']);
  const [error, setError] = useState('');

  function submit(event: FormEvent): void {
    event.preventDefault();
    const ok = positions.every((position, index) =>
      matchesWord(typed[index] ?? '', words[position] ?? ''),
    );
    if (ok) onConfirmed();
    else setError('Alguna palabra no coincide. Revisa tu recibo e inténtalo de nuevo.');
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="confirm-title"
      data-testid="receipt-confirmation"
    >
      <h2 id="confirm-title">Confirma que anotaste tu recibo</h2>
      <p>Escribe las palabras que se piden. No importan los acentos ni las mayúsculas.</p>
      {positions.map((position, index) => (
        <TextField
          key={position}
          id={`confirm-word-${index}`}
          label={`Palabra número ${position + 1}`}
          value={typed[index]}
          error={
            error && !matchesWord(typed[index] ?? '', words[position] ?? '') ? error : undefined
          }
          data-testid={`confirm-word-${position + 1}`}
          onChange={(event) => {
            const next: [string, string] = [...typed];
            next[index] = event.target.value;
            setTyped(next);
          }}
        />
      ))}
      <button type="submit" className="button" data-testid="confirm-receipt">
        Confirmar
      </button>
    </form>
  );
}
