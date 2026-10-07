// Bitácora de solo agregar: cadena de hashes con cabeza firmada y anclada fuera del sistema.
import { z } from 'zod';
import { Base64UrlSchema, DayDateSchema, KeyIdSchema, Sha256HexSchema } from './primitives.ts';

export const LedgerEventTypeSchema = z.enum([
  'complaint.received',
  'complaint.status_changed',
  'identity.opened',
  'message.sent',
]);
export type LedgerEventType = z.infer<typeof LedgerEventTypeSchema>;

/** Hash del primer eslabón: 64 ceros. */
export const LEDGER_GENESIS_HASH = '0'.repeat(64);

export const LedgerEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  type: LedgerEventTypeSchema,
  /** SHA-256 de "sigilo/ledger/folio:" + folio. El folio no se pública. */
  folioDigest: Sha256HexSchema,
  at: DayDateSchema,
  actorRole: z.enum(['system', 'authority', 'reporter']),
  /** SHA-256 de la forma canónica de los datos del evento. */
  payloadDigest: Sha256HexSchema,
  prevHash: Sha256HexSchema,
  /** SHA-256 de la forma canónica del evento sin este campo. */
  hash: Sha256HexSchema,
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
