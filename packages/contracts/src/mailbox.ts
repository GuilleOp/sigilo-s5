// Buzón anónimo bidireccional. El servidor solo almacena sobres cifrados.
import { z } from 'zod';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { Base64UrlSchema, HourDateSchema } from './primitives.ts';

export const MailboxSenderSchema = z.enum(['authority', 'reporter']);
export type MailboxSender = z.infer<typeof MailboxSenderSchema>;

/**
 * Número de mensaje por remitente dentro de un folio: 0 para el primero y consecutivo después.
 * Va dentro del AAD y de la firma, así que un mensaje no se puede repetir ni reordenar.
 */
export const MailboxSequenceSchema = z.number().int().nonnegative();
export type MailboxSequence = z.infer<typeof MailboxSequenceSchema>;

export const MailboxMessageSchema = z.object({
  messageId: z.string().regex(/^[0-9a-f]{32}$/),
  from: MailboxSenderSchema,
  sequence: MailboxSequenceSchema,
  sentOn: HourDateSchema,
  envelope: HpkeEnvelopeSchema,
  /** Firma Ed25519 del remitente sobre la forma canónica de `{ envelope, from, sequence }`. */
  signature: Base64UrlSchema,
});
export type MailboxMessage = z.infer<typeof MailboxMessageSchema>;
