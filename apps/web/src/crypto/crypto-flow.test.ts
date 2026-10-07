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
  computeSubmissionDigest,
  IDENTITY_PADDED_SIZE,
  identityOpenedPayload,
  keyIdFor,
  ReceiptPhraseError,
  receivedPayloadDigest,
  sealedIdentityDigest,
  signLedgerHead,
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

function receivedEventFor(receipt: SignedReceipt): LedgerEvent {
  return buildEvent(null, {
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

  it('compara el evento de recepción con la bitácora pública', async () => {
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
    // Pendiente de publicar: la cabeza pública todavía no llega a su día.
    expect(
      await checkPublishedEvent(pendingView, async () => ({ events: [], head: genesis })),
    ).toBe('pending');
    expect(
      await checkPublishedEvent(pendingView, async () => ({ events: [], head: earlierHead })),
    ).toBe('pending');
    // El seguimiento dice pendiente, pero la cabeza pública ya publicó su día.
    expect(
      await checkPublishedEvent(pendingView, async () => ({ events: [], head: publishedHead })),
    ).toBe('mismatch');
    expect(
      await checkPublishedEvent(view, async () => ({ events: [event], head: publishedHead })),
    ).toBe('published');
    const other = { ...event, payloadDigest: 'f'.repeat(64) };
    expect(
      await checkPublishedEvent(view, async () => ({ events: [other], head: publishedHead })),
    ).toBe('mismatch');
    // El seguimiento dice que se publicó, pero la bitácora pública no lo tiene.
    expect(await checkPublishedEvent(view, async () => ({ events: [], head: publishedHead }))).toBe(
      'mismatch',
    );
  });

  it('busca en toda la bitácora las aperturas con la etiqueta del recibo', async () => {
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
    const view = { ...trackingViewFor(signed), identityAccess: [entry] };
    const serve = (events: LedgerEvent[]) => {
      const last = events.at(-1);
      const head = headFor(deployment, last?.seq ?? 0, last?.hash ?? '0'.repeat(64));
      return {
        fetchHead: async () => head,
        fetchPage: async (from: number) => ({ events: events.slice(from), head }),
      };
    };
    const check = (events: LedgerEvent[], current: TrackingView = view) => {
      const { fetchHead, fetchPage } = serve(events);
      return checkIdentityOpenings(current, session, deployment.pinned, fetchHead, fetchPage);
    };

    const own = openingEvent(FOLIO, entry.openingId, null);
    const consistent = await check([own]);
    expect(consistent.status).toBe('consistent');
    if (consistent.status === 'consistent') {
      expect([...consistent.publishedOpeningIds]).toEqual([entry.openingId]);
    }
    // Una apertura registrada con otro folio, pero ligada al mismo recibo, se detecta.
    const hidden = openingEvent('ZZZZ-ZZZZ-ZZZZ', '2'.repeat(32), own);
    expect(await check([own, hidden])).toEqual({ status: 'hidden', hiddenCount: 1 });
    // Una apertura del seguimiento cuyo día ya se publicó debe estar en la bitácora.
    const unrelated = buildEvent(null, {
      type: 'complaint.received',
      folio: 'ZZZZ-ZZZZ-ZZZZ',
      at: RECEIVED_ON,
      actorRole: 'system',
      payload: {},
    });
    expect(await check([unrelated])).toEqual({ status: 'unpublished', unpublished: [entry] });
    // Con la bitácora vacía todavía está pendiente; con una cadena rota no se puede saber.
    expect(await check([])).toMatchObject({ status: 'consistent' });
    expect(await check([{ ...own, payloadDigest: 'f'.repeat(64) }])).toEqual({
      status: 'unknown',
    });
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
