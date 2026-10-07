// Pruebas de la orquestación criptográfica: llaves fijadas, envío, seguimiento, autoridad y bitácora.
import { describe, expect, it } from 'vitest';
import type {
  ComplaintDetail,
  LedgerEvent,
  MailboxMessage,
  SignedReceipt,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
  TrackingView,
} from '@sigilo/contracts';
import {
  buildEvent,
  computeEventHash,
  computeSubmissionDigest,
  IDENTITY_PADDED_SIZE,
  identityOpenedPayload,
  keyIdFor,
  ReceiptPhraseError,
  receivedPayloadDigest,
  sealedIdentityDigest,
  signLedgerHead,
  submissionDigestFromDetail,
  signReceipt,
  toBase64Url,
} from '@sigilo/core';
import { PINNED_KEYS } from '../config/pinned-keys.ts';
import {
  decodeAuthorityThread,
  importAuthorityKey,
  openSealedIdentity,
  sealAuthorityQuestion,
  verifyReporterKeys,
} from './authority.ts';
import { assertServedKeysMatch, diffPublicKeys, KeyMismatchError } from './key-pinning.ts';
import {
  compareWithAnchor,
  compareWithAnchors,
  downloadAndVerifyLedger,
  evaluateLedger,
  parseLedgerAnchors,
  verifyEventWithAnchors,
} from './ledger-verification.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  identityBlockSize,
  identityFitsEnvelope,
  normalizeSubmissionInput,
  sealReporterIdentity,
  verifySubmission,
} from './submission.ts';
import type { SubmissionInput } from './submission.ts';
import { createTestDeployment } from './test-keys.ts';
import type { TestDeployment } from './test-keys.ts';
import {
  checkIdentityOpenings,
  checkPublishedEvent,
  decodeReporterThread,
  loadTrackingLedger,
  sealReporterReply,
  startTrackingSession,
  verifyTrackingReceipt,
} from './tracking.ts';

const FOLIO = 'ABCD-EFGH-JKMN';
const RECEIVED_ON = '2026-10-20';
const FACTS = {
  stateCode: '22',
  entityId: 'VE-OBRAS',
  offenseCode: 'LGRA-52',
  occurredPeriod: '2026-03',
  accused: 'Servidor Ficticio Dos',
  description: 'Descripción sintética de una adjudicación directa irregular.',
};
const EVIDENCE = [
  {
    evidenceId: 'e'.repeat(32),
    mediaType: 'image/jpeg' as const,
    sha256: 'd'.repeat(64),
    sizeBytes: 10,
  },
];
const SEALED_INPUT: SubmissionInput = {
  mode: 'sealed',
  facts: FACTS,
  evidence: EVIDENCE,
  protectionRequested: true,
};

function authorityKeyFile(deployment: TestDeployment): string {
  return JSON.stringify({
    version: 1,
    keyId: keyIdFor(deployment.authorityBox.publicKey),
    boxPublicKey: toBase64Url(deployment.authorityBox.publicKey),
    boxPrivateKey: toBase64Url(deployment.authorityBox.privateKey),
    signingPublicKey: toBase64Url(deployment.authoritySigning.publicKey),
    signingPrivateKey: toBase64Url(deployment.authoritySigning.privateKey),
  });
}

/** Detalle que el servidor entregaría a la autoridad para la solicitud dada. */
function detailFor(
  request: SubmitComplaintRequest,
  messages: MailboxMessage[] = [],
): ComplaintDetail {
  return {
    summary: {
      folio: FOLIO,
      mode: request.mode,
      status: 'received',
      receivedOn: RECEIVED_ON,
      stateCode: request.facts.stateCode,
      offenseCode: request.facts.offenseCode,
      protectionRequested: request.protectionRequested,
    },
    version: 1,
    facts: request.facts,
    evidence: request.evidence,
    reporterKeys: request.reporterKeys,
    authVerifier: request.authVerifier,
    ...(request.sealedIdentity === undefined
      ? {}
      : { sealedIdentityDigest: sealedIdentityDigest(request.sealedIdentity) }),
    messages,
    identityOpenedCount: 0,
  };
}

function signedReceiptFor(
  request: SubmitComplaintRequest,
  deployment: TestDeployment,
): SignedReceipt {
  const submissionDigest = computeSubmissionDigest(request);
  return signReceipt(
    {
      folio: FOLIO,
      submissionDigest,
      receivedOn: RECEIVED_ON,
      payloadDigest: receivedPayloadDigest(FOLIO, submissionDigest),
      serverKeyId: deployment.pinned.set.server.keyId,
    },
    deployment.server.privateKey,
  );
}

function receivedEventFor(
  receipt: SignedReceipt,
  previous: LedgerEvent | null = null,
): LedgerEvent {
  return buildEvent(previous, {
    type: 'complaint.received',
    folio: receipt.folio,
    at: receipt.receivedOn,
    actorRole: 'system',
    payload: { folio: receipt.folio, submissionDigest: receipt.submissionDigest },
  });
}

