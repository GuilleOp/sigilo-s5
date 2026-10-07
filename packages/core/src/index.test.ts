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
  'equalBytes',
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
  'computeAuthVerifier',
  'generateBoxKeyPair',
  'generateSigningKeyPair',
  'keyIdFor',
  'assertBoxKeyPair',
  'assertSigningKeyPair',
  'buildPublicKeySet',
  'sign',
  'verify',
  'sealToPublicKey',
  'openEnvelope',
  'envelopePlaintextLength',
  'padToBlock',
  'unpad',
  'computeContentDigest',
  'identityContextFor',
  'identityContextFromDetail',
  'sealIdentity',
  'openIdentity',
  'sealMailboxMessage',
  'openMailboxMessage',
  'verifyMailboxSignature',
  'isMailboxSequenceComplete',
  'nextMailboxSequence',
  'computeSubmissionDigest',
  'signReceipt',
  'verifyReceipt',
  'folioDigest',
  'computeEventHash',
  'buildEvent',
  'verifyChain',
  'signLedgerHead',
  'verifyLedgerHead',
  'receivedPayloadDigest',
  'verifyReceiptEvent',
];

describe('@sigilo/core', () => {
  it('exporta todas las funciones del contrato', () => {
    const exported = core as unknown as Record<string, unknown>;
    for (const name of EXPECTED_FUNCTIONS) {
      expect(typeof exported[name], name).toBe('function');
    }
    expect(core.RECEIPT_WORD_COUNT).toBe(8);
    expect(core.IDENTITY_PADDED_SIZE).toBe(4096);
    expect(core.MAILBOX_PADDED_SIZE).toBe(4096);
    expect(core.MAX_MAILBOX_TEXT_LENGTH).toBe(1000);
    expect(new core.ReceiptPhraseError('x', 1)).toBeInstanceOf(Error);
  });
});
