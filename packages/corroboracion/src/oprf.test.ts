// Pruebas del VOPRF: vectores oficiales de RFC 9497 (apéndice A.1.2) y manipulación de la prueba,
// de la llave y del tipo de identificador.
import { ristretto255_oprf } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import type { CorroborationEvaluationResponse, CorroborationEvaluatorKey } from '@sigilo/contracts';
import { fromBase64Url, fromHex, toBase64Url, toHex } from '@sigilo/core';
import type { CorroborationIdentifier } from './identifier.ts';
import {
  blindCorroboration,
  blindInput,
  deriveCorroborationKeys,
  deriveEvaluatorKeyPair,
  evaluateBlinded,
  evaluatorKeyFromDirectory,
  finalizeCorroboration,
  finalizeEvaluation,
  generateEvaluatorKeyPair,
} from './oprf.ts';
import type { BlindedCorroboration, EvaluatorKeyPair } from './oprf.ts';
import {
  RFC9497_VOPRF_BATCH,
  RFC9497_VOPRF_KEYS,
  RFC9497_VOPRF_VECTORS,
  fixedScalarSource,
} from './rfc9497-vectors.ts';
import { buildEvaluatorKey } from './signatures.ts';

const SIGNING_SEED = new Uint8Array(32).fill(7);

function keyFor(keyPair: EvaluatorKeyPair, epoch = 1): CorroborationEvaluatorKey {
  return buildEvaluatorKey({
    keyPair,
    epoch,
    signingPrivateKey: SIGNING_SEED,
    validFrom: '2026-11-09',
  });
}

function respond(
  keyPair: EvaluatorKeyPair,
  state: BlindedCorroboration,
  key: CorroborationEvaluatorKey,
): CorroborationEvaluationResponse {
  const { evaluated, proof } = evaluateBlinded(keyPair, state.blinded);
  return {
    v: 1,
    suite: key.suite,
    epoch: key.epoch,
    keyId: key.keyId,
    evaluated: toBase64Url(evaluated),
    proof: toBase64Url(proof),
  };
}

const OCID: CorroborationIdentifier = { kind: 'ocid', ocid: 'ocds-fict00-IFFE-AD-2026-0042' };

describe('vectores de RFC 9497, apéndice A.1.2 (ristretto255-SHA512, VOPRF)', () => {
  const keyPair = deriveEvaluatorKeyPair(
    fromHex(RFC9497_VOPRF_KEYS.seed),
    fromHex(RFC9497_VOPRF_KEYS.keyInfo),
  );
  const key = keyFor(keyPair);

  it('DeriveKeyPair reproduce skSm y pkSm', () => {
    expect(toHex(keyPair.secretKey)).toBe(RFC9497_VOPRF_KEYS.skSm);
    expect(toHex(keyPair.publicKey)).toBe(RFC9497_VOPRF_KEYS.pkSm);
  });

  for (const vector of RFC9497_VOPRF_VECTORS) {
    it(`reproduce el vector ${vector.section} completo (cegado, evaluación, prueba y salida)`, () => {
      const state = blindInput(fromHex(vector.input), key, fixedScalarSource(vector.blind));
      expect(toHex(state.blind)).toBe(vector.blind);
      expect(toHex(state.blinded)).toBe(vector.blindedElement);
      const { evaluated, proof } = evaluateBlinded(
        keyPair,
        state.blinded,
        fixedScalarSource(vector.proofRandomScalar),
      );
      expect(toHex(evaluated)).toBe(vector.evaluationElement);
      expect(toHex(proof)).toBe(vector.proof);
      const output = finalizeEvaluation(
        state,
        {
          v: 1,
          suite: key.suite,
          epoch: 1,
          keyId: key.keyId,
          evaluated: toBase64Url(evaluated),
          proof: toBase64Url(proof),
        },
        key,
      );
      expect(toHex(output)).toBe(vector.output);
    });
  }

  it(`reproduce el vector ${RFC9497_VOPRF_BATCH.section} (lote de 2 con una sola prueba)`, () => {
    const voprf = ristretto255_oprf.voprf;
    const batch = RFC9497_VOPRF_BATCH;
    const blinded = batch.inputs.map((input, index) =>
      voprf.blind(fromHex(input), fixedScalarSource(batch.blinds[index] ?? '')),
    );
    expect(blinded.map((item) => toHex(item.blinded))).toEqual([...batch.blindedElements]);
    const evaluation = voprf.blindEvaluateBatch(
      keyPair.secretKey,
      keyPair.publicKey,
      blinded.map((item) => item.blinded),
      fixedScalarSource(batch.proofRandomScalar),
    );
    expect(evaluation.evaluated.map(toHex)).toEqual([...batch.evaluationElements]);
    expect(toHex(evaluation.proof)).toBe(batch.proof);
    const outputs = voprf.finalizeBatch(
      batch.inputs.map((input, index) => ({
        input: fromHex(input),
        blind: blinded[index]?.blind ?? new Uint8Array(0),
        evaluated: evaluation.evaluated[index] ?? new Uint8Array(0),
        blinded: blinded[index]?.blinded ?? new Uint8Array(0),
      })),
      keyPair.publicKey,
      evaluation.proof,
    );
    expect(outputs.map(toHex)).toEqual([...batch.outputs]);
  });
});

