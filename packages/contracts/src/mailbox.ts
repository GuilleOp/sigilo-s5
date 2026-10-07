// Buzón anónimo bidireccional. El servidor solo almacena sobres cifrados.
import { z } from 'zod';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { Base64UrlSchema, HourDateSchema } from './primitives.ts';

export const MailboxSenderSchema = z.enum(['authority', 'reporter']);
export type MailboxSender = z.infer<typeof MailboxSenderSchema>;

export const MailboxMessageSchema = z.object({
  messageId: z.string().regex(/^[0-9a-f]{32}$/),
  from: MailboxSenderSchema,
  sentOn: HourDateSchema,
  envelope: HpkeEnvelopeSchema,
  /** Firma Ed25519 del remitente sobre la forma canónica del sobre. */
  signature: Base64UrlSchema,
});
export type MailboxMessage = z.infer<typeof MailboxMessageSchema>;
