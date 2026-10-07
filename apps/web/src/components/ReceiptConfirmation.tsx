// Confirmación del recibo: la persona escribe dos palabras elegidas al azar. Basta con las
// primeras 4 letras, igual que en el seguimiento.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { matchesReceiptWord, pickConfirmationPositions } from '../lib/receipt-confirmation.ts';
import { focusAfterRender } from '../lib/focus.ts';
import { TextField } from './Field.tsx';

interface ReceiptConfirmationProps {
  words: readonly string[];
  onConfirmed: () => void;
}

/** Formulario de confirmación de dos palabras. */
export function ReceiptConfirmation({ words, onConfirmed }: ReceiptConfirmationProps) {
  const [positions] = useState(() => pickConfirmationPositions(words.length));
  const [typed, setTyped] = useState<[string, string]>(['', '']);
  const [hasTried, setTried] = useState(false);

  const isCorrect = (index: number): boolean =>
    matchesReceiptWord(typed[index] ?? '', words[positions[index] ?? -1] ?? '');

  function submit(event: FormEvent): void {
    event.preventDefault();
    setTried(true);
    const firstWrong = positions.findIndex((_, index) => !isCorrect(index));
    // Si todo coincide, el formulario desaparece y el paso de envío enfoca su encabezado.
    if (firstWrong === -1) onConfirmed();
    else focusAfterRender(`confirm-word-${firstWrong}`);
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="confirm-title"
      data-testid="receipt-confirmation"
    >
      <h3 id="confirm-title">Confirma que anotaste tu recibo</h3>
      <p>Escribe las palabras que se piden. Todos los datos son necesarios.</p>
      {positions.map((position, index) => (
        <TextField
          key={position}
          id={`confirm-word-${index}`}
          label={`Palabra número ${position + 1}`}
          hint="Basta con las primeras 4 letras. No importan los acentos."
          required
          value={typed[index]}
          error={
            hasTried && !isCorrect(index)
              ? `La palabra número ${position + 1} no coincide. Revisa tu recibo.`
              : undefined
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