function trackingViewFor(
  receipt: SignedReceipt,
  messages: MailboxMessage[] = [],
  isPublished = true,
): TrackingView {
  return {
    folio: FOLIO,
    mode: 'sealed',
    status: 'received',
    timeline: [],
    identityAccess: [],
    messages,
    receipt,
    ...(isPublished ? { receivedEvent: receivedEventFor(receipt) } : {}),
  };
}

/** Cabeza firmada por el servidor de prueba. */
function headFor(deployment: TestDeployment, seq: number, hash: string, at = RECEIVED_ON) {
  return signLedgerHead(
    { seq, hash, at, serverKeyId: deployment.pinned.set.server.keyId },
    deployment.server.privateKey,
  );
}

function toMessage(
  sealed: { sequence: number; envelope: MailboxMessage['envelope']; signature: string },
  from: MailboxMessage['from'],
  id: string,
): MailboxMessage {
  return {
    messageId: id.repeat(32),
    from,
    sequence: sealed.sequence,
    sentOn: '2026-10-21T10:00Z',
    envelope: sealed.envelope,
    signature: sealed.signature,
  };
}

describe('llaves fijadas', () => {
  it('el bundle trae llaves con identificadores consistentes', () => {
    expect(keyIdFor(PINNED_KEYS.authorityBoxPublicKey)).toBe(PINNED_KEYS.set.authority.keyId);
  });

  it('detecta la sustitución de la llave de la autoridad y bloquea', async () => {
    const { pinned } = createTestDeployment();
    const other = createTestDeployment().pinned.set;
    const served = { ...pinned.set, authority: other.authority };
    expect(diffPublicKeys(pinned.set, served)).toEqual([
      'authority.keyId',
      'authority.boxPublicKey',
      'authority.signingPublicKey',
    ]);
    await expect(assertServedKeysMatch(async () => served, pinned.set)).rejects.toBeInstanceOf(
      KeyMismatchError,
    );
    await expect(
      assertServedKeysMatch(async () => pinned.set, pinned.set),
    ).resolves.toBeUndefined();
  });
});

describe('identidad sellada', () => {
  async function sealedSubmission() {
    const deployment = createTestDeployment();
    const receipt = createReceipt();
    const block = buildIdentityBlock(
      { fullName: ' Persona Denunciante Uno ', contact: '', witnesses: ['Testigo Ficticio', ' '] },
      ['c'.repeat(64)],
    );
    const sealed = await sealReporterIdentity(block, SEALED_INPUT, receipt.keys, deployment.pinned);
    const request = buildSubmitRequest(SEALED_INPUT, receipt.keys, sealed);
    const keys = importAuthorityKey(authorityKeyFile(deployment), deployment.pinned);
    return { deployment, receipt, block, sealed, request, keys };
  }

  it('construye el bloque sin campos vacíos y sella hacia la llave fijada', async () => {
    const { block, request, deployment } = await sealedSubmission();
    expect(block).toEqual({
      fullName: 'Persona Denunciante Uno',
      witnesses: ['Testigo Ficticio'],
      originalEvidenceSha256: ['c'.repeat(64)],
    });
    expect(request.sealedIdentity?.keyId).toBe(deployment.pinned.set.authority.keyId);
  });

  it('la autoridad la abre con el contexto recalculado desde el detalle', async () => {
    const { sealed, request, keys } = await sealedSubmission();
    const identity = await openSealedIdentity(
      { sealedIdentity: sealed, openingId: 'a'.repeat(32) },
      detailFor(request),
      keys,
    );
    expect(identity.fullName).toBe('Persona Denunciante Uno');
  });

  it('un campo sobrante en los hechos no cambia el digesto del contenido', async () => {
    const deployment = createTestDeployment();
    const receipt = createReceipt();
    const block = buildIdentityBlock({ fullName: 'Persona Uno', contact: '', witnesses: [] }, []);
    // zod quita `extra` al validar: el sello y la solicitud deben usar los mismos hechos.
    const input = { ...SEALED_INPUT, facts: { ...FACTS, extra: 'sobrante' } };
    const sealed = await sealReporterIdentity(block, input, receipt.keys, deployment.pinned);
    const request = buildSubmitRequest(input, receipt.keys, sealed);
    expect(request.facts).not.toHaveProperty('extra');
    const keys = importAuthorityKey(authorityKeyFile(deployment), deployment.pinned);
    await expect(
      openSealedIdentity(
        { sealedIdentity: sealed, openingId: 'a'.repeat(32) },
        detailFor(request),
        keys,
      ),
    ).resolves.toMatchObject({ fullName: 'Persona Uno' });
  });

  it('no abre si el servidor altera hechos, pruebas, llaves o el verificador (trasplante)', async () => {
    const { sealed, request, keys } = await sealedSubmission();
    const response = { sealedIdentity: sealed, openingId: 'a'.repeat(32) };
    const other = createReceipt();
    const altered: ComplaintDetail[] = [
      { ...detailFor(request), facts: { ...request.facts, accused: 'Otra persona ficticia' } },
      { ...detailFor(request), evidence: [] },
      {
        ...detailFor(request),
        reporterKeys: {
          boxPublicKey: toBase64Url(other.keys.box.publicKey),
          signingPublicKey: toBase64Url(other.keys.signing.publicKey),
        },
      },
      { ...detailFor(request), authVerifier: other.keys.authVerifier },
      {
        ...detailFor(request),
        summary: { ...detailFor(request).summary, protectionRequested: false },
      },
    ];
    for (const detail of altered) {
      await expect(openSealedIdentity(response, detail, keys)).rejects.toThrow();
    }
  });

  it('mide el bloque y rechaza testigos que no caben en el sobre', () => {
    const block = buildIdentityBlock({ fullName: 'Uno', contact: '', witnesses: [] }, []);
    expect(identityBlockSize(block)).toBeLessThan(IDENTITY_PADDED_SIZE);
    expect(identityFitsEnvelope({ fullName: 'Uno', contact: '', witnesses: ['Testigo'] })).toBe(
      true,
    );
    const long = Array.from({ length: 10 }, () => 'á'.repeat(500));
    expect(identityFitsEnvelope({ fullName: 'Uno', contact: '', witnesses: long })).toBe(false);
  });
});

