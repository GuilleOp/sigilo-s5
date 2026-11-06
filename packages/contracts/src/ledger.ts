// Bitácora de solo agregar: cadena de hashes con cabeza firmada y anclada fuera del sistema.
import { z } from 'zod';
import { Base64UrlSchema, DayDateSchema, KeyIdSchema, Sha256HexSchema } from './primitives.ts';

export const LedgerEventTypeSchema = z
  .enum([
    'complaint.received',
    'complaint.status_changed',
    'identity.opened',
    'message.sent',
    'evidence.discarded',
    'identity.approved',
    'rule.triggered',
    'complaint.transferred',
    'audit.signal',
    'closures.imported',
    'appeal.filed',
    'identity.released',
    'corroboration.viewed',
    'corroboration.confirmed',
    'corroboration.withdrawn',
  ])
  .meta({
    description:
      'Tipo de evento: recepción, cambio de estatus o trámite, apertura de identidad, mensaje, descarte de pruebas, aprobación de una apertura, regla pública cumplida, turnado a otro nodo o señal del auditor.',
  });
export type LedgerEventType = z.infer<typeof LedgerEventTypeSchema>;

/** Hash del primer eslabón: 64 ceros. */
export const LEDGER_GENESIS_HASH = '0'.repeat(64);

/**
 * Evento publicado. Los eventos de un día no reciben `seq` ni se encadenan hasta que el día
 * cierra; entonces se encadenan en orden barajado, así el orden no revela la hora de llegada.
 */
export const LedgerEventSchema = z
  .object({
    seq: z.number().int().nonnegative().meta({ description: 'Posición del evento en la cadena.' }),
    type: LedgerEventTypeSchema,
    /** SHA-256 de "sigilo/ledger/folio:" + folio. El folio no se publica. */
    folioDigest: Sha256HexSchema.meta({
      description: 'SHA-256 de "sigilo/ledger/folio:" + folio; el folio no se publica.',
    }),
    at: DayDateSchema.meta({ description: 'Día del evento (UTC).' }),
    actorRole: z
      .enum(['system', 'authority', 'reporter'])
      .meta({ description: 'Quién originó el evento: system, authority o reporter.' }),
    /** SHA-256 de la forma canónica de los datos del evento; identifica al evento. */
    payloadDigest: Sha256HexSchema.meta({
      description: 'SHA-256 de la forma canónica de los datos del evento; lo identifica.',
    }),
    /**
     * Solo en `identity.opened`: `sha256Hex("sigilo/ledger/receipt:" + authVerifier)`. Permite a la
     * persona denunciante encontrar en la bitácora pública toda apertura ligada a su recibo, sin
     * importar el folio con que se registró. Forma parte del hash del evento.
     */
    receiptTag: Sha256HexSchema.optional().meta({
      description:
        'Solo en identity.opened e identity.released: SHA-256 de "sigilo/ledger/receipt:" + authVerifier, para que la persona encuentre las aperturas y las entregas ligadas a su recibo.',
    }),
    prevHash: Sha256HexSchema.meta({
      description: 'Hash del evento anterior (64 ceros en el primero).',
    }),
    /** SHA-256 de la forma canónica del evento sin este campo. */
    hash: Sha256HexSchema.meta({
      description: 'SHA-256 de la forma canónica del evento sin este campo.',
    }),
  })
  .superRefine((event, ctx) => {
    const isTagged = event.type === 'identity.opened' || event.type === 'identity.released';
    if (isTagged !== (event.receiptTag !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['receiptTag'],
        message: 'Solo identity.opened e identity.released llevan receiptTag, y siempre.',
      });
    }
  })
  .meta({
    description:
      'Evento público de la bitácora. Los eventos de un día se encadenan al cerrar el día, en orden barajado.',
  });
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export const SignedLedgerHeadSchema = z
  .object({
    seq: z
      .number()
      .int()
      .nonnegative()
      .meta({ description: 'Secuencia del último evento del último día publicado completo.' }),
    hash: Sha256HexSchema.meta({ description: 'Hash de ese evento.' }),
    at: DayDateSchema.meta({ description: 'Día de ese evento.' }),
    serverKeyId: KeyIdSchema,
    /** Firma Ed25519 sobre la forma canónica de { seq, hash, at, serverKeyId }. */
    signature: Base64UrlSchema.meta({
      description: 'Firma Ed25519 sobre la forma canónica de { seq, hash, at, serverKeyId }.',
    }),
  })
  .meta({ description: 'Cabeza pública firmada de la bitácora.' });
export type SignedLedgerHead = z.infer<typeof SignedLedgerHeadSchema>;

export const LedgerPageSchema = z
  .object({
    events: z
      .array(LedgerEventSchema)
      .meta({ description: 'Eventos encadenados de la página, en orden.' }),
    head: SignedLedgerHeadSchema,
  })
  .meta({ description: 'Página de la bitácora con la cabeza firmada vigente.' });
export type LedgerPage = z.infer<typeof LedgerPageSchema>;

/**
 * Anclaje de la cabeza pública, versionado en `anchors/AAAA-MM-DD.json` fuera del servidor.
 * Una reescritura de la bitácora deja de coincidir con las cabezas ya ancladas.
 */
export const LedgerAnchorSchema = z.object({
  version: z.literal(1),
  /** Día (UTC) en que se tomó el anclaje. */
  anchoredOn: DayDateSchema,
  head: SignedLedgerHeadSchema,
});
export type LedgerAnchor = z.infer<typeof LedgerAnchorSchema>;
