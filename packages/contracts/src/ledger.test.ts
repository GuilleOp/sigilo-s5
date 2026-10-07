// Pruebas del evento de la bitácora: la etiqueta del recibo solo en las aperturas de identidad.
import { describe, expect, it } from 'vitest';
import { LedgerEventSchema } from './ledger.ts';
import type { LedgerEvent } from './ledger.ts';

const EVENT: LedgerEvent = {
  seq: 0,
  type: 'complaint.received',
  folioDigest: 'a'.repeat(64),
  at: '2026-10-06',
  actorRole: 'system',
  payloadDigest: 'b'.repeat(64),
  prevHash: '0'.repeat(64),
  hash: 'c'.repeat(64),
};

describe('LedgerEventSchema', () => {
  it('acepta receiptTag solo en identity.opened, donde es obligatoria', () => {
    expect(LedgerEventSchema.safeParse(EVENT).success).toBe(true);
    expect(LedgerEventSchema.safeParse({ ...EVENT, receiptTag: 'd'.repeat(64) }).success).toBe(
      false,
    );
    const opened = { ...EVENT, type: 'identity.opened', actorRole: 'authority' };
    expect(LedgerEventSchema.safeParse(opened).success).toBe(false);
    expect(LedgerEventSchema.safeParse({ ...opened, receiptTag: 'd'.repeat(64) }).success).toBe(
      true,
    );
    expect(LedgerEventSchema.safeParse({ ...opened, receiptTag: 'xyz' }).success).toBe(false);
  });
});