describe('etiqueta de corroboración', () => {
  const keyPair = generateEvaluatorKeyPair();
  const key = keyFor(keyPair);

  it('es la misma para el mismo identificador con cegados distintos y no lo contiene', () => {
    const first = blindCorroboration(OCID, key);
    const second = blindCorroboration(
      { kind: 'ocid', ocid: '  OCDS-FICT00-iffe-ad-2026-0042 ' },
      key,
    );
    expect(first.request.blinded).not.toBe(second.request.blinded);
    const tagA = finalizeCorroboration(first, respond(keyPair, first, key), key);
    const tagB = finalizeCorroboration(second, respond(keyPair, second, key), key);
    expect(tagA.tag).toBe(tagB.tag);
    expect(tagA.tag).toMatch(/^[0-9a-f]{64}$/u);
    expect(toHex(tagA.similarityKey)).not.toBe(tagA.tag);
    expect(JSON.stringify(first.request)).not.toMatch(/IFFE|ocds/iu);
  });

  it('cambia con el identificador, con la llave del evaluador y con la época', () => {
    const tagOf = (identifier: CorroborationIdentifier, pair: EvaluatorKeyPair, epoch = 1) => {
      const pairKey = keyFor(pair, epoch);
      const state = blindCorroboration(identifier, pairKey);
      return finalizeCorroboration(state, respond(pair, state, pairKey), pairKey).tag;
    };
    const base = tagOf(OCID, keyPair);
    expect(tagOf({ kind: 'ocid', ocid: 'ocds-fict00-IFFE-AD-2026-0043' }, keyPair)).not.toBe(base);
    expect(tagOf(OCID, generateEvaluatorKeyPair())).not.toBe(base);
    const output = new Uint8Array(64).fill(1);
    expect(deriveCorroborationKeys(output, 1).tag).toBe(deriveCorroborationKeys(output, 2).tag);
  });

  it('rechaza una prueba DLEQ alterada (bit cambiado)', () => {
    const state = blindCorroboration(OCID, key);
    const response = respond(keyPair, state, key);
    const proof = fromBase64Url(response.proof);
    proof[5] = (proof[5] ?? 0) ^ 1;
    expect(() =>
      finalizeEvaluation(state, { ...response, proof: toBase64Url(proof) }, key),
    ).toThrow('La prueba del evaluador no es válida');
  });

  it('rechaza un elemento evaluado alterado aunque traiga la prueba original', () => {
    const state = blindCorroboration(OCID, key);
    const response = respond(keyPair, state, key);
    const other = respond(keyPair, blindCorroboration(OCID, key), key);
    expect(() =>
      finalizeEvaluation(state, { ...response, evaluated: other.evaluated }, key),
    ).toThrow('La prueba del evaluador no es válida');
  });

  it('rechaza la evaluación con una llave distinta de la publicada (marcado por persona)', () => {
    const rogue = generateEvaluatorKeyPair();
    const state = blindCorroboration(OCID, key);
    const { evaluated, proof } = evaluateBlinded(rogue, state.blinded);
    const response: CorroborationEvaluationResponse = {
      v: 1,
      suite: key.suite,
      epoch: 1,
      keyId: key.keyId,
      evaluated: toBase64Url(evaluated),
      proof: toBase64Url(proof),
    };
    expect(() => finalizeEvaluation(state, response, key)).toThrow('no es válida');
    // Tampoco sirve anunciar la llave nueva en la respuesta: el navegador usa la del directorio.
    expect(() =>
      finalizeEvaluation(state, { ...response, keyId: keyFor(rogue).keyId }, key),
    ).toThrow('no es válida');
    expect(() => finalizeEvaluation(state, { ...response, epoch: 2 }, key)).toThrow('no es válida');
  });

  it('una etiqueta de otro tipo de identificador nunca coincide, aunque el texto sea igual', () => {
    const asOcid = blindCorroboration(OCID, key);
    const asServer = blindCorroboration(
      { kind: 'servidor', name: 'ocds fict00 IFFE AD 2026 0042', entityId: 'VE-INSTITUTO' },
      key,
    );
    const ocidTag = finalizeCorroboration(asOcid, respond(keyPair, asOcid, key), key).tag;
    const serverTag = finalizeCorroboration(asServer, respond(keyPair, asServer, key), key).tag;
    expect(ocidTag).not.toBe(serverTag);
    // Cambiar la entrada en `finalize` (otro tipo) no lanza, pero da otra etiqueta.
    const swapped: BlindedCorroboration = { ...asOcid, input: asServer.input };
    const swappedTag = finalizeCorroboration(swapped, respond(keyPair, asOcid, key), key).tag;
    expect(swappedTag).not.toBe(ocidTag);
  });

  it('rechaza una llave cuyo keyId no corresponde y toma la llave del directorio', () => {
    expect(() => blindCorroboration(OCID, { ...key, keyId: '0000000000000000' })).toThrow(
      'no corresponde',
    );
    const directory = { corroboration: undefined } as unknown as Parameters<
      typeof evaluatorKeyFromDirectory
    >[0];
    expect(evaluatorKeyFromDirectory(directory)).toBeNull();
    const withKey = {
      corroboration: {
        evaluator: key,
        evaluatorUrl: 'https://evaluador.example.org',
        indexUrl: 'https://indice.example.org',
      },
    } as unknown as Parameters<typeof evaluatorKeyFromDirectory>[0];
    expect(evaluatorKeyFromDirectory(withKey)).toEqual(key);
  });

  it('rechaza un elemento cegado que no es un punto válido o es la identidad', () => {
    expect(() => evaluateBlinded(keyPair, new Uint8Array(32))).toThrow();
    expect(() => evaluateBlinded(keyPair, new Uint8Array(32).fill(0xff))).toThrow();
  });
});
