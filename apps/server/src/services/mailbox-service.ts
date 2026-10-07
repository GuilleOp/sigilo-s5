// Registro de mensajes del buzón: verifica destinatario, tamaño, firma y secuencia, guarda el sobre
// y lo anota en la bitácora.
import type { HpkeEnvelope, MailboxMessage, MailboxSender } from '@sigilo/contracts';
import {
  canonicalize,
  fromBase64Url,
  keyIdFor,
  randomBytes,
  sha256Hex,
  toDayDate,
  toHex,
  toHourDate,
  verifyMailboxSignature,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { hasMailboxShape } from './crypto-checks.ts';

/** Mensaje entrante ya validado con el esquema. */
export interface IncomingMessage {
  from: MailboxSender;
  sequence: number;
  envelope: HpkeEnvelope;
  signature: string;
}

function recipientKeyId(ctx: AppContext, complaint: ComplaintRecord, from: MailboxSender): string {
  return from === 'reporter'
    ? ctx.deps.keys.publicKeySet.authority.keyId
    : keyIdFor(fromBase64Url(complaint.reporterKeys.boxPublicKey));
}

function signerPublicKey(
  ctx: AppContext,
  complaint: ComplaintRecord,
  from: MailboxSender,
): Uint8Array {
  return from === 'reporter'
    ? fromBase64Url(complaint.reporterKeys.signingPublicKey)
    : ctx.deps.keys.authoritySigningPublicKey;
}

/**
 * Guarda un mensaje del buzón y registra `message.sent` en la misma transacción.
 * Lanza `bad_request` si el sobre no va dirigido a la contraparte, si no mide el tamaño fijo, si
 * la firma del remitente no es válida o si `sequence` no es la siguiente esperada para el
 * remitente en este folio.
 * Seguridad: la secuencia va firmada y dentro del AAD; exigir la siguiente impide repetir un
 * mensaje capturado o reordenar la conversación.
 */
export function recordMessage(
  ctx: AppContext,
  complaint: ComplaintRecord,
  incoming: IncomingMessage,
): MailboxMessage {
  const { from, sequence, envelope, signature } = incoming;
  if (envelope.keyId !== recipientKeyId(ctx, complaint, from) || !hasMailboxShape(envelope)) {
    throw new ApiFailure('bad_request');
  }
  // Seguridad: solo se aceptan mensajes firmados por quien dice enviarlos.
  const isSigned = verifyMailboxSignature(
    { from, sequence, envelope, signature },
    signerPublicKey(ctx, complaint, from),
  );
  if (!isSigned) throw new ApiFailure('bad_request');
  const now = ctx.deps.now();
  const message: MailboxMessage = {
    messageId: toHex(randomBytes(16)),
    from,
    sequence,
    sentOn: toHourDate(now),
    envelope,
    signature,
  };
  return withTransaction(ctx.deps.db, () => {
    // Dentro de la transacción, para que dos envíos simultáneos no tomen la misma secuencia.
    if (sequence !== ctx.messages.nextSequence(complaint.folio, from)) {
      throw new ApiFailure('bad_request');
    }
    ctx.ledger.record({
      type: 'message.sent',
      folio: complaint.folio,
      at: toDayDate(now),
      actorRole: from,
      payload: {
        folio: complaint.folio,
        messageId: message.messageId,
        from,
        sequence,
        envelopeDigest: sha256Hex(canonicalize(envelope)),
      },
    });
    ctx.messages.insert(complaint.folio, message);
    return message;
  });
}
