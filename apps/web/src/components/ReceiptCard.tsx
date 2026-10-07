// Recibo de 8 palabras: oculto por defecto, con mostrar, copiar (se borra a los 60 s), imprimir y
// escuchar con voz local. Sin descarga automática ni código QR.
import { useEffect, useRef, useState } from 'react';
import { CLIPBOARD_CLEAR_SECONDS } from '../config/app-config.ts';
import { copyWithAutoClear } from '../lib/clipboard.ts';
import { speakReceipt, stopSpeaking } from '../lib/local-speech.ts';
import { useLocalVoice } from '../lib/use-local-voice.ts';

interface ReceiptCardProps {
  folio: string;
  words: readonly string[];
}

/** Tarjeta del recibo. */
export function ReceiptCard({ folio, words }: ReceiptCardProps) {
  const [isVisible, setVisible] = useState(false);
  const [hasCopied, setCopied] = useState(false);
  const [status, setStatus] = useState('');
  const voice = useLocalVoice();
  const cancelClear = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      cancelClear.current?.();
      stopSpeaking();
    },
    [],
  );

  async function copy(): Promise<void> {
    try {
      cancelClear.current?.();
      cancelClear.current = await copyWithAutoClear(words.join(' '), CLIPBOARD_CLEAR_SECONDS);
      setCopied(true);
      setStatus(
        `Copiado. Pégalo ahora donde lo vayas a guardar. En ${CLIPBOARD_CLEAR_SECONDS} segundos intentaremos borrarlo del portapapeles. Si se borró antes de pegarlo, pulsa «Copiar de nuevo».`,
      );
    } catch {
      setStatus('Tu navegador no permitió copiar. Escribe las palabras en papel.');
    }
  }

  return (
    <section className="card" aria-labelledby="receipt-title" data-testid="receipt-card">
      <h3 id="receipt-title">Tu recibo</h3>
      <p>
        Tu folio es{' '}
        <strong className="mono folio" data-testid="receipt-folio">
          {folio}
        </strong>
        . Con el folio y estas 8 palabras podrás ver cómo va tu denuncia y leer los mensajes de la
        autoridad.
      </p>
      <div className="alert alert--warning">
        <p className="alert__title">Solo lo verás esta vez</p>
        <p>
          Escríbelas en papel ahora. No las guardamos en ningún lugar: si las pierdes, no hay forma
          de recuperarlas. Guarda el papel donde nadie lo encuentre.
        </p>
      </div>
      <div className="no-print">
        <button
          type="button"
          className="button"
          aria-expanded={isVisible}
          aria-controls="receipt-words-region"
          onClick={() => setVisible((value) => !value)}
          data-testid="toggle-receipt"
        >
          {isVisible ? 'Ocultar palabras' : 'Mostrar palabras'}
        </button>
        <div id="receipt-words-region">
          {isVisible ? (
            // role="list": sin viñetas, Safari deja de anunciarla como lista.
            <ol className="receipt-words" role="list" data-testid="receipt-words">
              {words.map((word, index) => (
                <li key={index}>
                  <span className="muted" aria-hidden="true">
                    {index + 1}.
                  </span>
                  <span className="visually-hidden">Palabra {index + 1}: </span>{' '}
                  <span data-testid="receipt-word">{word}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              Las palabras están ocultas para que nadie las vea en tu pantalla.
            </p>
          )}
        </div>
        <div className="actions">
          <button type="button" className="button button--secondary" onClick={() => void copy()}>
            {hasCopied ? 'Copiar de nuevo' : 'Copiar'}
          </button>
          <button type="button" className="button button--secondary" onClick={() => window.print()}>
            Imprimir
          </button>
          {voice !== null && (
            <>
              <button
                type="button"
                className="button button--secondary"
                aria-describedby="receipt-speech-notice"
                onClick={() => speakReceipt(folio, words, voice)}
                data-testid="speak-receipt"
              >
                Escuchar
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={stopSpeaking}
                data-testid="stop-speaking"
              >
                Detener
              </button>
            </>
          )}
        </div>
        {voice !== null ? (
          <p id="receipt-speech-notice" className="field__hint speech-notice">
            Se oirá en voz alta. Usa audífonos si hay más personas cerca. Si usas lector de
            pantalla, puedes leer la lista directamente.
          </p>
        ) : (
          <p className="field__hint speech-notice" data-testid="speech-unavailable">
            No podemos leer el recibo en voz alta: tu equipo no tiene una voz en español instalada.
            Por seguridad no usamos voces de internet, porque enviarían tus palabras fuera de tu
            equipo. Si usas lector de pantalla, puedes leer la lista directamente.
          </p>
        )}
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
