// Pantalla /seguimiento: acceso con folio y recibo, estatus, identidad, comprobante y buzón.
import { useEffect, useRef, useState } from 'react';
import type { LedgerAnchor, MailboxMessage, TrackingView } from '@sigilo/contracts';
import { isMailboxSequenceComplete, ReceiptPhraseError } from '@sigilo/core';
import { Alert } from '../../components/Alert.tsx';
import { AnchorsField } from '../../components/AnchorsField.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { assertServedKeysMatch, KeyMismatchError } from '../../crypto/key-pinning.ts';
import { parseLedgerAnchors } from '../../crypto/ledger-verification.ts';
import { createProofProvider, sendWithProof, workerPowSolver } from '../../crypto/proof-of-work.ts';
import {
  checkIdentityOpenings,
  checkPublishedEvent,
  decodeReporterThread,
  loadTrackingLedger,
  sealReporterReply,
  startTrackingSession,
  verifyTrackingReceipt,
  wipeTrackingSession,
} from '../../crypto/tracking.ts';
import type {
  DecodedMessage,
  IdentityOpeningsCheck,
  PublicationStatus,
  TrackingLedger,
  TrackingReceiptCheck,
  TrackingSession,
} from '../../crypto/tracking.ts';
import { announce } from '../../lib/announce.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import { useDocumentTitle } from '../../lib/use-document-title.ts';
import { api } from '../../services/api.ts';
import { ApiRequestError, describeError } from '../../services/api-client.ts';
import { IdentityStatus } from './IdentityStatus.tsx';
import { wordInputId } from './ReceiptWordInput.tsx';
import { ReporterMailbox } from './ReporterMailbox.tsx';
import { StatusTimeline } from './StatusTimeline.tsx';
import { TrackingLogin } from './TrackingLogin.tsx';

/** Encabezado de la vista de seguimiento: recibe el foco al entrar. */
const TRACKING_VIEW_TITLE_ID = 'tracking-view-title';

interface Loaded {
  view: TrackingView;
  messages: DecodedMessage[];
  check: TrackingReceiptCheck;
  /** `unknown` si no se pudo consultar la bitácora pública. */
  publication: PublicationStatus | 'unknown' | 'checking';
  /** Contraste de las aperturas de identidad con la bitácora pública; `null` si es anónima. */
  openings: IdentityOpeningsCheck | 'checking' | null;
}

/** Error del acceso y, si se sabe, la palabra (desde 1) que lo causó. */
interface LoginFailure {
  message: string;
  wordPosition: number | null;
}

function loginFailure(error: unknown): LoginFailure {
  if (error instanceof ApiRequestError && error.code === 'not_found') {
    return {
      message: 'El folio o el recibo no coinciden. Revisa cada palabra e inténtalo de nuevo.',
      wordPosition: null,
    };
  }
  if (error instanceof ReceiptPhraseError) {
    return {
      message:
        error.position === null
          ? 'Escribe las 8 palabras de tu recibo.'
          : `La palabra ${error.position} no está en la lista. Revísala en tu recibo.`,
      wordPosition: error.position,
    };
  }
  return {
    message: describeError(error, 'No pudimos abrir tu seguimiento. Inténtalo de nuevo.'),
    wordPosition: null,
  };
}

function ReceiptStatus({ loaded }: { loaded: Loaded }) {
  const { view, check, publication } = loaded;
  if (!check.isReceiptValid) {
    return (
      <Alert
        tone="danger"
        title="Atención: no pudimos comprobar tu denuncia"
        testId="receipt-invalid"
      >
        <p>
          No pudimos comprobar que esta información viene del sistema. Tómala con cuidado y vuelve a
          entrar más tarde.
        </p>
      </Alert>
    );
  }
  if (check.event === 'invalid') {
    return (
      <Alert
        tone="danger"
        title="Atención: la anotación de tu denuncia no coincide"
        testId="receipt-event-invalid"
      >
        <p>
          Tu comprobante es válido, pero la anotación de tu denuncia en el registro público no
          corresponde a él. Guarda tu folio y vuelve a entrar más tarde.
        </p>
      </Alert>
    );
  }
  return (
    <Alert tone="success" title="Tu denuncia está registrada" testId="receipt-verified">
      <p>
        Comprobamos que tu denuncia se recibió el {formatDayDate(view.receipt.receivedOn)}
        {view.receivedEvent === undefined
          ? '.'
          : ` y que quedó anotada en el registro público con el número ${view.receivedEvent.seq}.`}
      </p>
      <p data-testid="ledger-publication">
        {publication === 'checking' && 'Estamos buscando esa anotación en el registro público.'}
        {publication === 'published' &&
          'La anotación ya aparece en el registro público, igual que aquí.'}
        {publication === 'pending' &&
          'Tu anotación está pendiente de publicar: el registro público se actualiza una vez al día, cuando el día termina.'}
        {publication === 'unknown' && 'Por ahora no pudimos consultar el registro público.'}
      </p>
      {publication === 'mismatch' && (
        <p className="field__error" data-testid="ledger-publication-mismatch">
          Atención: el registro público no muestra la misma anotación. El sistema podría estar
          mostrando cosas distintas a cada persona.
        </p>
      )}
    </Alert>
  );
}

