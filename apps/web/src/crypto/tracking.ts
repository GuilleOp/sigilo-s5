// Seguimiento: derivación de llaves desde el recibo, comprobante y buzón cifrado.
import type {
  MailboxMessage,
  ReporterMessageRequest,
  TrackingCredentials,
  TrackingView,
} from '@sigilo/contracts';
import {
  deriveReceiptKeys,
  openMailboxMessage,
  phraseToEntropy,
  sealMailboxMessage,
  toBase64Url,
  verifyReceipt,
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
 * Lanza error (sin citar palabras) si alguna no está en la lista.
 */
export function startTrackingSession(folio: string, words: readonly string[]): TrackingSession {
  const entropy = phraseToEntropy(words);
  const keys = deriveReceiptKeys(entropy);
  entropy.fill(0);
  return { folio, keys, credentials: { folio, authKey: toBase64Url(keys.authKey) } };
}

/** Comprueba que el comprobante de la vista esté firmado por el servidor y sea de este folio. */
export function verifyTrackingReceipt(view: TrackingView, pinned: PinnedKeys): boolean {
  return (
    view.receipt.folio === view.folio && verifyReceipt(view.receipt, pinned.serverSigningPublicKey)
  );
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
          { folio: session.folio, from: 'authority' },
        );
        return { ...base, from: 'authority', state: 'opened', text };
      } catch {
        return { ...base, from: 'authority', state: 'unreadable' };
      }
    }),
  );
}

/** Cifra la respuesta hacia la llave FIJADA del buzón de la autoridad y la firma. */
export async function sealReporterReply(
  text: string,
  session: TrackingSession,
  pinned: PinnedKeys,
): Promise<ReporterMessageRequest> {
  const sealed = await sealMailboxMessage(
    text,
    { keyId: pinned.set.authority.keyId, publicKey: pinned.authorityBoxPublicKey },
    session.keys.signing.privateKey,
    { folio: session.folio, from: 'reporter' },
  );
  return { ...session.credentials, envelope: sealed.envelope, signature: sealed.signature };
}

/** Borra de memoria las llaves privadas de la sesión. */
export function wipeTrackingSession(session: TrackingSession): void {
  session.keys.authKey.fill(0);
  session.keys.box.privateKey.fill(0);
  session.keys.signing.privateKey.fill(0);
}
