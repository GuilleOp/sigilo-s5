// Mensajes del buzón: cifrados hacia el destinatario, firmados por el remitente y ligados al folio.
import { FolioSchema, MailboxSenderSchema } from '@sigilo/contracts';
import type { HpkeEnvelope, MailboxSender } from '@sigilo/contracts';
import { canonicalize } from './canonical-json.ts';
import { fromBase64Url, toBase64Url, utf8Decode, utf8Encode } from './encoding.ts';
import type { EnvelopeRecipient } from './envelope.ts';
import { openEnvelope, sealToPublicKey } from './envelope.ts';
import { padToBlock, unpad } from './padding.ts';
import { sign, verify } from './signing.ts';

/** Contexto al que queda ligado un mensaje: folio y rol del remitente. */
export interface MailboxBinding {
  folio: string;
  from: MailboxSender;
}

/** Mensaje sellado: sobre HPKE y firma Ed25519 (Base64URL) sobre su forma canónica. */
export interface SealedMailboxMessage {
  envelope: HpkeEnvelope;
  signature: string;
}

const MAILBOX_BLOCK_SIZE = 512;
const OPEN_ERROR = 'No se pudo abrir el sobre.';

function mailboxAad(binding: MailboxBinding): Uint8Array {
  const folio = FolioSchema.parse(binding.folio);
  const from = MailboxSenderSchema.parse(binding.from);
  return utf8Encode(`sigilo/v1/mailbox:${folio}:${from}`);
}

/**
 * Cifra el texto (rellenado a múltiplos de 512 bytes) y firma el sobre con la llave del remitente.
 * Seguridad: el AAD liga el sobre al folio y al remitente, lo que impide reutilizarlo en otra
 * conversación o atribuirlo a la otra parte. Lanza error si el folio o el remitente son inválidos.
 */
export async function sealMailboxMessage(
  text: string,
  recipient: EnvelopeRecipient,
  senderSigningPrivateKey: Uint8Array,
  binding: MailboxBinding,
): Promise<SealedMailboxMessage> {
  const aad = mailboxAad(binding);
  const padded = padToBlock(utf8Encode(text), MAILBOX_BLOCK_SIZE);
  const envelope = await sealToPublicKey(padded, recipient, aad);
  const signature = sign(utf8Encode(canonicalize(envelope)), senderSigningPrivateKey);
  return { envelope, signature: toBase64Url(signature) };
}

/**
 * Verifica la firma del remitente y después abre el mensaje.
 * Seguridad: se verifica antes de descifrar y todo fallo produce el mismo error genérico.
 */
export async function openMailboxMessage(
  message: SealedMailboxMessage,
  recipientPrivateKey: Uint8Array,
  senderSigningPublicKey: Uint8Array,
  binding: MailboxBinding,
): Promise<string> {
  try {
    const aad = mailboxAad(binding);
    const signed = utf8Encode(canonicalize(message.envelope));
    if (!verify(fromBase64Url(message.signature), signed, senderSigningPublicKey)) {
      throw new Error(OPEN_ERROR);
    }
    const padded = await openEnvelope(message.envelope, recipientPrivateKey, aad);
    if (padded.length % MAILBOX_BLOCK_SIZE !== 0) throw new Error(OPEN_ERROR);
    return utf8Decode(unpad(padded));
  } catch {
    throw new Error(OPEN_ERROR);
  }
}
