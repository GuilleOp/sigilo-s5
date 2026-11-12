// Pantalla /seguimiento: acceso con folio y recibo, trámite con plazos, identidad, comprobante y
// buzón. Con la red, el folio se busca a la vez en todos los nodos por el enrutador ciego.
import { useEffect, useRef, useState } from 'react';
import type { LedgerAnchor, MailboxMessage, TrackingView } from '@sigilo/contracts';
import { isMailboxSequenceComplete, ReceiptPhraseError } from '@sigilo/core';
import { Alert } from '../../components/Alert.tsx';
import { AnchorsField } from '../../components/AnchorsField.tsx';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import type { PinnedKeys } from '../../config/pinned-keys.ts';
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
import { networkState } from '../../network/directory.ts';
import { decodeNetworkThread, trackAcrossNetwork } from '../../network/network-tracking.ts';
import type { NetworkTrackingResult } from '../../network/network-tracking.ts';
import { sameOriginRelaySender } from '../../network/relay-api.ts';
import type { ReporterApi } from '../../network/relay-api.ts';
import { api } from '../../services/api.ts';
import { ApiRequestError, describeError } from '../../services/api-client.ts';
import { IdentityStatus } from './IdentityStatus.tsx';
import { wordInputId } from './ReceiptWordInput.tsx';
import { ReporterMailbox } from './ReporterMailbox.tsx';
import { ProcedureTimeline } from './ProcedureTimeline.tsx';
import { TrackingLogin } from './TrackingLogin.tsx';

/**
 * Por dónde se sigue la denuncia: el nodo de este mismo origen con las llaves fijadas, o un nodo de
 * la red (por el enrutador) con las llaves del directorio verificado.
 */
interface TrackingTransport {
  api: ReporterApi;
  /** Llaves para verificar el comprobante y, si se sabe, para responder a la autoridad. */
  keys: PinnedKeys;
  /** Llaves de la autoridad que firmó los mensajes; `null` por la red si aún no hay mensajes. */
  replyKeys: PinnedKeys | null;
  network: NetworkTrackingResult | null;
}

/** Folio no encontrado: el mismo error que da el nodo, sin decir si falló el folio o el recibo. */
class FolioNotFoundError extends ApiRequestError {
  constructor() {
    super('not_found', 404);
  }
}

/** Texto cuando la denuncia está en otro nodo de la red: no es una falla. */
export const REMOTE_LEDGER_TEXT =
  'Tu denuncia quedó anotada en el registro público del nodo que la atiende. Puedes comprobarlo en «Registro público» de ese nodo: este sistema no consulta registros de otros nodos para no revelar en cuál está tu denuncia.';

/** Encabezado de la vista de seguimiento: recibe el foco al entrar. */
const TRACKING_VIEW_TITLE_ID = 'tracking-view-title';

interface Loaded {
  view: TrackingView;
  messages: DecodedMessage[];
  check: TrackingReceiptCheck;
  /**
   * `unknown` si no se pudo consultar la bitácora pública; `remote` si la denuncia está en otro
   * nodo de la red, cuya bitácora no se consulta desde aquí.
   */
  publication: PublicationStatus | 'unknown' | 'checking' | 'remote';
  /** Contraste de las aperturas de identidad con la bitácora pública; `null` si es anónima. */
  openings: IdentityOpeningsCheck | 'checking' | 'remote' | null;
}

/** Error del acceso y, si se sabe, la palabra (desde 1) que lo causó. */
interface LoginFailure {
  message: string;
  wordPosition: number | null;
}