describe('envío y seguimiento', () => {
  it('verifica el comprobante, su evento y recupera las llaves con las 8 palabras', async () => {
    const deployment = createTestDeployment();
    const { pinned } = deployment;
    const receipt = createReceipt();
    expect(receipt.words).toHaveLength(8);
    const request = buildSubmitRequest(
      { mode: 'anonymous', facts: FACTS, evidence: [], protectionRequested: false },
      receipt.keys,
      undefined,
    );
    const signed = signedReceiptFor(request, deployment);
    const response: SubmitComplaintResponse = { folio: FOLIO, receipt: signed };
    expect(verifySubmission(request, response, pinned)).toBe(true);
    expect(verifySubmission({ ...request, protectionRequested: true }, response, pinned)).toBe(
      false,
    );

    // La persona recupera sus llaves con las palabras (sin acentos ni mayúsculas).
    const typed = receipt.words.map((word) =>
      word.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase(),
    );
    const session = startTrackingSession(FOLIO, typed);
    expect(session.credentials.authKey).toBe(toBase64Url(receipt.keys.authKey));

    const view = trackingViewFor(signed);
    expect(verifyTrackingReceipt(view, pinned)).toEqual({ isReceiptValid: true, event: 'valid' });
    const published = view.receivedEvent;
    if (published === undefined) throw new Error('Falta el evento.');
    const forgedEvent = { ...published, payloadDigest: 'f'.repeat(64) };
    expect(verifyTrackingReceipt({ ...view, receivedEvent: forgedEvent }, pinned)).toEqual({
      isReceiptValid: true,
      event: 'invalid',
    });
    // Antes de que cierre el día, el seguimiento no trae el evento: queda pendiente.
    expect(verifyTrackingReceipt(trackingViewFor(signed, [], false), pinned)).toEqual({
      isReceiptValid: true,
      event: 'pending',
    });
    expect(verifyTrackingReceipt(view, createTestDeployment().pinned)).toEqual({
      isReceiptValid: false,
      event: 'invalid',
    });
  });

  it('compara el evento de recepción con el tramo verificado de la bitácora', async () => {
    const deployment = createTestDeployment();
    const receipt = createReceipt();
    const request = buildSubmitRequest(
      { mode: 'anonymous', facts: FACTS, evidence: [], protectionRequested: false },
      receipt.keys,
      undefined,
    );
    const signed = signedReceiptFor(request, deployment);
    const view = trackingViewFor(signed);
    const event = view.receivedEvent;
    if (event === undefined) throw new Error('Falta el evento.');
    const pendingView = trackingViewFor(signed, [], false);
    const genesis = headFor(deployment, 0, '0'.repeat(64));
    const publishedHead = headFor(deployment, 0, event.hash);
    const earlierHead = headFor(deployment, 0, 'b'.repeat(64), '2026-10-19');
    const serve = (events: LedgerEvent[], head = publishedHead) => ({
      fetchHead: async () => head,
      fetchSince: async () => ({ events, head }),
      fetchPage: async (from: number) => ({
        events: events.filter((item) => item.seq >= from),
        head,
      }),
    });
    const check = async (current: TrackingView, events: LedgerEvent[], head = publishedHead) =>
      checkPublishedEvent(
        current,
        await loadTrackingLedger(current, deployment.pinned, serve(events, head)),
      );
    // Pendiente de publicar: la cabeza pública todavía no llega a su día.
    expect(await check(pendingView, [], genesis)).toBe('pending');
    expect(await check(pendingView, [], earlierHead)).toBe('pending');
    // El seguimiento dice pendiente, pero la cabeza pública ya publicó su día.
    expect(await check(pendingView, [], publishedHead)).toBe('mismatch');
    expect(await check(view, [event])).toBe('published');
    // Otro evento en su lugar no llega a la cabeza firmada.
    expect(await check(view, [{ ...event, payloadDigest: 'f'.repeat(64) }])).toBe('mismatch');
    // El seguimiento dice que se publicó, pero la bitácora pública no lo tiene.
    expect(await check(view, [])).toBe('mismatch');
    // Un evento fabricado con su hash recalculado tampoco: el último eslabón no es la cabeza.
    const unhashed = { ...event, actorRole: 'system' as const, payloadDigest: 'c'.repeat(64) };
    const forged = { ...unhashed, hash: computeEventHash(unhashed) };
    expect(await check({ ...view, receivedEvent: forged }, [forged])).toBe('mismatch');

    // Anclajes pegados: uno que coincide con el tramo se acepta; uno distinto lo marca.
    const anchorFor = (hash: string) => ({
      version: 1 as const,
      anchoredOn: RECEIVED_ON,
      head: headFor(deployment, 0, hash),
    });
    const withAnchors = (hash: string) =>
      loadTrackingLedger(view, deployment.pinned, serve([event]), [anchorFor(hash)]);
    expect((await withAnchors(event.hash)).status).toBe('valid');
    expect(await withAnchors('a'.repeat(64))).toEqual({
      status: 'invalid',
      isAnchorMismatch: true,
    });
  });

  it('compara los anclajes anteriores al tramo descargando desde ellos, nunca los da por buenos', async () => {
    const deployment = createTestDeployment();
    const chain: LedgerEvent[] = [];
    for (let index = 0; index < 4; index += 1) {
      chain.push(
        buildEvent(chain.at(-1) ?? null, {
          type: 'message.sent',
          folio: FOLIO,
          at: index < 2 ? '2026-10-19' : RECEIVED_ON,
          actorRole: 'reporter',
          payload: { index },
        }),
      );
    }
    const [first, second, third] = chain;
    const last = chain.at(-1);
    if (!first || !second || !third || !last) throw new Error('faltan eventos');
    const head = headFor(deployment, last.seq, last.hash, last.at);
    const anchorAt = (event: LedgerEvent, hash = event.hash) => ({
      version: 1 as const,
      anchoredOn: event.at,
      head: headFor(deployment, event.seq, hash, event.at),
    });
    const page = async (from: number) => ({
      events: chain.filter((item) => item.seq >= from),
      head,
    });
    const tramo = chain.slice(2);
    const key = deployment.pinned.serverSigningPublicKey;
    const check = (anchors: ReturnType<typeof anchorAt>[], fetchPage = page) =>
      verifyEventWithAnchors(third, tramo, head, key, anchors, fetchPage);
    // Un anclaje anterior al tramo que coincide: se descarga desde él y se compara.
    expect(await check([anchorAt(first)])).toEqual({ valid: true });
    // Uno firmado que contradice la cadena (prueba de una bifurcación) ya no pasa en silencio.
    expect(await check([anchorAt(second, 'f'.repeat(64))])).toEqual({
      valid: false,
      reason: 'anchor',
    });
    // Si el servidor no entrega la parte anterior, el resultado es «no comparable».
    const refusing = async (from: number) => ({
      events: from < third.seq ? [] : chain.filter((item) => item.seq >= from),
      head,
    });
    expect(await check([anchorAt(first)], refusing)).toEqual({
      valid: false,
      reason: 'anchor-not-comparable',
    });
    const failing = async () => Promise.reject(new Error('sin red'));
    expect(await check([anchorAt(first)], failing)).toEqual({
      valid: false,
      reason: 'anchor-not-comparable',
    });
    // Sin anclajes anteriores no se descarga nada más.
    expect(await check([anchorAt(last)], failing)).toEqual({ valid: true });
  });

  it('busca desde el día de recepción las aperturas con la etiqueta del recibo', async () => {
    const deployment = createTestDeployment();
    const receipt = createReceipt();
    const session = startTrackingSession(FOLIO, receipt.words);
    const signed = signedReceiptFor(
      buildSubmitRequest(
        { mode: 'anonymous', facts: FACTS, evidence: [], protectionRequested: false },
        receipt.keys,
        undefined,
      ),
      deployment,
    );
    const legalBasis = 'Fundamento sintético de la apertura en la prueba.';
    const entry = {
      on: RECEIVED_ON,
      actorRole: 'authority' as const,
      legalBasis,
      openingId: '1'.repeat(32),
    };
    const openingEvent = (folio: string, openingId: string, previous: LedgerEvent | null) => {
      const payload = identityOpenedPayload({
        folio,
        openingId,
        legalBasis,
        authVerifier: receipt.keys.authVerifier,
      });
      return buildEvent(previous, {
        type: 'identity.opened',
        folio,
        at: RECEIVED_ON,
        actorRole: 'authority',
        payload,
        receiptTag: payload.receiptTag,
      });
    };
    // Un día anterior: el vecino que acota el tramo.
    const neighbor = buildEvent(null, {
      type: 'complaint.received',
      folio: 'YYYY-YYYY-YYYY',
      at: '2026-10-19',
      actorRole: 'system',
      payload: {},
    });
    const received = receivedEventFor(signed, neighbor);
    const baseView = {
      ...trackingViewFor(signed),
      receivedEvent: received,
      identityAccess: [entry],
    };
    const serve = (events: LedgerEvent[]) => {
      const last = events.at(-1);
      const head = headFor(deployment, last?.seq ?? 0, last?.hash ?? '0'.repeat(64), last?.at);
      return {
        fetchHead: async () => head,
        fetchSince: async () => ({ events, head }),
        fetchPage: async (from: number) => ({ events: events.filter((e) => e.seq >= from), head }),
      };
    };
    const check = async (events: LedgerEvent[], current: TrackingView = baseView) =>
      checkIdentityOpenings(
        current,
        session,
        await loadTrackingLedger(current, deployment.pinned, serve(events)),
      );

    const own = openingEvent(FOLIO, entry.openingId, received);
    const consistent = await check([neighbor, received, own]);
    expect(consistent.status).toBe('consistent');
    if (consistent.status === 'consistent') {
      expect([...consistent.publishedOpeningIds]).toEqual([entry.openingId]);
    }
    // Una apertura registrada con otro folio, pero ligada al mismo recibo, se detecta.
    const hidden = openingEvent('ZZZZ-ZZZZ-ZZZZ', '2'.repeat(32), own);
    expect(await check([neighbor, received, own, hidden])).toEqual({
      status: 'hidden',
      hiddenCount: 1,
    });
    // Una apertura del seguimiento cuyo día ya se publicó debe estar en la bitácora.
    expect(await check([neighbor, received])).toEqual({
      status: 'unpublished',
      unpublished: [entry],
    });
    // Un tramo que empieza después del día (sin vecino ni génesis) o una cadena rota no sirven.
    expect(await check([received, own])).toEqual({ status: 'unknown' });
    expect(await check([neighbor, received, { ...own, payloadDigest: 'f'.repeat(64) }])).toEqual({
      status: 'unknown',
    });
    // Sin evento de recepción y con su día aún sin publicar, no puede haber aperturas publicadas.
    const unpublishedView = { ...trackingViewFor(signed, [], false), identityAccess: [entry] };
    expect(await check([neighbor], unpublishedView)).toMatchObject({ status: 'consistent' });
  });

  it('normaliza la conducta a su clave principal antes de sellar y enviar', () => {
    const normalized = normalizeSubmissionInput({
      ...SEALED_INPUT,
      facts: { ...FACTS, offenseCode: 'CPF-222' },
    });
    expect(normalized.facts.offenseCode).toBe('LGRA-52');
  });

  it('en modo anónimo no envía identidad ni solicitud de protección', () => {
    const { keys } = createReceipt();
    const request = buildSubmitRequest(
      { mode: 'anonymous', facts: FACTS, evidence: [], protectionRequested: true },
      keys,
      undefined,
    );
    expect(request.sealedIdentity).toBeUndefined();
    expect(request.protectionRequested).toBe(false);
  });

  it('rechaza un recibo con una palabra fuera de la lista con su posición, sin citarla', () => {
    const words = createReceipt().words;
    const wrong = [words[0] ?? '', 'zzzz', ...words.slice(2)];
    let caught: unknown;
    try {
      startTrackingSession(FOLIO, wrong);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReceiptPhraseError);
    expect((caught as ReceiptPhraseError).position).toBe(2);
    expect((caught as ReceiptPhraseError).message).not.toContain('zzzz');
  });
});

