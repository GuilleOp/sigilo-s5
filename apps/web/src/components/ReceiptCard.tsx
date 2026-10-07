// Recibo de 8 palabras: oculto por defecto, con mostrar, copiar (se borra a los 60 s), imprimir y
// escuchar con voz local. Sin descarga automática ni código QR.
import { useEffect, useRef, useState } from 'react';
import { CLIPBOARD_CLEAR_SECONDS } from '../config/app-config.ts';
import { copyWithAutoClear } from '../lib/clipboard.ts';
import { speakWords } from '../lib/local-speech.ts';
import { useLocalVoice } from '../lib/use-local-voice.ts';

interface ReceiptCardProps {
  folio: string;
  words: readonly string[];
}

/** Tarjeta del recibo. */
export function ReceiptCard({ folio, words }: ReceiptCardProps) {
  const [isVisible, setVisible] = useState(false);
  const [status, setStatus] = useState('');
  const voice = useLocalVoice();
  const cancelClear = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelClear.current?.(), []);

  async function copy(): Promise<void> {
    try {
      cancelClear.current?.();
      cancelClear.current = await copyWithAutoClear(words.join(' '), CLIPBOARD_CLEAR_SECONDS);
      setStatus(
        `Copiado. Pégalo donde lo vayas a guardar: intentaremos borrarlo del portapapeles en ${CLIPBOARD_CLEAR_SECONDS} segundos.`,
      );
    } catch {
      setStatus('Tu navegador no permitió copiar. Escribe las palabras en papel.');
    }
  }

  return (
    <section className="card" aria-labelledby="receipt-title" data-testid="receipt-card">
      <h2 id="receipt-title">Tu recibo</h2>
      <p>
        Tu folio es{' '}
        <strong className="mono" data-testid="receipt-folio">
          {folio}
        </strong>
        . Con el folio y estas 8 palabras podrás ver el avance y leer los mensajes de la autoridad.
      </p>
      <div className="alert alert--warning">
        <p className="alert__title">Solo lo verás esta vez</p>
        <p>
          No lo guardamos en ningún lugar. Si lo pierdes no hay forma de recuperarlo. Anótalo en
          papel y guárdalo donde nadie lo encuentre.
        </p>
      </div>
      <div className="no-print">
        {isVisible ? (
          <ol className="receipt-words" data-testid="receipt-words">
            {words.map((word, index) => (
              <li key={index}>
                <span className="muted">{index + 1}.</span> {word}
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">Las palabras están ocultas para que nadie las vea en tu pantalla.</p>
        )}
        <div className="actions">
          <button
            type="button"
            className="button"
            aria-pressed={isVisible}
            onClick={() => setVisible((value) => !value)}
            data-testid="toggle-receipt"
          >
            {isVisible ? 'Ocultar palabras' : 'Mostrar palabras'}
          </button>
          <button type="button" className="button button--secondary" onClick={() => void copy()}>
            Copiar
          </button>
          <button type="button" className="button button--secondary" onClick={() => window.print()}>
            Imprimir
          </button>
          {voice !== null && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => speakWords(words, voice)}
            >
              Escuchar
            </button>
          )}
        </div>
        <p role="status" aria-live="polite">
          {status}
        </p>
      </div>
      <div className="print-only">
        <p>Folio: {folio}</p>
        <ol>
          {words.map((word, index) => (
            <li key={index}>{word}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}
