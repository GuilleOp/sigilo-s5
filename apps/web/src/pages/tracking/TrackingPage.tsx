// Pantalla /seguimiento: acceso con folio y recibo, estatus, identidad, comprobante y buzón.
import { useEffect, useRef, useState } from 'react';
import type { TrackingView } from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { assertServedKeysMatch, KeyMismatchError } from '../../crypto/key-pinning.ts';
import {
  decodeReporterThread,
  sealReporterReply,
  startTrackingSession,
  verifyTrackingReceipt,
  wipeTrackingSession,
} from '../../crypto/tracking.ts';
import type { DecodedMessage, TrackingSession } from '../../crypto/tracking.ts';
import { formatDayDate } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api } from '../../services/api.ts';
import { ApiRequestError, describeError } from '../../services/api-client.ts';
import { IdentityStatus } from './IdentityStatus.tsx';
import { ReporterMailbox } from './ReporterMailbox.tsx';
import { StatusTimeline } from './StatusTimeline.tsx';
import { TrackingLogin } from './TrackingLogin.tsx';

interface Loaded {
  view: TrackingView;
  messages: DecodedMessage[];
  isReceiptValid: boolean;
}

function loginError(error: unknown): string {
  if (error instanceof ApiRequestError && error.code === 'not_found') {
    return 'El folio o el recibo no coinciden. Revisa cada palabra e inténtalo de nuevo.';
  }
  if (error instanceof Error && error.message.startsWith('La palabra')) return error.message;
  return describeError(error, 'No pudimos abrir tu seguimiento. Inténtalo de nuevo.');
}

/** Seguimiento de la denuncia. Todo vive en memoria y se borra al salir. */
export function TrackingPage() {
  useDocumentTitle('Dar seguimiento');
  const sessionRef = useRef<TrackingSession | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [replyStatus, setReplyStatus] = useState('');
  const [sentTexts, setSentTexts] = useState<Record<string, string>>({});

  useEffect(
    () => () => {
      if (sessionRef.current) wipeTrackingSession(sessionRef.current);
    },
    [],
  );

  async function load(session: TrackingSession): Promise<void> {
    const view = await api.track(session.credentials);
    const messages = await decodeReporterThread(view.messages, session, PINNED_KEYS);
    setLoaded({ view, messages, isReceiptValid: verifyTrackingReceipt(view, PINNED_KEYS) });
  }

  async function login(folio: string, words: string[]): Promise<void> {
    setBusy(true);
    setError('');
    let session: TrackingSession | null = null;
    try {
      session = startTrackingSession(folio, words);
      await load(session);
      sessionRef.current = session;
    } catch (failure) {
      if (session !== null) wipeTrackingSession(session);
      setError(loginError(failure));
    } finally {
      setBusy(false);
    }
  }

  async function sendReply(text: string): Promise<boolean> {
    const session = sessionRef.current;
    if (session === null) return false;
    setBusy(true);
    setReplyStatus('Cifrando y enviando tu respuesta.');
    try {
      await assertServedKeysMatch(() => api.getKeys(), PINNED_KEYS.set);
      const message = await api.sendReporterMessage(
        await sealReporterReply(text, session, PINNED_KEYS),
      );
      setSentTexts((current) => ({ ...current, [message.messageId]: text }));
      await load(session);
      setReplyStatus('Respuesta enviada. Solo la autoridad puede leerla.');
      return true;
    } catch (failure) {
      setReplyStatus(
        failure instanceof KeyMismatchError
          ? failure.message
          : describeError(failure, 'No se pudo enviar tu respuesta. Inténtalo de nuevo.'),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function logout(): void {
    if (sessionRef.current) wipeTrackingSession(sessionRef.current);
    sessionRef.current = null;
    setLoaded(null);
    setSentTexts({});
    setReplyStatus('');
  }

  return (
    <>
      <h1>Dar seguimiento a tu denuncia</h1>
      {loaded === null ? (
        <TrackingLogin
          isBusy={isBusy}
          error={error}
          onSubmit={(folio, words) => void login(folio, words)}
        />
      ) : (
        <div data-testid="tracking-view">
          <p>
            Folio <strong className="mono">{loaded.view.folio}</strong>.
          </p>
          {loaded.isReceiptValid ? (
            <Alert
              tone="success"
              title="Comprobante verificado"
              role="status"
              testId="receipt-verified"
            >
              <p>
                El servidor firmó la recepción el {formatDayDate(loaded.view.receipt.receivedOn)} y
                la firma coincide con su llave fijada en esta aplicación.
              </p>
            </Alert>
          ) : (
            <Alert
              tone="danger"
              title="Alerta: el comprobante no es válido"
              role="alert"
              testId="receipt-invalid"
            >
              <p>
                La firma del comprobante no coincide con la llave del servidor. Trata esta
                información con cautela.
              </p>
            </Alert>
          )}
          <StatusTimeline view={loaded.view} />
          <IdentityStatus view={loaded.view} />
          <ReporterMailbox
            messages={loaded.messages}
            sentTexts={sentTexts}
            isSending={isBusy}
            status={replyStatus}
            onSend={sendReply}
          />
          <button
            type="button"
            className="button button--secondary"
            onClick={logout}
            data-testid="tracking-logout"
          >
            Cerrar seguimiento
          </button>
        </div>
      )}
    </>
  );
}