describe('buzón', () => {
  it('cifra y firma en ambos sentidos con la secuencia siguiente de cada remitente', async () => {
    const deployment = createTestDeployment();
    const { pinned } = deployment;
    const receipt = createReceipt();
    const request = buildSubmitRequest(
      { mode: 'anonymous', facts: FACTS, evidence: [], protectionRequested: false },
      receipt.keys,
      undefined,
    );
    const keys = importAuthorityKey(authorityKeyFile(deployment), pinned);
    const session = startTrackingSession(FOLIO, receipt.words);

    const first = await sealAuthorityQuestion('¿Recuerda el contrato?', detailFor(request), keys);
    expect(first.sequence).toBe(0);
    const messages = [toMessage(first, 'authority', 'a')];
    const reply = await sealReporterReply(
      'Sí, el contrato sintético 1.',
      session,
      pinned,
      messages,
    );
    expect(reply).toMatchObject({ folio: FOLIO, sequence: 0 });
    messages.push(toMessage(reply, 'reporter', 'b'));
    const second = await sealAuthorityQuestion('¿Algo más?', detailFor(request, messages), keys);
    expect(second.sequence).toBe(1);
    messages.push(toMessage(second, 'authority', 'c'));

    const reporterThread = await decodeReporterThread(messages, session, pinned);
    expect(reporterThread[0]).toMatchObject({ state: 'opened', text: '¿Recuerda el contrato?' });
    expect(reporterThread[1]).toMatchObject({ state: 'sealed-for-authority' });
    expect(reporterThread[2]).toMatchObject({ state: 'opened', text: '¿Algo más?' });
    const authorityThread = await decodeAuthorityThread(detailFor(request, messages), keys);
    expect(authorityThread[1]).toMatchObject({
      state: 'opened',
      text: 'Sí, el contrato sintético 1.',
    });

    // Un mensaje firmado con otra llave o con la secuencia cambiada no se muestra.
    const forged = await decodeReporterThread(messages, session, createTestDeployment().pinned);
    expect(forged[0]).toMatchObject({ state: 'unreadable' });
    const reordered = [{ ...messages[0], sequence: 1 } as MailboxMessage];
    expect((await decodeReporterThread(reordered, session, pinned))[0]).toMatchObject({
      state: 'unreadable',
    });
  });

  it('rechaza mensajes vacíos o más largos que el máximo', async () => {
    const deployment = createTestDeployment();
    const session = startTrackingSession(FOLIO, createReceipt().words);
    await expect(sealReporterReply('', session, deployment.pinned, [])).rejects.toThrow(/vacío/u);
    await expect(
      sealReporterReply('a'.repeat(1001), session, deployment.pinned, []),
    ).rejects.toThrow(/1000/u);
  });
});

