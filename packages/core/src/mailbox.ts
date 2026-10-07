// Mensajes del buzón: cifrados hacia el destinatario, firmados por el remitente y ligados al folio,
// al remitente y a su número de secuencia; con relleno a tamaño fijo.
import { FolioSchema, MailboxSenderSchema, MailboxSequenceSchema } from '@sigilo/contracts';
import type { HpkeEnvelope, MailboxSender } from '@sigilo/contracts';
import { canonicalize } from './canonical-json.ts';
import { fromBase64Url, toBase64Url, utf8Decode, utf8Encode } from './encoding.ts';
import type { EnvelopeRecipient } from './envelope.ts';
import { openEnvelope, sealToPublicKey } from './envelope.ts';
import { padToBlock, unpad } from './padding.ts';
import { sign, verify } from './signing.ts';

/** Tamaño fijo del texto en claro de todo mensaje, con relleno. */
export const MAILBOX_PADDED_SIZE = 4096;

/**
 * Longitud máxima del texto en unidades UTF-16 (`string.length`). Cada unidad ocupa a lo más
 * 3 bytes en UTF-8, así que cualquier texto de esta longitud cabe en el relleno fijo.
 */
export const MAX_MAILBOX_TEXT_LENGTH = 1000;

/** Contexto al que queda ligado un mensaje: folio, rol del remitente y número de secuencia. */
export interface MailboxBinding {
  folio: string;
  from: MailboxSender;
  /** Mensajes previos del mismo remitente en este folio (0 para el primero). */
  sequence: number;
}

/** Mensaje sellado: sobre HPKE y firma Ed25519 (Base64URL) del remitente. */
export interface SealedMailboxMessage {
  from: MailboxSender;
  sequence: number;
  envelope: HpkeEnvelope;
  signature: string;
}

/** Datos de un mensaje que bastan para verificar su firma. */
export type SignedMailboxFields = Pick<
  SealedMailboxMessage,
  'from' | 'sequence' | 'envelope' | 'signature'
>;

const OPEN_ERROR = 'No se pudo abrir el sobre.';
const SIGNATURE_LENGTH = 64;
const LENGTH_PREFIX_BYTES = 4;

function mailboxAad(binding: MailboxBinding): Uint8Array {
  const folio = FolioSchema.parse(binding.folio);
  const from = MailboxSenderSchema.parse(binding.from);
  const sequence = MailboxSequenceSchema.parse(binding.sequence);
  return utf8Encode(`sigilo/v1/mailbox:${folio}:${from}:${sequence}`);
}

function signedBytes(fields: Omit<SignedMailboxFields, 'signature'>): Uint8Array {
  const { envelope, from, sequence } = fields;
  return utf8Encode(canonicalize({ envelope, from, sequence }));
}

function encodeText(text: string): Uint8Array {
  if (text.length === 0) throw new Error('El mensaje no puede estar vacío.');
  if (text.length > MAX_MAILBOX_TEXT_LENGTH) {
    throw new Error(`El mensaje no puede exceder ${MAX_MAILBOX_TEXT_LENGTH} caracteres.`);
  }
  const bytes = utf8Encode(text);
  // Con el límite en unidades UTF-16 esto no ocurre; se conserva como invariante del relleno fijo.
  if (bytes.length + LENGTH_PREFIX_BYTES > MAILBOX_PADDED_SIZE) {
    throw new Error(`El mensaje no puede exceder ${MAX_MAILBOX_TEXT_LENGTH} caracteres.`);
  }
  return bytes;
}

/**
 * Verifica la firma Ed25519 del remitente sobre `canonicalize({ envelope, from, sequence })`.
 * Devuelve `false` ante cualquier entrada mal formada. La usa el servidor antes de guardar un
 * mensaje y el destinatario antes de descifrarlo.
 */
export function verifyMailboxSignature(
  message: SignedMailboxFields,
  publicKey: Uint8Array,
): boolean {
  try {
    const signature = fromBase64Url(message.signature);
    if (signature.length !== SIGNATURE_LENGTH) return false;
    MailboxSenderSchema.parse(message.from);
    MailboxSequenceSchema.parse(message.sequence);
    return verify(signature, signedBytes(message), publicKey);
  } catch {
    return false;
  }
}

/**
 * Cifra el texto rellenado a 4096 bytes y firma el sobre con la llave del remitente.
 * Seguridad: el relleno fijo oculta la longitud; el AAD liga el sobre al folio, al remitente y a
 * la secuencia, lo que impide reutilizarlo en otra conversación, atribuirlo a la otra parte,
 * repetirlo o reordenarlo. Lanza error si el texto está vacío o excede
 * `MAX_MAILBOX_TEXT_LENGTH`, o si el folio, el remitente o la secuencia son inválidos.
 */
export async function sealMailboxMessage(
  text: string,
  recipient: EnvelopeRecipient,
  senderSigningPrivateKey: Uint8Array,
  binding: MailboxBinding,
): Promise<SealedMailboxMessage> {
  const aad = mailboxAad(binding);
  const padded = padToBlock(encodeText(text), MAILBOX_PADDED_SIZE);
  const envelope = await sealToPublicKey(padded, recipient, aad);
  const { from, sequence } = binding;
  const signature = sign(signedBytes({ envelope, from, sequence }), senderSigningPrivateKey);
  return { from, sequence, envelope, signature: toBase64Url(signature) };
}

/**
 * Verifica la firma del remitente y después abre el mensaje del `folio` indicado. El remitente y
 * la secuencia salen del propio mensaje y están cubiertos por la firma y el AAD.
 * Seguridad: se verifica antes de descifrar y todo fallo produce el mismo error genérico.
 */
export async function openMailboxMessage(
  message: SignedMailboxFields,
  recipientPrivateKey: Uint8Array,
  senderSigningPublicKey: Uint8Array,
  folio: string,
): Promise<string> {
  try {
    if (!verifyMailboxSignature(message, senderSigningPublicKey)) throw new Error(OPEN_ERROR);
    const aad = mailboxAad({ folio, from: message.from, sequence: message.sequence });
    const padded = await openEnvelope(message.envelope, recipientPrivateKey, aad);
    if (padded.length !== MAILBOX_PADDED_SIZE) throw new Error(OPEN_ERROR);
    return utf8Decode(unpad(padded));
  } catch {
    throw new Error(OPEN_ERROR);
  }
}

/**
 * Indica si, para cada remitente, las secuencias aparecen como 0, 1, 2… en el orden dado.
 * Permite a quien lee detectar que el servidor omitió, repitió o reordenó mensajes.
 */
export function isMailboxSequenceComplete(
  messages: readonly Pick<SealedMailboxMessage, 'from' | 'sequence'>[],
): boolean {
  const next: Record<MailboxSender, number> = { authority: 0, reporter: 0 };
  for (const message of messages) {
    if (message.sequence !== next[message.from]) return false;
    next[message.from] += 1;
  }
  return true;
}

/** Siguiente secuencia de `from` dados los mensajes ya existentes del folio. */
export function nextMailboxSequence(
  messages: readonly Pick<SealedMailboxMessage, 'from'>[],
  from: MailboxSender,
): number {
  return messages.filter((message) => message.from === from).length;
}
