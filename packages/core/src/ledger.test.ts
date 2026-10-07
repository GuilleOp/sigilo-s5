// Pruebas de la bitácora: encadenamiento, vectores fijos, ruptura de eslabones y cabeza firmada.
import { LEDGER_GENESIS_HASH } from '@sigilo/contracts';
import type { LedgerEvent } from '@sigilo/contracts';
import { describe, expect, it } from 'vitest';
import { canonicalize, sha256Hex } from './canonical-json.ts';
import { fromBase64Url, fromHex, toBase64Url } from './encoding.ts';
import { generateSigningKeyPair, keyIdFor } from './keys.ts';
import {
  buildEvent,
  chainEvent,
  computeEventHash,
  folioDigest,
  identityOpenedPayload,
  identityOpenedPayloadDigest,
  pendingEventFor,
  receiptTagFor,
  receivedPayloadDigest,
  reconcileIdentityOpenings,
  signLedgerHead,
  verifyChain,
  verifyEventInChain,
  verifyLedgerHead,
  verifyReceiptEvent,
} from './ledger.ts';
import type { IdentityAccessEntry, SignedReceipt } from '@sigilo/contracts';

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

  it('exige fechas no decrecientes, también respecto del evento confiable', () => {
    const [first, second] = buildChain();
    if (!first || !second) throw new Error('faltan eventos');
    const earlier = buildEvent(second, {
      type: 'message.sent',
      folio: FOLIO,
      at: '2026-10-07',
      actorRole: 'reporter',
      payload: 1,
    });
    // Se fabrica a mano un eslabón que retrocede un día (chainEvent lo impide).
    const unhashed = { ...earlier, at: '2026-10-05' };
    const backwards = { ...unhashed, hash: computeEventHash(unhashed) };
    expect(verifyChain([first, second, backwards])).toEqual({
      valid: false,
      failedAtSeq: 2,
      reason: 'date',
    });
    expect(verifyChain([backwards], second)).toEqual({
      valid: false,
      failedAtSeq: 2,
      reason: 'date',
    });
  });
});

describe('chainEvent', () => {
  it('rechaza encadenar un evento con fecha anterior a la del último', () => {
    const [, second] = buildChain();
    if (!second) throw new Error('falta evento');
    const pending = pendingEventFor({
      type: 'message.sent',
      folio: FOLIO,
      at: '2026-10-06',
      actorRole: 'reporter',
      payload: 2,
    });
    expect(() => chainEvent(second, pending)).toThrow('anterior');
  });
});

