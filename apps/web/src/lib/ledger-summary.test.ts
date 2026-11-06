// Pruebas del resumen de la bitácora verificada.
import { describe, expect, it } from 'vitest';
import type { LedgerEvent, LedgerEventType } from '@sigilo/contracts';
import { summarizeLedger } from './ledger-summary.ts';

function event(seq: number, type: LedgerEventType): LedgerEvent {
  const tagged = type === 'identity.opened' || type === 'identity.released';
  return {
    seq,
    type,
    folioDigest: 'a'.repeat(64),
    at: '2026-10-01',
    actorRole: 'system',
    payloadDigest: 'b'.repeat(64),
    ...(tagged ? { receiptTag: 'c'.repeat(64) } : {}),
    prevHash: '0'.repeat(64),
    hash: 'd'.repeat(64),
  };
}

describe('summarizeLedger', () => {
  it('cuenta en cero una bitácora vacía', () => {
    expect(summarizeLedger([])).toEqual({
      complaints: 0,
      identitiesOpened: 0,
      identitiesReleased: 0,
    });
  });

  it('cuenta denuncias, aperturas y entregas, e ignora los demás eventos', () => {
    const events = [
      event(1, 'complaint.received'),
      event(2, 'complaint.received'),
      event(3, 'identity.approved'),
      event(4, 'identity.opened'),
      event(5, 'message.sent'),
      event(6, 'identity.released'),
      event(7, 'complaint.received'),
    ];
    expect(summarizeLedger(events)).toEqual({
      complaints: 3,
      identitiesOpened: 1,
      identitiesReleased: 1,
    });
  });
});
