// Acceso al seguimiento con folio y 8 palabras. Las llaves se derivan en el navegador.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { RECEIPT_WORD_COUNT } from '@sigilo/core';
import { Alert } from '../../components/Alert.tsx';
import { ErrorSummary } from '../../components/ErrorSummary.tsx';
import { TextField } from '../../components/Field.tsx';
import { isCompleteFolio, normalizeFolioInput } from '../../lib/folio-input.ts';
import { distributePastedWords, resolvedWord } from '../../lib/receipt-words.ts';
import type { FieldErrors } from '../../state/report-validation.ts';
import { ReceiptWordInput, wordError, wordInputId } from './ReceiptWordInput.tsx';

interface TrackingLoginProps {
  isBusy: boolean;
  error: string;
  /** Palabra (desde 1) que el recibo rechazó, para marcar su casilla; `null` si no aplica. */
  invalidWordPosition: number | null;
  onSubmit: (folio: string, words: string[]) => void;
}

/** Errores del formulario, en el orden en que aparecen los campos. */
function loginErrors(folio: string, words: readonly string[]): FieldErrors {
  const errors: FieldErrors = {};
  if (!isCompleteFolio(folio)) {
    errors['folio'] = 'Escribe tu folio completo: tiene 12 letras y números.';
  }
  words.forEach((word, position) => {
    const message = wordError(position, word);
    if (message !== null) errors[wordInputId(position)] = message;
  });
  return errors;
}

/** Formulario de acceso. */
export function TrackingLogin({
  isBusy,
  error,
  invalidWordPosition,
  onSubmit,
}: TrackingLoginProps) {
  const [folio, setFolio] = useState('');
  const [words, setWords] = useState<string[]>(() =>
    Array.from({ length: RECEIPT_WORD_COUNT }, () => ''),
  );
  const [attempt, setAttempt] = useState(0);
  const showErrors = attempt > 0;

  function setWord(position: number, value: string): void {
    setWords((current) => current.map((word, index) => (index === position ? value : word)));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (isBusy) return;
    setAttempt((value) => value + 1);
    const resolved = words.map(resolvedWord);
    if (!isCompleteFolio(folio) || resolved.some((word) => word === null)) return;
    onSubmit(
      normalizeFolioInput(folio),
      resolved.filter((word): word is string => word !== null),
    );
  }

  const errors = showErrors ? loginErrors(folio, words) : {};

  return (
    <form onSubmit={submit} noValidate data-testid="tracking-login">
      <p>
        Escribe tu folio y las 8 palabras de tu recibo. Basta con las primeras 4 letras de cada
        palabra. Tus palabras no salen de tu equipo. Solo sirven para abrir tu seguimiento.
      </p>
      <p>Todos los datos son necesarios.</p>
      <ErrorSummary errors={errors} attempt={attempt} />
      {error && (
        <Alert
          tone="danger"
          title="No pudimos abrir tu seguimiento"
          role="alert"
          testId="tracking-error"
        >
          <p>{error}</p>
        </Alert>
      )}
      <TextField
        id="folio"
        label="Folio"
        hint="Tiene 12 letras y números. Ejemplo: ABCD-EFGH-JKMN. Puedes escribirlo sin guiones."
        required
        value={folio}
        error={errors['folio']}
        inputMode="text"
        className="mono"
        data-testid="tracking-folio"
        onChange={(event) => setFolio(normalizeFolioInput(event.target.value))}
      />
      <fieldset>
        <legend>Las 8 palabras de tu recibo</legend>
        <p className="field__hint">
          Cuida que nadie vea tu pantalla. Puedes pegar las 8 palabras en la primera casilla.
        </p>
        <div className="word-grid">
          {words.map((word, position) => (
            <ReceiptWordInput
              key={position}
              position={position}
              value={word}
              showErrors={showErrors}
              isRejected={invalidWordPosition === position + 1}
              onChange={(value) => setWord(position, value)}
              onPaste={(event) => {
                const next = distributePastedWords(
                  words,
                  position,
                  event.clipboardData.getData('text'),
                );
                if (next !== null) {
                  event.preventDefault();
                  setWords(next);
                }
              }}
            />
          ))}
        </div>
      </fieldset>
      {/* aria-disabled: mientras abre, el botón conserva el foco. */}
      <button
        type="submit"
        className="button"
        aria-disabled={isBusy ? true : undefined}
        data-testid="tracking-submit"
      >
        {isBusy ? 'Abriendo...' : 'Ver mi seguimiento'}
      </button>
    </form>
  );
}