describe('verifyEventInChain', () => {
  const serverKeyId = keyIdFor(SERVER_PUBLIC);

  function headOf(event: LedgerEvent) {
    return signLedgerHead(
      { seq: event.seq, hash: event.hash, at: event.at, serverKeyId },
      SERVER_SECRET,
    );
  }

  it('acepta un evento encadenado hasta la cabeza firmada', () => {
    const chain = buildChain();
    const [first, second, third] = chain;
    if (!first || !second || !third) throw new Error('faltan eventos');
    const head = headOf(third);
    expect(verifyEventInChain(second, chain.slice(1), head, SERVER_PUBLIC)).toEqual({
      valid: true,
    });
    expect(verifyEventInChain(third, [third], head, SERVER_PUBLIC)).toEqual({ valid: true });
  });

  it('rechaza un evento fabricado con hash coherente y la cabeza real', () => {
    const chain = buildChain();
    const [first, , third] = chain;
    if (!first || !third) throw new Error('faltan eventos');
    const unhashed = { ...first, payloadDigest: 'c'.repeat(64) };
    const forged = { ...unhashed, hash: computeEventHash(unhashed) };
    const head = headOf(third);
    // Solo el evento: no llega a la cabeza.
    expect(verifyEventInChain(forged, [forged], head, SERVER_PUBLIC)).toEqual({
      valid: false,
      reason: 'head-mismatch',
    });
    // Con el tramo real detrás: el enlace se rompe.
    expect(verifyEventInChain(forged, [forged, ...chain.slice(1)], head, SERVER_PUBLIC)).toEqual({
      valid: false,
      reason: 'chain',
    });
    // Un tramo que no empieza con el evento pedido.
    expect(verifyEventInChain(forged, chain, head, SERVER_PUBLIC)).toEqual({
      valid: false,
      reason: 'event',
    });
  });

  it('rechaza una cabeza con otra firma y compara los anclajes del tramo', () => {
    const chain = buildChain();
    const [first, second, third] = chain;
    if (!first || !second || !third) throw new Error('faltan eventos');
    const head = headOf(third);
    expect(verifyEventInChain(first, chain, head, generateSigningKeyPair().publicKey)).toEqual({
      valid: false,
      reason: 'head-signature',
    });
    const anchor = { version: 1 as const, anchoredOn: '2026-10-07', head: headOf(second) };
    expect(verifyEventInChain(first, chain, head, SERVER_PUBLIC, { anchors: [anchor] })).toEqual({
      valid: true,
    });
    const rewritten = {
      ...anchor,
      head: signLedgerHead(
        { seq: 1, hash: 'd'.repeat(64), at: '2026-10-07', serverKeyId },
        SERVER_SECRET,
      ),
    };
    expect(verifyEventInChain(first, chain, head, SERVER_PUBLIC, { anchors: [rewritten] })).toEqual(
      { valid: false, reason: 'anchor' },
    );
    // Un anclaje posterior a la cabeza: la bitácora retrocedió.
    const ahead = {
      ...anchor,
      head: signLedgerHead(
        { seq: 9, hash: 'e'.repeat(64), at: '2026-10-08', serverKeyId },
        SERVER_SECRET,
      ),
    };
    expect(verifyEventInChain(first, chain, head, SERVER_PUBLIC, { anchors: [ahead] })).toEqual({
      valid: false,
      reason: 'anchor',
    });
    // Un anclaje anterior al tramo no se puede comparar: el resultado lo dice, no se ignora.
    expect(
      verifyEventInChain(second, chain.slice(1), head, SERVER_PUBLIC, {
        anchors: [{ ...anchor, head: headOf(first) }],
      }),
    ).toEqual({ valid: false, reason: 'anchor-not-comparable' });
    // Con el tramo que empieza en el anclaje, sí se compara.
    expect(
      verifyEventInChain(first, chain, head, SERVER_PUBLIC, {
        anchors: [{ ...anchor, head: headOf(first) }],
      }),
    ).toEqual({ valid: true });
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

describe('verifyReceiptEvent', () => {
  const submissionDigest = 'b'.repeat(64);
  const receipt: SignedReceipt = {
    folio: FOLIO,
    submissionDigest,
    receivedOn: '2026-10-06',
    payloadDigest: receivedPayloadDigest(FOLIO, submissionDigest),
    serverKeyId: keyIdFor(SERVER_PUBLIC),
    signature: 'AA',
  };
  const event = buildEvent(null, {
    type: 'complaint.received',
    folio: FOLIO,
    at: '2026-10-06',
    actorRole: 'system',
    payload: { folio: FOLIO, submissionDigest },
  });

  it('acepta el evento que corresponde al comprobante, sin importar su secuencia', () => {
    expect(event.payloadDigest).toBe(receivedPayloadDigest(FOLIO, submissionDigest));
    expect(verifyReceiptEvent(event, receipt)).toBe(true);
    const later = chainEvent(
      { ...event, seq: 41 },
      pendingEventFor({
        type: 'complaint.received',
        folio: FOLIO,
        at: '2026-10-06',
        actorRole: 'system',
        payload: { folio: FOLIO, submissionDigest },
      }),
    );
    expect(later.seq).toBe(42);
    expect(verifyReceiptEvent(later, receipt)).toBe(true);
  });

  it('rechaza otro folio, digesto, identificador, fecha, tipo o hash', () => {
    const variants: [LedgerEvent, SignedReceipt][] = [
      [event, { ...receipt, folio: '0123-4567-89AC' }],
      [event, { ...receipt, submissionDigest: 'c'.repeat(64) }],
      [event, { ...receipt, payloadDigest: 'c'.repeat(64) }],
      [event, { ...receipt, receivedOn: '2026-10-07' }],
      [{ ...event, type: 'message.sent' }, receipt],
      [{ ...event, hash: 'd'.repeat(64) }, receipt],
    ];
    for (const [candidate, against] of variants) {
      expect(verifyReceiptEvent(candidate, against)).toBe(false);
    }
  });
});

describe('eventos pendientes y etiqueta del recibo', () => {
  const AUTH_VERIFIER = 'q83vEjRWeJA';

  it('fija la etiqueta con separación de dominio y rechaza verificadores inválidos', () => {
    expect(receiptTagFor(AUTH_VERIFIER)).toBe(sha256Hex(`sigilo/ledger/receipt:${AUTH_VERIFIER}`));
    expect(() => receiptTagFor('no es base64url')).toThrow();
  });

  it('encadena un pendiente igual que buildEvent y conserva la etiqueta en el hash', () => {
    const input = {
      type: 'complaint.status_changed' as const,
      folio: FOLIO,
      at: '2026-10-06',
      actorRole: 'authority' as const,
      payload: { status: 'routing' },
    };
    const pending = pendingEventFor(input);
    expect(pending).not.toHaveProperty('seq');
    expect(chainEvent(null, pending)).toEqual(buildEvent(null, input));

    const opening = {
      folio: FOLIO,
      openingId: 'a'.repeat(32),
      legalBasis: 'Fundamento sintético',
      authVerifier: AUTH_VERIFIER,
    };
    const payload = identityOpenedPayload(opening);
    expect(payload.receiptTag).toBe(receiptTagFor(AUTH_VERIFIER));
    const opened = buildEvent(null, {
      type: 'identity.opened',
      folio: FOLIO,
      at: '2026-10-06',
      actorRole: 'authority',
      payload,
      receiptTag: payload.receiptTag,
    });
    expect(opened.payloadDigest).toBe(identityOpenedPayloadDigest(opening));
    expect(opened.receiptTag).toBe(payload.receiptTag);
    expect(verifyChain([opened])).toEqual({ valid: true });
    // Cambiar la etiqueta rompe el hash; quitarla deja un evento mal formado.
    expect(verifyChain([{ ...opened, receiptTag: 'e'.repeat(64) }])).toMatchObject({
      reason: 'hash',
    });
    const withoutTag: Partial<LedgerEvent> = { ...opened };
    delete withoutTag.receiptTag;
    expect(verifyChain([withoutTag as LedgerEvent])).toMatchObject({ reason: 'malformed' });
  });

  it('rechaza pendientes con fecha inválida', () => {
    expect(() =>
      pendingEventFor({
        type: 'message.sent',
        folio: FOLIO,
        at: 'ayer',
        actorRole: 'reporter',
        payload: {},
      }),
    ).toThrow();
  });
});

describe('reconcileIdentityOpenings', () => {
  const AUTH_VERIFIER = 'q83vEjRWeJA';
  const OTHER_FOLIO = '0123-4567-89AC';
  const entry: IdentityAccessEntry = {
    on: '2026-10-06',
    actorRole: 'authority',
    legalBasis: 'Fundamento sintético de la apertura de prueba',
    openingId: '1'.repeat(32),
  };

  function openingEvent(folio: string, openingId: string, at = entry.on): LedgerEvent {
    const payload = identityOpenedPayload({
      folio,
      openingId,
      legalBasis: entry.legalBasis,
      authVerifier: AUTH_VERIFIER,
    });
    return buildEvent(null, {
      type: 'identity.opened',
      folio,
      at,
      actorRole: 'authority',
      payload,
      receiptTag: payload.receiptTag,
    });
  }

  const context = { folio: FOLIO, authVerifier: AUTH_VERIFIER, publishedThrough: '2026-10-06' };

  it('acepta aperturas publicadas que coinciden con el seguimiento', () => {
    const result = reconcileIdentityOpenings(
      [openingEvent(FOLIO, entry.openingId)],
      [entry],
      context,
    );
    expect(result).toEqual({ unlisted: [], unpublished: [] });
  });

  it('detecta una apertura con la etiqueta registrada con otro folio o no listada', () => {
    const hidden = openingEvent(OTHER_FOLIO, '2'.repeat(32));
    const extra = openingEvent(FOLIO, '3'.repeat(32));
    const result = reconcileIdentityOpenings(
      [openingEvent(FOLIO, entry.openingId), hidden, extra],
      [entry],
      context,
    );
    expect(result.unlisted).toEqual([hidden, extra]);
    expect(result.unpublished).toEqual([]);
  });

  it('detecta una apertura de un día publicado que no aparece, y espera las de días abiertos', () => {
    expect(reconcileIdentityOpenings([], [entry], context).unpublished).toEqual([entry]);
    expect(
      reconcileIdentityOpenings([], [entry], { ...context, publishedThrough: '2026-10-05' }),
    ).toEqual({ unlisted: [], unpublished: [] });
    expect(
      reconcileIdentityOpenings([], [entry], { ...context, publishedThrough: null }).unpublished,
    ).toEqual([]);
  });

  it('ignora eventos de otros recibos y señala fechas que no coinciden', () => {
    const otherReceipt = buildEvent(null, {
      type: 'identity.opened',
      folio: FOLIO,
      at: entry.on,
      actorRole: 'authority',
      payload: {},
      receiptTag: receiptTagFor('AAAA'),
    });
    const moved = openingEvent(FOLIO, entry.openingId, '2026-10-05');
    const result = reconcileIdentityOpenings([otherReceipt, moved], [entry], context);
    expect(result.unlisted).toEqual([moved]);
    expect(result.unpublished).toEqual([entry]);
  });
});
