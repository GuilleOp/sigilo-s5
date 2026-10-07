// Bitácora de solo agregar: cadena de hashes con cabeza firmada y anclada fuera del sistema.
import { z } from 'zod';
import { Base64UrlSchema, DayDateSchema, KeyIdSchema, Sha256HexSchema } from './primitives.ts';

export const LedgerEventTypeSchema = z.enum([
  'complaint.received',
  'complaint.status_changed',
  'identity.opened',
  'message.sent',
  'evidence.discarded',
]);
export type LedgerEventType = z.infer<typeof LedgerEventTypeSchema>;

/** Hash del primer eslabón: 64 ceros. */
export const LEDGER_GENESIS_HASH = '0'.repeat(64);

/**
 * Evento publicado. Los eventos de un día no reciben `seq` ni se encadenan hasta que el día
 * cierra; entonces se encadenan en orden barajado, así el orden no revela la hora de llegada.
 */
export const LedgerEventSchema = z
  .object({
    seq: z.number().int().nonnegative(),
    type: LedgerEventTypeSchema,
    /** SHA-256 de "sigilo/ledger/folio:" + folio. El folio no se publica. */
    folioDigest: Sha256HexSchema,
    at: DayDateSchema,
    actorRole: z.enum(['system', 'authority', 'reporter']),
    /** SHA-256 de la forma canónica de los datos del evento; identifica al evento. */
    payloadDigest: Sha256HexSchema,
    /**
     * Solo en `identity.opened`: `sha256Hex("sigilo/ledger/receipt:" + authVerifier)`. Permite a la
     * persona denunciante encontrar en la bitácora pública toda apertura ligada a su recibo, sin
     * importar el folio con que se registró. Forma parte del hash del evento.
     */
    receiptTag: Sha256HexSchema.optional(),
    prevHash: Sha256HexSchema,
    /** SHA-256 de la forma canónica del evento sin este campo. */
    hash: Sha256HexSchema,
  })
  .superRefine((event, ctx) => {
    if ((event.type === 'identity.opened') !== (event.receiptTag !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        path: ['receiptTag'],
        message: 'Solo identity.opened lleva receiptTag, y siempre.',
      });
    }
  });
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

export const SignedLedgerHeadSchema = z.object({
  seq: z.number().int().nonnegative(),
  hash: Sha256HexSchema,
  at: DayDateSchema,
  serverKeyId: KeyIdSchema,
  /** Firma Ed25519 sobre la forma canónica de { seq, hash, at, serverKeyId }. */
  signature: Base64UrlSchema,
});
export type SignedLedgerHead = z.infer<typeof SignedLedgerHeadSchema>;

export const LedgerPageSchema = z.object({
  events: z.array(LedgerEventSchema),
  head: SignedLedgerHeadSchema,
});
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
