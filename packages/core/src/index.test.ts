// Comprueba que el punto de entrada expone el contrato de docs/interfaces.md.
import { describe, expect, it } from 'vitest';
import * as core from './index.ts';

const EXPECTED_FUNCTIONS = [
  'toBase64Url',
  'fromBase64Url',
  'toHex',
  'fromHex',
  'utf8Encode',
  'utf8Decode',
  'randomBytes',
  'canonicalize',
  'sha256Hex',
  'toDayDate',
  'toHourDate',
  'generateFolio',
  'isFolio',
  'generateReceiptPhrase',
  'phraseToEntropy',
  'normalizeWord',
  'completeWord',
  'deriveReceiptKeys',
  'generateBoxKeyPair',
  'generateSigningKeyPair',
  'keyIdFor',
  'sign',
  'verify',
  'sealToPublicKey',
  'openEnvelope',
  'padToBlock',
  'unpad',
  'sealIdentity',
  'openIdentity',
  'sealMailboxMessage',
  'openMailboxMessage',
  'computeSubmissionDigest',
  'signReceipt',
  'verifyReceipt',
  'folioDigest',
  'computeEventHash',
  'buildEvent',
  'verifyChain',
  'signLedgerHead',
  'verifyLedgerHead',
];

describe('@sigilo/core', () => {
  it('exporta todas las funciones del contrato', () => {
    const exported = core as unknown as Record<string, unknown>;
    for (const name of EXPECTED_FUNCTIONS) {
      expect(typeof exported[name], name).toBe('function');
    }
    expect(core.RECEIPT_WORD_COUNT).toBe(8);
  });
});