/** Resultado de comparar el tramo del seguimiento con los anclajes pegados, en lectura fácil. */
function anchorsMessage(ledger: TrackingLedger): string {
  if (ledger.status === 'valid') {
    return 'El registro público coincide con los anclajes que pegaste.';
  }
  if (ledger.status === 'unpublished') {
    return 'Tu anotación todavía no se publica. Compara los anclajes cuando aparezca en el registro público.';
  }
  return ledger.isAnchorMismatch === true
    ? 'Atención: el registro público no coincide con los anclajes que pegaste. Alguien lo reescribió después de publicarlos.'
    : 'Por ahora no pudimos comprobar el registro público.';
}

/** Seguimiento de la denuncia. Todo vive en memoria y se borra al salir. */
export function TrackingPage() {
  useDocumentTitle('Dar seguimiento');
  const sessionRef = useRef<TrackingSession | null>(null);
  const isMounted = useRef(true);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [isBusy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [replyStatus, setReplyStatus] = useState('');
  const [sentTexts, setSentTexts] = useState<Record<string, string>>({});
  const [anchorText, setAnchorText] = useState('');
  const [anchorError, setAnchorError] = useState('');
  const [anchorStatus, setAnchorStatus] = useState('');

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (sessionRef.current) wipeTrackingSession(sessionRef.current);
      sessionRef.current = null;
    };
  }, []);

  async function load(session: TrackingSession): Promise<TrackingView> {
    const view = await api.track(session.credentials);
    const messages = await decodeReporterThread(view.messages, session, PINNED_KEYS);
    if (!isMounted.current) return view;
    const check = verifyTrackingReceipt(view, PINNED_KEYS);
    const canCheck = check.isReceiptValid && check.event !== 'invalid';
    const isSealed = view.mode === 'sealed';
    setLoaded({
      view,
      messages,
      check,
      publication: canCheck ? 'checking' : 'unknown',
      openings: isSealed ? 'checking' : null,
    });
    if (canCheck || isSealed) void checkLedger(view, session, canCheck);
    return view;
  }

  /**
   * Un solo tramo verificado de la bitácora, desde el día de recepción, sirve a ambos controles y,
   * si la persona pegó anclajes, también a la comparación con ellos.
   */
  async function checkLedger(
    view: TrackingView,
    session: TrackingSession,
    canCheck: boolean,
    anchors: readonly LedgerAnchor[] = [],
  ): Promise<TrackingLedger | null> {
    const isSealed = view.mode === 'sealed';
    const ledgerApi = {
      fetchHead: () => api.getLedgerHead(),
      fetchSince: (day: string, limit: number) => api.getLedgerSince(day, limit),
      fetchPage: (from: number, limit: number) => api.getLedgerEvents(from, limit),
    };
    try {
      const ledger = await loadTrackingLedger(view, PINNED_KEYS, ledgerApi, anchors);
      updateLoaded(view, {
        ...(canCheck ? { publication: checkPublishedEvent(view, ledger) } : {}),
        ...(isSealed ? { openings: checkIdentityOpenings(view, session, ledger) } : {}),
      });
      return ledger;
    } catch {
      updateLoaded(view, {
        ...(canCheck ? { publication: 'unknown' as const } : {}),
        ...(isSealed ? { openings: { status: 'unknown' as const } } : {}),
      });
      return null;
    }
  }

  /** Vuelve a comprobar el tramo del seguimiento contra los anclajes pegados. */
  async function compareAnchors(): Promise<void> {
    const session = sessionRef.current;
    if (loaded === null || session === null) return;
    const anchors = parseLedgerAnchors(anchorText);
    if (anchors === null) {
      setAnchorError('El texto pegado no es un anclaje válido.');
      setAnchorStatus('');
      return;
    }
    setAnchorError('');
    setAnchorStatus('Comparando con los anclajes.');
    const { view, check } = loaded;
    const canCheck = check.isReceiptValid && check.event !== 'invalid';
    const ledger = await checkLedger(view, session, canCheck, anchors);
    if (!isMounted.current) return;
    const message =
      ledger === null
        ? 'Por ahora no pudimos consultar el registro público.'
        : anchorsMessage(ledger);
    setAnchorStatus(message);
    announce(message);
  }

  function updateLoaded(
    view: TrackingView,
    changes: Partial<Pick<Loaded, 'publication' | 'openings'>>,
  ): void {
    if (!isMounted.current) return;
    setLoaded((current) => (current?.view === view ? { ...current, ...changes } : current));
  }

  async function login(folio: string, words: string[]): Promise<void> {
    setBusy(true);
    setFailure(null);
    let session: TrackingSession | null = null;
    try {
      session = startTrackingSession(folio, words);
      await load(session);
      // Seguridad: si la pantalla se cerró durante el acceso, las llaves no se quedan en memoria.
      if (!isMounted.current) {
        wipeTrackingSession(session);
        return;
      }
      sessionRef.current = session;
      // El formulario desaparece: el foco va al encabezado de la vista de seguimiento.
      focusAfterRender(TRACKING_VIEW_TITLE_ID);
    } catch (error) {
      if (session !== null) wipeTrackingSession(session);
      if (!isMounted.current) return;
      const found = loginFailure(error);
      setFailure(found);
      if (found.wordPosition !== null) focusAfterRender(wordInputId(found.wordPosition - 1));
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }

  /**
   * Sella y envía la respuesta. Si el servidor la rechaza porque la secuencia ya no es la
   * siguiente (por ejemplo, otra pestaña envió antes), recarga la vista y vuelve a sellar una vez.
   */
  async function sealAndSend(
    text: string,
    session: TrackingSession,
    messages: readonly MailboxMessage[],
  ): Promise<MailboxMessage> {
    // Cada intento lleva su propia prueba de trabajo (los retos `message` son de un solo uso); si
    // el reto venció o la dificultad subió, se resuelve otro una vez.
    const send = async (current: readonly MailboxMessage[]) => {
      const request = await sealReporterReply(text, session, PINNED_KEYS, current);
      const proofs = createProofProvider(api, 'message', workerPowSolver, setReplyStatus);
      return sendWithProof(proofs, (proof) => api.sendReporterMessage(request, proof));
    };
    try {
      return await send(messages);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.code !== 'bad_request') throw error;
      const fresh = await load(session);
      return send(fresh.messages);
    }
  }

  async function sendReply(text: string): Promise<boolean> {
    const session = sessionRef.current;
    if (session === null || loaded === null || isBusy) return false;
    setBusy(true);
    setReplyStatus('Enviando tu respuesta.');
    try {
      await assertServedKeysMatch(() => api.getKeys(), PINNED_KEYS.set);
      const message = await sealAndSend(text, session, loaded.view.messages);
      if (!isMounted.current) return false;
      setSentTexts((current) => ({ ...current, [message.messageId]: text }));
      await load(session);
      setReplyStatus('Respuesta enviada. Solo la autoridad puede leerla.');
      return true;
    } catch (error) {
      if (isMounted.current) {
        setReplyStatus(
          error instanceof KeyMismatchError
            ? 'Por seguridad no enviamos nada. Alguien podría estar espiando esta conexión. Usa otra conexión, por ejemplo los datos de tu celular.'
            : describeError(error, 'No pudimos enviar tu respuesta. Inténtalo de nuevo.'),
        );
      }
      return false;
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }

  function logout(): void {
    if (sessionRef.current) wipeTrackingSession(sessionRef.current);
    sessionRef.current = null;
    setLoaded(null);
    setSentTexts({});
    setAnchorText('');
    setAnchorError('');
    setAnchorStatus('');
    setReplyStatus('');
    focusAfterRender(() => document.querySelector<HTMLElement>('#contenido h1'));
    announce('Cerraste tu seguimiento. Borramos tus datos de esta pantalla.');
  }

  return (
    <>
      <h1 tabIndex={-1}>Dar seguimiento a tu denuncia</h1>
      {loaded === null ? (
        <TrackingLogin
          isBusy={isBusy}
          error={failure?.message ?? ''}
          invalidWordPosition={failure?.wordPosition ?? null}
          onSubmit={(folio, words) => void login(folio, words)}
        />
      ) : (
        <div data-testid="tracking-view">
          <h2 id={TRACKING_VIEW_TITLE_ID} tabIndex={-1}>
            Tu denuncia con folio <span className="mono folio">{loaded.view.folio}</span>
          </h2>
          <ReceiptStatus loaded={loaded} />
          <section className="card" aria-labelledby="tracking-anchors-title">
            <h3 id="tracking-anchors-title">Comparar con anclajes publicados (opcional)</h3>
            <p>
              Si tienes anclajes del registro público publicados fuera del sistema, pégalos aquí.
              Comprobaremos que el registro donde aparece tu denuncia no se reescribió.
            </p>
            <AnchorsField
              id="tracking-anchors"
              value={anchorText}
              onChange={setAnchorText}
              error={anchorError}
              testId="tracking-anchor-input"
            />
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void compareAnchors()}
              data-testid="tracking-compare-anchors"
            >
              Comparar con los anclajes
            </button>
            <p role="status" data-testid="tracking-anchors-status">
              {anchorStatus}
            </p>
          </section>
          <StatusTimeline view={loaded.view} />
          <IdentityStatus view={loaded.view} openings={loaded.openings} />
          {!isMailboxSequenceComplete(loaded.view.messages) && (
            <Alert tone="danger" title="Faltan mensajes" testId="mailbox-incomplete">
              <p>
                Faltan, sobran o están desordenados algunos mensajes. El sistema podría estar
                ocultando parte de la conversación.
              </p>
            </Alert>
          )}
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
