// Pruebas de la bitácora: encadenamiento, vectores fijos, ruptura de eslabones y cabeza firmada.
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import type { LedgerEvent } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { fromBase64Url, fromHex, toBase64Url } from './encoding.ts';
import { generateSigningKeyPair, keyIdFor } from './keys.ts';
import {
  buildEvent,
  computeEventHash,
  folioDigest,
  signLedgerHead,
  verifyChain,
  verifyLedgerHead,
} from './ledger.ts';

const FOLIO = '0123-4567-89AB';
const SERVER_SECRET = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
const SERVER_PUBLIC = fromHex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');

function buildChain(): LedgerEvent[] {
  const first = buildEvent(null, {
    type: 'complaint.received',
    folio: FOLIO,
    at: '2026-10-06',
    actorRole: 'system',
    payload: { a: 1 },
  });
  const second = buildEvent(first, {
    type: 'complaint.status_changed',
    folio: FOLIO,
    at: '2026-10-07',
    actorRole: 'authority',
    payload: { status: 'routing' },
  });
  const third = buildEvent(second, {
    type: 'message.sent',
    folio: FOLIO,
    at: '2026-10-07',
    actorRole: 'reporter',
    payload: null,
  });
  return [first, second, third];
}

describe('folioDigest', () => {
  it('fija el digesto con separación de dominio', () => {
    expect(folioDigest(FOLIO)).toBe(
      '5bb86094e10ea98d0ff089d2b57f6a6a682f393fce96659c8b81f9607efd42af',
    );
    expect(folioDigest(FOLIO)).toBe(sha256Hex(`sigilo/ledger/folio:${FOLIO}`));
  });

  it('rechaza folios inválidos', () => {
    expect(() => folioDigest('malo')).toThrow();
  });
});

describe('buildEvent y computeEventHash', () => {
  it('fija los hashes de regresión', () => {
    const [first, second] = buildChain();
    expect(first?.seq).toBe(0);
    expect(first?.prevHash).toBe(LEDGER_GENESIS_HASH);
    expect(first?.payloadDigest).toBe(
      '015abd7f5cc57a2dd94b7590f04ad8084273905ee33ec5cebeae62276a97f862',
    );
    expect(first?.payloadDigest).toBe(sha256Hex(canonicalize({ a: 1 })));
    expect(first?.hash).toBe('45af01cdc1e8a726655d9d0425e9bbc1035a93c63220e40e0c8a9c72c3bc308f');
    expect(second?.seq).toBe(1);
    expect(second?.prevHash).toBe(first?.hash);
    expect(second?.hash).toBe('fe1650dea278b3acf2a61cdae2724aaac05eeef2e366af6a7e57c95212c69c5f');
  });

  it('calcula el hash ignorando el campo hash', () => {
    const [first] = buildChain();
    if (!first) throw new Error('falta evento');
    const { hash, ...rest } = first;
    expect(computeEventHash(rest)).toBe(hash);
    expect(computeEventHash(first)).toBe(hash);
  });

  it('rechaza entradas inválidas', () => {
    const input = {
      type: 'complaint.received',
      folio: FOLIO,
      at: '2026-10-06',
      actorRole: 'system',
      payload: {},
    } as const;
    expect(() => buildEvent(null, { ...input, at: '06/10/2026' })).toThrow();
    expect(() => buildEvent(null, { ...input, payload: undefined })).toThrow();
  });
});

describe('verifyChain', () => {
  it('acepta una cadena íntegra y la vacía', () => {
    expect(verifyChain(buildChain())).toEqual({ valid: true });
    expect(verifyChain([])).toEqual({ valid: true });
  });

  it('verifica un tramo a partir de un evento confiable', () => {
    const [first, ...rest] = buildChain();
    expect(verifyChain(rest, first ?? null)).toEqual({ valid: true });
    expect(verifyChain(rest)).toEqual({ valid: false, failedAtSeq: 0, reason: 'sequence' });
  });

  it('detecta un eslabón alterado', () => {
    const chain = buildChain();
    const second = chain[1];
    if (!second) throw new Error('falta evento');
    chain[1] = { ...second, at: '2026-10-08' };
    expect(verifyChain(chain)).toEqual({ valid: false, failedAtSeq: 1, reason: 'hash' });
  });

  it('detecta un eslabón recalculado que rompe el enlace siguiente', () => {
    const chain = buildChain();
    const second = chain[1];
    if (!second) throw new Error('falta evento');
    const altered = { ...second, actorRole: 'system' as const };
    chain[1] = { ...altered, hash: computeEventHash(altered) };
    expect(verifyChain(chain)).toEqual({ valid: false, failedAtSeq: 2, reason: 'link' });
  });

  it('detecta eventos eliminados, reordenados o mal formados', () => {
    const [first, second, third] = buildChain();
    if (!first || !second || !third) throw new Error('faltan eventos');
    expect(verifyChain([first, third])).toEqual({
      valid: false,
      failedAtSeq: 1,
      reason: 'sequence',
    });
    expect(verifyChain([second, first])).toEqual({
      valid: false,
      failedAtSeq: 0,
      reason: 'sequence',
    });
    expect(verifyChain([{ ...first, prevHash: 'f'.repeat(64) }])).toEqual({
      valid: false,
      failedAtSeq: 0,
      reason: 'link',
    });
    expect(verifyChain([{ ...first, hash: 'xyz' }])).toEqual({
      valid: false,
      failedAtSeq: 0,
      reason: 'malformed',
    });
  });
});

describe('cabeza firmada', () => {
  const head = {
    seq: 2,
    hash: 'fe1650dea278b3acf2a61cdae2724aaac05eeef2e366af6a7e57c95212c69c5f',
    at: '2026-10-07',
    serverKeyId: keyIdFor(SERVER_PUBLIC),
  };

  it('firma de forma determinista y verifica', () => {
    const signed = signLedgerHead(head, SERVER_SECRET);
    expect(signed.signature).toBe(
      '2zrd1aXcS35ENDcoVnrbjVquHOz8TQT8atfYYPw8qss845xwl6YD1iBWVZdYxzDB97XCRce3NMWC39BF37-3Dg',
    );
    expect(verifyLedgerHead(signed, SERVER_PUBLIC)).toBe(true);
  });

  it('rechaza cabezas alteradas o con otra llave', () => {
    const signed = signLedgerHead(head, SERVER_SECRET);
    const signature = fromBase64Url(signed.signature);
    signature[0] = (signature[0] ?? 0) ^ 1;
    expect(verifyLedgerHead({ ...signed, seq: 3 }, SERVER_PUBLIC)).toBe(false);
    expect(verifyLedgerHead({ ...signed, hash: '0'.repeat(64) }, SERVER_PUBLIC)).toBe(false);
    expect(verifyLedgerHead({ ...signed, signature: toBase64Url(signature) }, SERVER_PUBLIC)).toBe(
      false,
    );
    expect(verifyLedgerHead(signed, generateSigningKeyPair().publicKey)).toBe(false);
  });

  it('rechaza firmar con keyId ajeno', () => {
    expect(() =>
      signLedgerHead({ ...head, serverKeyId: '0000000000000000' }, SERVER_SECRET),
    ).toThrow('identificador de llave');
  });
});
