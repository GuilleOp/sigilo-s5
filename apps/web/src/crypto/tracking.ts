// Seguimiento: derivación de llaves desde el recibo, comprobante, evento de la bitácora y buzón.
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import type {
  IdentityAccessEntry,
  LedgerPage,
  SignedLedgerHead,
  MailboxMessage,
  ReporterMessageRequest,
  TrackingCredentials,
  TrackingView,
} from '@sigilo/contracts';
import {
  canonicalize,
  deriveReceiptKeys,
  nextMailboxSequence,
  openMailboxMessage,
  phraseToEntropy,
  reconcileIdentityOpenings,
  sealMailboxMessage,
  toBase64Url,
  verifyReceipt,
  verifyReceiptEvent,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import type { PinnedKeys } from '../config/pinned-keys.ts';
import { downloadAndVerifyLedger } from './ledger-verification.ts';

/** Sesión de seguimiento en memoria: folio y llaves derivadas del recibo. */
export interface TrackingSession {
  folio: string;
  keys: ReceiptKeys;
  credentials: TrackingCredentials;
}

/**
 * Deriva las llaves a partir de las 8 palabras.
 * Seguridad: el recibo nunca sale del navegador; al servidor solo viaja `authKey`.
 * Lanza `ReceiptPhraseError` (con la posición, sin citar la palabra) si alguna no está en la lista.
 */
export function startTrackingSession(folio: string, words: readonly string[]): TrackingSession {
  const entropy = phraseToEntropy(words);
  const keys = deriveReceiptKeys(entropy);
  entropy.fill(0);
  return { folio, keys, credentials: { folio, authKey: toBase64Url(keys.authKey) } };
}

/**
 * Estado del evento de recepción que entrega el seguimiento: corresponde al comprobante, todavía
 * no se publica (el día no ha cerrado) o no corresponde.
 */
export type ReceivedEventStatus = 'valid' | 'pending' | 'invalid';

/** Resultado de comprobar el comprobante y su evento en la bitácora. */
export interface TrackingReceiptCheck {
  /** El comprobante es de este folio, es coherente y lo firmó la llave fijada del servidor. */
  isReceiptValid: boolean;
  /** Estado del evento `complaint.received` (fecha, digestos y hash recalculado). */
  event: ReceivedEventStatus;
}

/** Comprueba el comprobante firmado y que el evento de recepción, si ya se publicó, corresponda. */
export function verifyTrackingReceipt(
  view: TrackingView,
  pinned: PinnedKeys,
): TrackingReceiptCheck {
  const isReceiptValid =
    view.receipt.folio === view.folio && verifyReceipt(view.receipt, pinned.serverSigningPublicKey);
  if (!isReceiptValid) return { isReceiptValid, event: 'invalid' };
  if (view.receivedEvent === undefined) return { isReceiptValid, event: 'pending' };
  return {
    isReceiptValid,
    event: verifyReceiptEvent(view.receivedEvent, view.receipt) ? 'valid' : 'invalid',
  };
}

/**
 * Estado del evento de recepción en la bitácora pública: publicado e idéntico, todavía pendiente
 * de publicar (se publica al cerrar el día) o distinto del que entregó el seguimiento.
 */
export type PublicationStatus = 'published' | 'pending' | 'mismatch';

/**
 * Indica si, según la cabeza pública, el día `day` ya se publicó: cada día se encadena completo al
 * cerrar, así que todo evento con fecha anterior o igual a la de la cabeza ya debe estar.
 */
export function isDayPublished(head: SignedLedgerHead, day: string): boolean {
  return head.hash !== LEDGER_GENESIS_HASH && day <= head.at;
}

/**
 * Busca el evento de recepción en la bitácora pública y lo compara con `view.receivedEvent`.
 * Seguridad: si el seguimiento dice que sigue pendiente pero la cabeza pública ya publicó su día,
 * o si la bitácora pública muestra otro evento, el servidor está mostrando algo distinto a cada
 * quien.
 */
export async function checkPublishedEvent(
  view: TrackingView,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
): Promise<PublicationStatus> {
  const received = view.receivedEvent;
  if (received === undefined) {
    const { head } = await fetchPage(0, 1);
    return isDayPublished(head, view.receipt.receivedOn) ? 'mismatch' : 'pending';
  }
  const page = await fetchPage(received.seq, 1);
  const published = page.events[0];
  if (published === undefined) return 'mismatch';
  return canonicalize(published) === canonicalize(received) ? 'published' : 'mismatch';
}

/**
 * Resultado de contrastar las aperturas de identidad del seguimiento con la bitácora pública:
 * `consistent` si todo coincide, `hidden` si hay aperturas públicas con la etiqueta del recibo
 * que el seguimiento no muestra, `unpublished` si una apertura de un día ya publicado no aparece,
 * y `unknown` si la bitácora no se pudo verificar.
 */
export type IdentityOpeningsCheck =
  | { status: 'consistent'; publishedOpeningIds: ReadonlySet<string> }
  | { status: 'hidden'; hiddenCount: number }
  | { status: 'unpublished'; unpublished: readonly IdentityAccessEntry[] }
  | { status: 'unknown' };

/**
 * Descarga y verifica toda la bitácora pública con la llave fijada y busca, sin importar el folio,
 * las aperturas con la etiqueta del recibo (`receiptTag`), para contrastarlas con
 * `view.identityAccess`.
 * Seguridad: el servidor podría registrar una apertura con otro folio u ocultarla en el
 * seguimiento; la etiqueta depende del recibo, que solo conoce la persona denunciante.
 */
export async function checkIdentityOpenings(
  view: TrackingView,
  session: TrackingSession,
  pinned: PinnedKeys,
  fetchHead: () => Promise<SignedLedgerHead>,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
): Promise<IdentityOpeningsCheck> {
  const ledger = await downloadAndVerifyLedger(fetchHead, fetchPage, pinned.serverSigningPublicKey);
  if (ledger.status !== 'valid') return { status: 'unknown' };
  const isGenesis = ledger.head.hash === LEDGER_GENESIS_HASH;
  const result = reconcileIdentityOpenings(ledger.events, view.identityAccess, {
    folio: view.folio,
    authVerifier: session.keys.authVerifier,
    publishedThrough: isGenesis ? null : ledger.head.at,
  });
  if (result.unlisted.length > 0) return { status: 'hidden', hiddenCount: result.unlisted.length };
  if (result.unpublished.length > 0) {
    return { status: 'unpublished', unpublished: result.unpublished };
  }
  // Sin anomalías, toda apertura de un día ya publicado está en la bitácora pública.
  const publishedOpeningIds = new Set(
    view.identityAccess
      .filter((entry) => isDayPublished(ledger.head, entry.on))
      .map((entry) => entry.openingId),
  );
  return { status: 'consistent', publishedOpeningIds };
}

/** Mensaje del buzón ya procesado para mostrarse. */
export type DecodedMessage =
  | { messageId: string; from: 'authority'; sentOn: string; state: 'opened'; text: string }
  | { messageId: string; from: 'authority'; sentOn: string; state: 'unreadable' }
  | { messageId: string; from: 'reporter'; sentOn: string; state: 'sealed-for-authority' };

/**
 * Descifra los mensajes de la autoridad con la llave del buzón y verifica su firma con la llave
 * FIJADA de la autoridad. Los mensajes propios van cifrados hacia la autoridad y no se pueden
 * volver a leer aquí.
 */
export async function decodeReporterThread(
  messages: readonly MailboxMessage[],
  session: TrackingSession,
  pinned: PinnedKeys,
): Promise<DecodedMessage[]> {
  return Promise.all(
    messages.map(async (message): Promise<DecodedMessage> => {
      const base = { messageId: message.messageId, sentOn: message.sentOn };
      if (message.from === 'reporter') {
        return { ...base, from: 'reporter', state: 'sealed-for-authority' };
      }
      try {
        const text = await openMailboxMessage(
          message,
          session.keys.box.privateKey,
          pinned.authoritySigningPublicKey,
          session.folio,
        );
        return { ...base, from: 'authority', state: 'opened', text };
      } catch {
        return { ...base, from: 'authority', state: 'unreadable' };
      }
    }),
  );
}

/**
 * Cifra la respuesta hacia la llave FIJADA del buzón de la autoridad y la firma, con la siguiente
 * secuencia de la persona denunciante según `messages` (los del folio, tal como llegaron).
 * Lanza error si el texto está vacío o excede `MAX_MAILBOX_TEXT_LENGTH`.
 */
export async function sealReporterReply(
  text: string,
  session: TrackingSession,
  pinned: PinnedKeys,
  messages: readonly MailboxMessage[],
): Promise<ReporterMessageRequest> {
  const sequence = nextMailboxSequence(messages, 'reporter');
  const sealed = await sealMailboxMessage(
    text,
    { keyId: pinned.set.authority.keyId, publicKey: pinned.authorityBoxPublicKey },
    session.keys.signing.privateKey,
    { folio: session.folio, from: 'reporter', sequence },
  );
  return {
    ...session.credentials,
    sequence: sealed.sequence,
    envelope: sealed.envelope,
    signature: sealed.signature,
  };
}

/** Borra de memoria las llaves privadas de la sesión. */
export function wipeTrackingSession(session: TrackingSession): void {
  session.keys.authKey.fill(0);
  session.keys.box.privateKey.fill(0);
  session.keys.signing.privateKey.fill(0);
}
