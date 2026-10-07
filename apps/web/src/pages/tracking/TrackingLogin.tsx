// Acceso al seguimiento con folio y 8 palabras. Las llaves se derivan en el navegador.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { RECEIPT_WORD_COUNT } from '@sigilo/core';
import { Alert } from '../../components/Alert.tsx';
import { TextField } from '../../components/Field.tsx';
import { isCompleteFolio, normalizeFolioInput } from '../../lib/folio-input.ts';
import { distributePastedWords, resolvedWord } from '../../lib/receipt-words.ts';
import { ReceiptWordInput } from './ReceiptWordInput.tsx';

interface TrackingLoginProps {
  isBusy: boolean;
  error: string;
  onSubmit: (folio: string, words: string[]) => void;
}

/** Formulario de acceso. */
export function TrackingLogin({ isBusy, error, onSubmit }: TrackingLoginProps) {
  const [folio, setFolio] = useState('');
  const [words, setWords] = useState<string[]>(() =>
    Array.from({ length: RECEIPT_WORD_COUNT }, () => ''),
  );
  const [showErrors, setShowErrors] = useState(false);

  function setWord(position: number, value: string): void {
    setWords((current) => current.map((word, index) => (index === position ? value : word)));
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    setShowErrors(true);
    const resolved = words.map(resolvedWord);
    if (!isCompleteFolio(folio) || resolved.some((word) => word === null)) return;
    onSubmit(
      normalizeFolioInput(folio),
      resolved.filter((word): word is string => word !== null),
    );
  }

  const folioError =
    showErrors && !isCompleteFolio(folio)
      ? 'El folio tiene 12 letras y números, por ejemplo ABCD-EFGH-JKMN.'
      : undefined;

  return (
    <form onSubmit={submit} noValidate data-testid="tracking-login">
      <p>
        Escribe tu folio y las 8 palabras de tu recibo. Basta con las primeras 4 letras de cada
        palabra. Tu recibo no se envía: tu navegador calcula con él una llave de acceso.
      </p>
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
        value={folio}
        error={folioError}
        inputMode="text"
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
      <button type="submit" className="button" disabled={isBusy} data-testid="tracking-submit">
        {isBusy ? 'Abriendo...' : 'Ver mi seguimiento'}
      </button>
    </form>
  );
}
