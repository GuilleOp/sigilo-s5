// Registro de mensajes del buzón: verifica la firma del remitente, guarda el sobre y lo anota.
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
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { hasMailboxShape, isEnvelopeSignatureValid } from './crypto-checks.ts';

/** Mensaje entrante ya validado con el esquema. */
export interface IncomingMessage {
  from: MailboxSender;
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
 * Lanza `bad_request` si el sobre no va dirigido a la contraparte, si su tamaño no corresponde
 * a un mensaje rellenado o si la firma del remitente no es válida.
 */
export function recordMessage(
  ctx: AppContext,
  complaint: ComplaintRecord,
  incoming: IncomingMessage,
): MailboxMessage {
  const { from, envelope, signature } = incoming;
  if (envelope.keyId !== recipientKeyId(ctx, complaint, from) || !hasMailboxShape(envelope)) {
    throw new ApiFailure('bad_request');
  }
  // Seguridad: solo se aceptan mensajes firmados por quien dice enviarlos.
  if (!isEnvelopeSignatureValid(envelope, signature, signerPublicKey(ctx, complaint, from))) {
    throw new ApiFailure('bad_request');
  }
  const now = ctx.deps.now();
  const message: MailboxMessage = {
    messageId: toHex(randomBytes(16)),
    from,
    sentOn: toHourDate(now),
    envelope,
    signature,
  };
  return withTransaction(ctx.deps.db, () => {
    const event = ctx.ledger.append({
      type: 'message.sent',
      folio: complaint.folio,
      at: toDayDate(now),
      actorRole: from,
      payload: {
        folio: complaint.folio,
        messageId: message.messageId,
        from,
        envelopeDigest: sha256Hex(canonicalize(envelope)),
      },
    });
    ctx.messages.insert(complaint.folio, message, event.seq);
    return message;
  });
}
