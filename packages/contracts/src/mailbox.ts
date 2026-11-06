// Buzón anónimo bidireccional. El servidor solo almacena sobres cifrados.
import { z } from 'zod';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { Base64UrlSchema, HourDateSchema } from './primitives.ts';

export const MailboxSenderSchema = z
  .enum(['authority', 'reporter'])
  .meta({ description: 'Quién envía: authority (autoridad) o reporter (persona denunciante).' });
export type MailboxSender = z.infer<typeof MailboxSenderSchema>;

/**
 * Número de mensaje por remitente dentro de un folio: 0 para el primero y consecutivo después.
 * Va dentro del AAD y de la firma, así que un mensaje no se puede repetir ni reordenar.
 */
export const MailboxSequenceSchema = z.number().int().nonnegative().meta({
  description: 'Número de mensaje del remitente en el folio: 0 el primero y consecutivo después.',
});
export type MailboxSequence = z.infer<typeof MailboxSequenceSchema>;

export const MailboxMessageSchema = z
  .object({
    messageId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .meta({ description: 'Identificador aleatorio del mensaje (16 bytes en hexadecimal).' }),
    from: MailboxSenderSchema,
    sequence: MailboxSequenceSchema,
    sentOn: HourDateSchema.meta({
      description: 'Hora (redondeada) en que se registró el mensaje.',
    }),
    envelope: HpkeEnvelopeSchema,
    /** Firma Ed25519 del remitente sobre la forma canónica de `{ envelope, from, sequence }`. */
    signature: Base64UrlSchema.meta({
      description:
        'Firma Ed25519 del remitente sobre la forma canónica de { envelope, from, sequence }.',
    }),
  })
  .meta({ description: 'Mensaje cifrado del buzón anónimo. El servidor solo guarda el sobre.' });
export type MailboxMessage = z.infer<typeof MailboxMessageSchema>;
