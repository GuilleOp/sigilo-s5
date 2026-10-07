// Seguimiento: derivación de llaves desde el recibo, comprobante, evento de la bitácora y buzón.
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import type {
  LedgerPage,
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
  sealMailboxMessage,
  toBase64Url,
  verifyReceipt,
  verifyReceiptEvent,
} from '@sigilo/core';
import type { ReceiptKeys } from '@sigilo/core';
import type { PinnedKeys } from '../config/pinned-keys.ts';

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

/** Resultado de comprobar el comprobante y su evento en la bitácora. */
export interface TrackingReceiptCheck {
  /** El comprobante es de este folio y lo firmó la llave fijada del servidor. */
  isReceiptValid: boolean;
  /** El evento `complaint.received` corresponde al comprobante (seq, fecha y digestos). */
  isEventValid: boolean;
}

/** Comprueba el comprobante firmado y que el evento de recepción corresponda a él. */
export function verifyTrackingReceipt(
  view: TrackingView,
  pinned: PinnedKeys,
): TrackingReceiptCheck {
  const isReceiptValid =
    view.receipt.folio === view.folio && verifyReceipt(view.receipt, pinned.serverSigningPublicKey);
  return {
    isReceiptValid,
    isEventValid: isReceiptValid && verifyReceiptEvent(view.receivedEvent, view.receipt),
  };
}

/**
 * Estado del evento de recepción en la bitácora pública: publicado e idéntico, todavía no
 * publicado (se publica al día siguiente) o distinto del que entregó el seguimiento.
 */
export type PublicationStatus = 'published' | 'pending' | 'mismatch';

/**
 * Busca el evento de recepción en la bitácora pública y lo compara con `view.receivedEvent`.
 * Seguridad: una página vacía es normal el mismo día; pero si la cabeza pública ya pasó de esa
 * secuencia y el evento no aparece, el servidor está mostrando algo distinto a cada quien.
 */
export async function checkPublishedEvent(
  view: TrackingView,
  fetchPage: (from: number, limit: number) => Promise<LedgerPage>,
): Promise<PublicationStatus> {
  const seq = view.receipt.ledgerSeq;
  const page = await fetchPage(seq, 1);
  const published = page.events[0];
  if (published === undefined) {
    const isPastHead = page.head.hash !== LEDGER_GENESIS_HASH && page.head.seq >= seq;
    return isPastHead ? 'mismatch' : 'pending';
  }
  return canonicalize(published) === canonicalize(view.receivedEvent) ? 'published' : 'mismatch';
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