function loginFailure(error: unknown): LoginFailure {
  if (error instanceof ApiRequestError && error.code === 'not_found') {
    return {
      message:
        'El folio o el recibo no coinciden. Revisa cada palabra e inténtalo de nuevo. Si tu denuncia quedó en la cola de entrega, aparecerá cuando el sistema de destino la reciba.',
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

/** Por la red, todavía no se sabe a qué autoridad responder hasta que escriba la primera vez. */
class ReplyUnavailableError extends Error {
  constructor() {
    super(
      'Podrás responder cuando la autoridad te escriba por primera vez: así sabemos a quién cerrar tu mensaje con llave.',
    );
    this.name = 'ReplyUnavailableError';
  }
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
        {publication === 'remote' && REMOTE_LEDGER_TEXT}
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
    return ledger.anchors === 'not-comparable'
      ? 'No pudimos comparar los anclajes que pegaste: no logramos descargar la parte del registro público donde están. No sabemos si coinciden.'
      : 'El registro público coincide con los anclajes que pegaste.';
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
  useDocumentTitle('Mi denuncia');
  const sessionRef = useRef<TrackingSession | null>(null);
  const transportRef = useRef<TrackingTransport | null>(null);
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

  /**
   * Busca la denuncia: por la red en todos los nodos (si esta web participa en la red) o en el nodo
   * de este mismo origen.
   */
  async function fetchView(
    session: TrackingSession,
  ): Promise<{ view: TrackingView; transport: TrackingTransport }> {
    const known = transportRef.current;
    if (known !== null && known.network === null) {
      return { view: await known.api.track(session.credentials), transport: known };
    }
    const state = await networkState();
    if (state.kind !== 'verified') {
      const transport = { api, keys: PINNED_KEYS, replyKeys: PINNED_KEYS, network: null };
      return { view: await api.track(session.credentials), transport };
    }
    const found = await trackAcrossNetwork(
      state.directory,
      session.credentials,
      sameOriginRelaySender(),
    );
    if (found === null) throw new FolioNotFoundError();
    const decoded = await decodeNetworkThread(state.directory, found, found.view.messages, session);
    return {
      view: found.view,
      transport: { api: found.api, keys: found.keys, replyKeys: decoded.replyKeys, network: found },
    };
  }

  async function load(session: TrackingSession): Promise<TrackingView> {
    const { view, transport } = await fetchView(session);
    transportRef.current = transport;
    const messageKeys = transport.replyKeys ?? transport.keys;
    const messages = await decodeReporterThread(view.messages, session, messageKeys);
    if (!isMounted.current) return view;
    const check = verifyTrackingReceipt(view, transport.keys);
    const isLocal = transport.network === null;
    // La bitácora del nodo de la red se publica en su propio origen: aquí no se consulta.
    const canCheck = isLocal && check.isReceiptValid && check.event !== 'invalid';
    const isSealed = view.mode === 'sealed';
    setLoaded({
      view,
      messages,
      check,
      publication: canCheck ? 'checking' : isLocal ? 'unknown' : 'remote',
      openings: isSealed && isLocal ? 'checking' : isSealed ? 'remote' : null,
    });
    if (canCheck || (isSealed && isLocal)) void checkLedger(view, session, canCheck);
    return view;
  }

  /** Sigue la denuncia con el folio nuevo y las mismas llaves del recibo. */
  async function followFolio(folio: string): Promise<void> {
    const current = sessionRef.current;
    if (current === null) return;
    const session: TrackingSession = {
      folio,
      keys: current.keys,
      credentials: { folio, authKey: current.credentials.authKey },
    };
    setBusy(true);
    transportRef.current = null;
    try {
      await load(session);
      sessionRef.current = session;
      focusAfterRender(TRACKING_VIEW_TITLE_ID);
      announce(`Abrimos tu denuncia con el folio ${folio}.`);
    } catch (error) {
      announce(describeError(error, 'No pudimos abrir el folio nuevo. Inténtalo más tarde.'));
    } finally {
      if (isMounted.current) setBusy(false);
    }
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
      transportRef.current?.network !== null
        ? REMOTE_LEDGER_TEXT
        : ledger === null
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
    transportRef.current = null;
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
    const transport = transportRef.current;
    const replyKeys = transport?.replyKeys ?? null;
    if (transport === null || replyKeys === null) throw new ReplyUnavailableError();
    const send = async (current: readonly MailboxMessage[]) => {
      const request = await sealReporterReply(text, session, replyKeys, current);
      const proofs = createProofProvider(transport.api, 'message', workerPowSolver, setReplyStatus);
      return sendWithProof(proofs, (proof) => transport.api.sendReporterMessage(request, proof));
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
      if (transportRef.current?.network === null) {
        await assertServedKeysMatch(() => api.getKeys(), PINNED_KEYS.set);
      }
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
            : error instanceof ReplyUnavailableError
              ? error.message
              : describeError(error, 'No pudimos enviar tu respuesta. Inténtalo de nuevo.'),
        );
      }
      return false;
    } finally {
      if (isMounted.current) setBusy(false);
    }
  }

  /**
   * Presenta la inconformidad. Seguridad: la persona aceptó abrir su identidad solo para el
   * recurso; la apertura queda en la bitácora y en este seguimiento.
   */
  async function fileAppeal(reasons: string): Promise<string | null> {
    const session = sessionRef.current;
    const transport = transportRef.current;
    if (session === null || transport === null) return 'Vuelve a entrar a tu seguimiento.';
    try {
      const proofs = createProofProvider(transport.api, 'message', workerPowSolver, announce);
      await sendWithProof(proofs, (proof) =>
        transport.api.fileAppeal(
          { ...session.credentials, reasons, revealIdentityForAppeal: true },
          proof,
        ),
      );
      await load(session);
      return null;
    } catch (error) {
      return describeError(error, 'No pudimos presentar tu inconformidad. Inténtalo de nuevo.');
    }
  }

  function logout(): void {
    if (sessionRef.current) wipeTrackingSession(sessionRef.current);
    sessionRef.current = null;
    transportRef.current = null;
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
      <h1 tabIndex={-1}>Ver cómo va tu denuncia</h1>
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
          <ProcedureTimeline
            view={loaded.view}
            onFollowFolio={(folio) => void followFolio(folio)}
            onFileAppeal={fileAppeal}
          />
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
          <details className="card anchors-details" data-testid="tracking-anchors">
            <summary>Comparar con anclajes publicados (opcional)</summary>
            <p>
              Si tienes anclajes del registro público publicados fuera del sistema, pégalos aquí.
              Comprobaremos que el registro donde aparece tu denuncia no se reescribió. Para eso
              descargamos el registro desde tu anclaje más antiguo. Si no podemos compararlo, te lo
              decimos: nunca lo damos por bueno sin comparar.
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
          </details>
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
