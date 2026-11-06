// Seguimiento por parte de la persona denunciante con folio y llave derivada del recibo.
import { z } from 'zod';
import { ComplaintModeSchema, ComplaintStatusSchema, SignedReceiptSchema } from './complaint.ts';
import { HpkeEnvelopeSchema } from './envelope.ts';
import { LedgerEventSchema } from './ledger.ts';
import { MailboxMessageSchema, MailboxSequenceSchema } from './mailbox.ts';
import { Base64UrlSchema, DayDateSchema, FolioSchema } from './primitives.ts';
import { ProcedureViewSchema } from './procedure-view.ts';

export const TrackingCredentialsSchema = z
  .strictObject({
    folio: FolioSchema,
    /** Llave de autenticación derivada del recibo (nunca el recibo). */
    authKey: Base64UrlSchema.meta({
      description: 'Llave de autenticación derivada del recibo en el navegador; nunca el recibo.',
    }),
  })
  .meta({ description: 'Credenciales de seguimiento: folio y llave derivada del recibo.' });
export type TrackingCredentials = z.infer<typeof TrackingCredentialsSchema>;

export const TimelineEntrySchema = z
  .object({
    status: ComplaintStatusSchema,
    on: DayDateSchema.meta({ description: 'Día del cambio de estatus.' }),
  })
  .meta({ description: 'Cambio de estatus en la línea de tiempo.' });
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

/** Identificador aleatorio de una apertura de identidad (16 bytes en hexadecimal). */
export const OpeningIdSchema = z
  .string()
  .regex(/^[0-9a-f]{32}$/, 'Identificador inválido')
  .meta({
    description: 'Identificador aleatorio de una apertura de identidad (16 bytes en hexadecimal).',
  });

/**
 * Cada apertura de la identidad sellada queda visible para la persona denunciante de inmediato,
 * aunque su evento `identity.opened` se publique hasta que cierre el día. Con `openingId` y
 * `legalBasis` la persona recalcula el `payloadDigest` del evento (`identityOpenedPayloadDigest`).
 */
export const IdentityAccessEntrySchema = z
  .object({
    on: DayDateSchema.meta({ description: 'Día de la apertura.' }),
    actorRole: z.enum(['authority', 'reporter']).meta({
      description:
        'Quién abrió la identidad: authority (2 de 3) o reporter (la persona, para su inconformidad).',
    }),
    legalBasis: z.string().meta({ description: 'Fundamento legal y motivo que dio la autoridad.' }),
    openingId: OpeningIdSchema,
    approvalCount: z.number().int().min(1).optional().meta({
      description: 'Personas distintas de la autoridad que aprobaron la apertura.',
    }),
  })
  .meta({
    description:
      'Apertura de la identidad sellada, visible para la persona denunciante de inmediato.',
  });
export type IdentityAccessEntry = z.infer<typeof IdentityAccessEntrySchema>;

/**
 * Descarte de pruebas por la autoridad, visible para la persona denunciante de inmediato aunque su
 * evento `evidence.discarded` se publique hasta que cierre el día.
 */
export const EvidenceDiscardEntrySchema = z
  .object({
    on: DayDateSchema.meta({ description: 'Día del descarte.' }),
    count: z.number().int().positive().meta({ description: 'Número de pruebas descartadas.' }),
  })
  .meta({ description: 'Descarte de pruebas por la autoridad.' });
export type EvidenceDiscardEntry = z.infer<typeof EvidenceDiscardEntrySchema>;

export const TrackingViewSchema = z
  .object({
    folio: FolioSchema,
    mode: ComplaintModeSchema,
    status: ComplaintStatusSchema,
    timeline: z
      .array(TimelineEntrySchema)
      .meta({ description: 'Historia de estatus, del más antiguo al más reciente.' }),
    identityAccess: z
      .array(IdentityAccessEntrySchema)
      .meta({ description: 'Aperturas de la identidad sellada.' }),
    /** Descartes de pruebas por la autoridad, en el orden en que ocurrieron. */
    evidenceDiscards: z.array(EvidenceDiscardEntrySchema).optional().meta({
      description: 'Descartes de pruebas por la autoridad, en el orden en que ocurrieron.',
    }),
    messages: z.array(MailboxMessageSchema).meta({ description: 'Mensajes del buzón, cifrados.' }),
    /** Entregas del sobre de identidad a una cuenta de la autoridad (evento identity.released). */
    identityReleases: z
      .array(
        z.object({
          on: DayDateSchema.meta({ description: 'Día de la entrega.' }),
          openingId: OpeningIdSchema,
        }),
      )
      .optional()
      .meta({
        description:
          'Entregas del sobre de identidad a una persona de la autoridad, cada una con su evento público identity.released.',
      }),
    receipt: SignedReceiptSchema,
    /**
     * Evento `complaint.received` ya publicado (encadenado al cerrar su día). Falta mientras está
     * pendiente de publicar. El cliente comprueba que corresponda a su comprobante (`folioDigest`,
     * `payloadDigest` y fecha) y lo busca en la bitácora pública con `ledgerEvents?from=<seq>&limit=1`.
     */
    receivedEvent: LedgerEventSchema.optional(),
    /** Línea de tiempo del trámite con explicaciones, plazos legales y reglas cumplidas. */
    procedure: ProcedureViewSchema.optional(),
  })
  .meta({ description: 'Seguimiento de la denuncia para la persona denunciante.' });
export type TrackingView = z.infer<typeof TrackingViewSchema>;

/**
 * Inconformidad contra la calificación de no grave (LGRA, arts. 102 a 110). La ley pide nombre,
 * domicilio y firma (art. 109): la persona acepta abrir su identidad sellada solo para el recurso.
 */
export const AppealRequestSchema = TrackingCredentialsSchema.extend({
  reasons: z
    .string()
    .min(20)
    .max(5000)
    .meta({ description: 'Motivos por los que estima indebida la calificación (LGRA, art. 104).' }),
  revealIdentityForAppeal: z.literal(true).meta({
    description:
      'Acepta que la autoridad investigadora abra su identidad sellada solo para el recurso (LGRA, art. 109).',
  }),
}).meta({
  description: 'Recurso de inconformidad de la persona denunciante, con sus credenciales.',
});
export type AppealRequest = z.infer<typeof AppealRequestSchema>;

export const AppealResponseSchema = z
  .object({
    filedOn: DayDateSchema.meta({ description: 'Día de presentación.' }),
    openingId: OpeningIdSchema,
    resolutionDueOn: z.string().optional().meta({
      description: 'Plazo de la Sala para resolver (30 días hábiles, LGRA art. 107).',
    }),
  })
  .meta({ description: 'Inconformidad registrada y apertura de identidad para el recurso.' });
export type AppealResponse = z.infer<typeof AppealResponseSchema>;

export const ReporterMessageRequestSchema = TrackingCredentialsSchema.extend({
  sequence: MailboxSequenceSchema,
  envelope: HpkeEnvelopeSchema,
  signature: Base64UrlSchema.meta({
    description:
      'Firma Ed25519 con la llave derivada del recibo sobre { envelope, from, sequence }.',
  }),
}).meta({ description: 'Mensaje de la persona denunciante por el buzón, con sus credenciales.' });
export type ReporterMessageRequest = z.infer<typeof ReporterMessageRequestSchema>;