describe('llave de autoridad', () => {
  it('rechaza una llave que no corresponde a la fijada o un archivo mal formado', () => {
    const deployment = createTestDeployment();
    const other = createTestDeployment();
    expect(() => importAuthorityKey(authorityKeyFile(other), deployment.pinned)).toThrow(
      /no corresponde/u,
    );
    expect(() => importAuthorityKey('{', deployment.pinned)).toThrow(/no es una llave/u);
    expect(() => importAuthorityKey('{"version":2}', deployment.pinned)).toThrow(
      /no es una llave/u,
    );
  });

  it('rechaza una privada que no corresponde a su pública', () => {
    const deployment = createTestDeployment();
    const file = JSON.parse(authorityKeyFile(deployment)) as Record<string, string>;
    file['boxPrivateKey'] = toBase64Url(createTestDeployment().authorityBox.privateKey);
    expect(() => importAuthorityKey(JSON.stringify(file), deployment.pinned)).toThrow(
      /no es una llave/u,
    );
  });
});

describe('bitácora', () => {
  function buildLedger(count: number) {
    const deployment = createTestDeployment();
    const events: LedgerEvent[] = [];
    let previous: LedgerEvent | null = null;
    for (let index = 0; index < count; index++) {
      previous = buildEvent(previous, {
        type: 'complaint.received',
        folio: FOLIO,
        at: RECEIVED_ON,
        actorRole: 'system',
        payload: { index },
      });
      events.push(previous);
    }
    const last = events.at(-1);
    const head = signLedgerHead(
      {
        seq: last?.seq ?? 0,
        hash: last?.hash ?? '0'.repeat(64),
        at: RECEIVED_ON,
        serverKeyId: deployment.pinned.set.server.keyId,
      },
      deployment.server.privateKey,
    );
    return { deployment, events, head };
  }

  it('acepta una cadena íntegra y detecta un evento alterado', () => {
    const { deployment, events, head } = buildLedger(3);
    const key = deployment.pinned.serverSigningPublicKey;
    expect(evaluateLedger(events, head, key)).toMatchObject({ status: 'valid', eventCount: 3 });
    const tampered = events.map((event, index) =>
      index === 1 ? { ...event, payloadDigest: 'f'.repeat(64) } : event,
    );
    expect(evaluateLedger(tampered, head, key)).toMatchObject({
      status: 'broken-chain',
      failedAtSeq: 1,
      reason: 'hash',
    });
    expect(evaluateLedger(events.slice(0, 2), head, key)).toMatchObject({
      status: 'head-mismatch',
    });
    expect(
      evaluateLedger(events, head, createTestDeployment().pinned.serverSigningPublicKey),
    ).toMatchObject({ status: 'bad-head-signature' });
  });

  it('acepta la bitácora vacía con la cabeza génesis', () => {
    const { deployment, events, head } = buildLedger(0);
    expect(evaluateLedger(events, head, deployment.pinned.serverSigningPublicKey)).toMatchObject({
      status: 'valid',
      eventCount: 0,
    });
  });

  it('descarga por páginas hasta la cabeza', async () => {
    const { deployment, events, head } = buildLedger(5);
    const requested: number[] = [];
    const result = await downloadAndVerifyLedger(
      async () => head,
      async (from, limit) => {
        requested.push(from);
        return { events: events.slice(from, from + Math.min(limit, 2)), head };
      },
      deployment.pinned.serverSigningPublicKey,
    );
    expect(result).toMatchObject({ status: 'valid', eventCount: 5 });
    expect(requested[0]).toBe(0);
  });

  it('compara la cadena con uno o varios anclajes publicados', () => {
    const { deployment, events } = buildLedger(4);
    const key = deployment.pinned.serverSigningPublicKey;
    const anchoredAt = (index: number) => {
      const event = events[index];
      if (event === undefined) throw new Error('Falta el evento anclado.');
      return event;
    };
    const anchorFor = (index: number, hash?: string, signer: TestDeployment = deployment) => {
      const event = anchoredAt(index);
      return {
        version: 1 as const,
        anchoredOn: `2026-10-2${index}`,
        head: signLedgerHead(
          {
            seq: event.seq,
            hash: hash ?? event.hash,
            at: event.at,
            serverKeyId: signer.pinned.set.server.keyId,
          },
          signer.server.privateKey,
        ),
      };
    };
    expect(compareWithAnchor(events, anchorFor(2), key)).toMatchObject({ status: 'matches' });
    expect(compareWithAnchor(events.slice(0, 2), anchorFor(2), key)).toMatchObject({
      status: 'missing',
    });
    expect(compareWithAnchor(events, anchorFor(2, '9'.repeat(64)), key)).toMatchObject({
      status: 'mismatch',
    });
    const foreign = createTestDeployment();
    expect(compareWithAnchor(events, anchorFor(2, undefined, foreign), key)).toMatchObject({
      status: 'bad-signature',
    });

    // Varios archivos pegados uno tras otro, o un arreglo: se comparan todos.
    const pasted = [anchorFor(1), anchorFor(2, '9'.repeat(64)), anchorFor(3)]
      .map((anchor) => JSON.stringify(anchor, null, 2))
      .join('\n');
    const compared = compareWithAnchors(events, pasted, key);
    expect(compared.status).toBe('compared');
    if (compared.status === 'compared') {
      expect(compared.results.map((result) => result.status)).toEqual([
        'matches',
        'mismatch',
        'matches',
      ]);
    }
    expect(parseLedgerAnchors(JSON.stringify([anchorFor(1), anchorFor(3)]))).toHaveLength(2);
    expect(parseLedgerAnchors(JSON.stringify(anchorFor(1)))).toHaveLength(1);
    for (const invalid of [
      '{"version":1}',
      'no es JSON',
      '',
      `${JSON.stringify(anchorFor(1))} x`,
    ]) {
      expect(compareWithAnchors(events, invalid, key), invalid).toEqual({ status: 'invalid' });
    }
  });
});

