// Pruebas de las firmas del nodo ante el índice, del conteo del evaluador y del folio opaco.
import { ed25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import { toBase64Url } from '@sigilo/core';
import { generateEvaluatorKeyPair } from './oprf.ts';
import {
  buildEvaluatorKey,
  folioDigestFor,
  signEvaluationCount,
  signIndexConfirmation,
  signIndexRegistration,
  signIndexWithdrawal,
  signNoticesRequest,
  verifyEvaluationCount,
  verifyIndexConfirmation,
  verifyIndexRegistration,
  verifyIndexWithdrawal,
  verifyNoticesRequest,
} from './signatures.ts';

const NODE_SEED = new Uint8Array(32).fill(1);
const NODE_PUBLIC = toBase64Url(ed25519.getPublicKey(NODE_SEED));
const OTHER_PUBLIC = toBase64Url(ed25519.getPublicKey(new Uint8Array(32).fill(2)));

describe('firmas de la corroboración', () => {
  const registration = signIndexRegistration(
    {
      nodeId: 'node.federal',
      epoch: 1,
      tag: 'a'.repeat(64),
      folioDigest: 'b'.repeat(64),
      receivedAt: '2026-11-12T16:20Z',
      entry: 'direct',
      similarity: null,
    },
    NODE_SEED,
  );

  it('verifica el registro del nodo y rechaza cambios o llave equivocada', () => {
    expect(verifyIndexRegistration(registration, NODE_PUBLIC)).toBe(true);
    expect(verifyIndexRegistration({ ...registration, tag: 'c'.repeat(64) }, NODE_PUBLIC)).toBe(
      false,
    );
    expect(verifyIndexRegistration(registration, OTHER_PUBLIC)).toBe(false);
    expect(verifyIndexRegistration({ ...registration, signature: 'AA' }, NODE_PUBLIC)).toBe(false);
  });

  it('verifica la petición de avisos y no acepta una firma de registro', () => {
    const request = signNoticesRequest(
      { nodeId: 'node.federal', after: 3, requestedAt: '2026-11-12T16:30Z' },
      NODE_SEED,
    );
    expect(verifyNoticesRequest(request, NODE_PUBLIC)).toBe(true);
    expect(verifyNoticesRequest({ ...request, after: 0 }, NODE_PUBLIC)).toBe(false);
    expect(
      verifyNoticesRequest({ ...request, signature: registration.signature }, NODE_PUBLIC),
    ).toBe(false);
  });

  it('verifica la confirmación y la baja, y no acepta una firma de otro mensaje', () => {
    const base = {
      nodeId: 'node.federal',
      folioDigest: 'b'.repeat(64),
      requestedAt: '2026-11-12T16:30Z',
    };
    const confirmation = signIndexConfirmation(base, NODE_SEED);
    const withdrawal = signIndexWithdrawal({ ...base, reason: 'spam' }, NODE_SEED);
    expect(verifyIndexConfirmation(confirmation, NODE_PUBLIC)).toBe(true);
    expect(verifyIndexWithdrawal(withdrawal, NODE_PUBLIC)).toBe(true);
    expect(verifyIndexConfirmation(confirmation, OTHER_PUBLIC)).toBe(false);
    expect(verifyIndexWithdrawal({ ...withdrawal, reason: 'duplicate' }, NODE_PUBLIC)).toBe(false);
    // Separación de dominio: la firma de una confirmación no vale como baja.
    expect(
      verifyIndexWithdrawal({ ...withdrawal, signature: confirmation.signature }, NODE_PUBLIC),
    ).toBe(false);
  });

  it('firma el conteo diario con la llave publicada del evaluador', () => {
    const signingSeed = new Uint8Array(32).fill(5);
    const key = buildEvaluatorKey({
      keyPair: generateEvaluatorKeyPair(),
      epoch: 1,
      signingPrivateKey: signingSeed,
      validFrom: '2026-11-09',
    });
    const count = signEvaluationCount({ day: '2026-11-11', epoch: 1, evaluations: 7 }, signingSeed);
    expect(count.signingKeyId).toBe(key.signingKeyId);
    expect(verifyEvaluationCount(count, key)).toBe(true);
    expect(verifyEvaluationCount({ ...count, evaluations: 2 }, key)).toBe(false);
    const otherKey = buildEvaluatorKey({
      keyPair: generateEvaluatorKeyPair(),
      epoch: 1,
      signingPrivateKey: new Uint8Array(32).fill(6),
      validFrom: '2026-11-09',
    });
    expect(verifyEvaluationCount(count, otherKey)).toBe(false);
  });

  it('el folio opaco depende del secreto del nodo y exige 32 bytes', () => {
    const secret = new Uint8Array(32).fill(8);
    const digest = folioDigestFor('K7Q2-M9XP-4RTD', secret);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(folioDigestFor('K7Q2-M9XP-4RTD', new Uint8Array(32).fill(9))).not.toBe(digest);
    expect(() => folioDigestFor('K7Q2-M9XP-4RTD', new Uint8Array(8))).toThrow('32 bytes');
  });
});