describe('llaves del buzón frente al registro público', () => {
  it('recalcula el digesto del envío desde el detalle y lo compara con el evento publicado', async () => {
    const deployment = createTestDeployment();
    const receipt = createReceipt();
    const request = buildSubmitRequest(
      { mode: 'anonymous', facts: FACTS, evidence: EVIDENCE, protectionRequested: false },
      receipt.keys,
      undefined,
    );
    const event = receivedEventFor(signedReceiptFor(request, deployment));
    const head = headFor(deployment, event.seq, event.hash);
    const fetchPage = async () => ({ events: [event], head });
    const detail = { ...detailFor(request), receivedEventSeq: event.seq };
    expect(await verifyReporterKeys(detailFor(request), fetchPage, deployment.pinned)).toBe(
      'pending',
    );
    expect(await verifyReporterKeys(detail, fetchPage, deployment.pinned)).toBe('verified');
    const other = createReceipt();
    const swapped = {
      ...detail,
      reporterKeys: { ...detail.reporterKeys, boxPublicKey: toBase64Url(other.keys.box.publicKey) },
    };
    expect(await verifyReporterKeys(swapped, fetchPage, deployment.pinned)).toBe('mismatch');
    // Una cabeza firmada por otra llave o un evento ausente tampoco verifican.
    expect(await verifyReporterKeys(detail, fetchPage, createTestDeployment().pinned)).toBe(
      'mismatch',
    );
    expect(
      await verifyReporterKeys(detail, async () => ({ events: [], head }), deployment.pinned),
    ).toBe('mismatch');
  });

  it('rechaza un evento fabricado con hash coherente frente a la cabeza real', async () => {
    const deployment = createTestDeployment();
    const receipt = createReceipt();
    const request = buildSubmitRequest(
      { mode: 'anonymous', facts: FACTS, evidence: EVIDENCE, protectionRequested: false },
      receipt.keys,
      undefined,
    );
    const event = receivedEventFor(signedReceiptFor(request, deployment));
    const later = buildEvent(event, {
      type: 'message.sent',
      folio: FOLIO,
      at: '2026-10-21',
      actorRole: 'reporter',
      payload: {},
    });
    const head = headFor(deployment, later.seq, later.hash, later.at);
    const chain = [event, later];
    const realPage = async (from: number) => ({
      events: chain.filter((item) => item.seq >= from),
      head,
    });
    const detail = { ...detailFor(request), receivedEventSeq: event.seq };
    // El tramo completo hasta la cabeza verifica.
    expect(await verifyReporterKeys(detail, realPage, deployment.pinned)).toBe('verified');
    // El servidor sustituye las llaves y fabrica el evento de esa posición.
    const other = createReceipt();
    const forgedDetail = {
      ...detail,
      reporterKeys: {
        boxPublicKey: toBase64Url(other.keys.box.publicKey),
        signingPublicKey: toBase64Url(other.keys.signing.publicKey),
      },
    };
    const unhashed = {
      ...event,
      payloadDigest: receivedPayloadDigest(FOLIO, submissionDigestFromDetail(forgedDetail)),
    };
    const forged = { ...unhashed, hash: computeEventHash(unhashed) };
    const forgedPage = async (from: number) => ({
      events: [forged, later].filter((item) => item.seq >= from),
      head,
    });
    expect(await verifyReporterKeys(forgedDetail, forgedPage, deployment.pinned)).toBe('mismatch');
    const onlyForged = async () => ({ events: [forged], head: headFor(deployment, 0, event.hash) });
    expect(await verifyReporterKeys(forgedDetail, onlyForged, deployment.pinned)).toBe('mismatch');
    // Un anclaje que no coincide con el tramo también lo rechaza.
    const anchor = {
      version: 1 as const,
      anchoredOn: '2026-10-21',
      head: headFor(deployment, 1, 'a'.repeat(64), '2026-10-21'),
    };
    expect(await verifyReporterKeys(detail, realPage, deployment.pinned, [anchor])).toBe(
      'mismatch',
    );
    // Un anclaje anterior al evento cuyo tramo no se puede descargar: las llaves coinciden, pero
    // la comparación con los anclajes se reporta como no hecha, nunca como verificada.
    const before = buildEvent(null, {
      type: 'message.sent',
      folio: FOLIO,
      at: '2026-10-19',
      actorRole: 'reporter',
      payload: {},
    });
    const shiftedEvent = receivedEventFor(signedReceiptFor(request, deployment), before);
    const shiftedHead = headFor(deployment, shiftedEvent.seq, shiftedEvent.hash);
    const shifted = { ...detail, receivedEventSeq: shiftedEvent.seq };
    const earlier = {
      version: 1 as const,
      anchoredOn: '2026-10-19',
      head: headFor(deployment, before.seq, before.hash, '2026-10-19'),
    };
    const withoutPrefix = async (from: number) => {
      if (from < shiftedEvent.seq) throw new Error('sin red');
      return { events: [shiftedEvent], head: shiftedHead };
    };
    expect(await verifyReporterKeys(shifted, withoutPrefix, deployment.pinned, [earlier])).toBe(
      'anchors-not-comparable',
    );
    const withPrefix = async (from: number) => ({
      events: [before, shiftedEvent].filter((item) => item.seq >= from),
      head: shiftedHead,
    });
    expect(await verifyReporterKeys(shifted, withPrefix, deployment.pinned, [earlier])).toBe(
      'verified',
    );
  });

  it('también en modo sellado, con el digesto del sobre', async () => {
    const deployment = createTestDeployment();
    const receipt = createReceipt();
    const block = buildIdentityBlock({ fullName: 'Persona Uno', contact: '', witnesses: [] }, []);
    const sealed = await sealReporterIdentity(block, SEALED_INPUT, receipt.keys, deployment.pinned);
    const request = buildSubmitRequest(SEALED_INPUT, receipt.keys, sealed);
    const event = receivedEventFor(signedReceiptFor(request, deployment));
    const head = headFor(deployment, event.seq, event.hash);
    const detail = { ...detailFor(request), receivedEventSeq: event.seq };
    const fetchPage = async () => ({ events: [event], head });
    expect(await verifyReporterKeys(detail, fetchPage, deployment.pinned)).toBe('verified');
    const otherDigest = { ...detail, sealedIdentityDigest: 'a'.repeat(64) };
    expect(await verifyReporterKeys(otherDigest, fetchPage, deployment.pinned)).toBe('mismatch');
  });
});
