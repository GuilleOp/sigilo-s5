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
  keyIdFor,
  ReceiptPhraseError,
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
} from './authority.ts';
import { assertServedKeysMatch, diffPublicKeys, KeyMismatchError } from './key-pinning.ts';
import {
  compareWithAnchor,
  downloadAndVerifyLedger,
  evaluateLedger,
} from './ledger-verification.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  identityBlockSize,
  identityFitsEnvelope,
  sealReporterIdentity,
  verifySubmission,
} from './submission.ts';
import type { SubmissionInput } from './submission.ts';
import { createTestDeployment } from './test-keys.ts';
import type { TestDeployment } from './test-keys.ts';
import {
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
    messages,
    identityOpenedCount: 0,
  };
}

function signedReceiptFor(
  request: SubmitComplaintRequest,
  deployment: TestDeployment,
): SignedReceipt {
  return signReceipt(
    {
      folio: FOLIO,
      submissionDigest: computeSubmissionDigest(request),
      receivedOn: RECEIVED_ON,
      ledgerSeq: 0,
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

function trackingViewFor(receipt: SignedReceipt, messages: MailboxMessage[] = []): TrackingView {
  return {
    folio: FOLIO,
    mode: 'sealed',
    status: 'received',
    timeline: [],
    identityAccess: [],
    messages,
    receipt,
    receivedEvent: receivedEventFor(receipt),
  };
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
      { sealedIdentity: sealed, ledgerSeq: 1 },
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
      openSealedIdentity({ sealedIdentity: sealed, ledgerSeq: 1 }, detailFor(request), keys),
    ).resolves.toMatchObject({ fullName: 'Persona Uno' });
  });

  it('no abre si el servidor altera hechos, pruebas, llaves o el verificador (trasplante)', async () => {
    const { sealed, request, keys } = await sealedSubmission();
    const response = { sealedIdentity: sealed, ledgerSeq: 1 };
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
    expect(verifyTrackingReceipt(view, pinned)).toEqual({
      isReceiptValid: true,
      isEventValid: true,
    });
    const forgedEvent = { ...view.receivedEvent, payloadDigest: 'f'.repeat(64) };
    expect(verifyTrackingReceipt({ ...view, receivedEvent: forgedEvent }, pinned)).toEqual({
      isReceiptValid: true,
      isEventValid: false,
    });
    expect(verifyTrackingReceipt(view, createTestDeployment().pinned)).toEqual({
      isReceiptValid: false,
      isEventValid: false,
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
    const view = trackingViewFor(signedReceiptFor(request, deployment));
    const genesis = signLedgerHead(
      {
        seq: 0,
        hash: '0'.repeat(64),
        at: RECEIVED_ON,
        serverKeyId: deployment.pinned.set.server.keyId,
      },
      deployment.server.privateKey,
    );
    const publishedHead = signLedgerHead(
      {
        seq: 0,
        hash: view.receivedEvent.hash,
        at: RECEIVED_ON,
        serverKeyId: deployment.pinned.set.server.keyId,
      },
      deployment.server.privateKey,
    );
    // El mismo día la página viene vacía y la cabeza es el génesis: se publicará mañana.
    expect(await checkPublishedEvent(view, async () => ({ events: [], head: genesis }))).toBe(
      'pending',
    );
    expect(
      await checkPublishedEvent(view, async () => ({
        events: [view.receivedEvent],
        head: publishedHead,
      })),
    ).toBe('published');
    const other = { ...view.receivedEvent, payloadDigest: 'f'.repeat(64) };
    expect(
      await checkPublishedEvent(view, async () => ({ events: [other], head: publishedHead })),
    ).toBe('mismatch');
    // La cabeza pública ya pasó de esa secuencia pero el evento no aparece.
    expect(await checkPublishedEvent(view, async () => ({ events: [], head: publishedHead }))).toBe(
      'mismatch',
    );
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

  it('compara la cadena con un anclaje publicado', () => {
    const { deployment, events } = buildLedger(4);
    const key = deployment.pinned.serverSigningPublicKey;
    const anchored = events[2];
    if (anchored === undefined) throw new Error('Falta el evento anclado.');
    const anchorFor = (hash: string, signer: TestDeployment = deployment) =>
      JSON.stringify({
        version: 1,
        anchoredOn: '2026-10-21',
        head: signLedgerHead(
          { seq: anchored.seq, hash, at: anchored.at, serverKeyId: signer.pinned.set.server.keyId },
          signer.server.privateKey,
        ),
      });
    expect(compareWithAnchor(events, anchorFor(anchored.hash), key)).toMatchObject({
      status: 'matches',
    });
    expect(compareWithAnchor(events.slice(0, 2), anchorFor(anchored.hash), key)).toMatchObject({
      status: 'missing',
    });
    expect(compareWithAnchor(events, anchorFor('9'.repeat(64)), key)).toMatchObject({
      status: 'mismatch',
    });
    const foreign = createTestDeployment();
    expect(compareWithAnchor(events, anchorFor(anchored.hash, foreign), key)).toEqual({
      status: 'bad-signature',
    });
    expect(compareWithAnchor(events, '{"version":1}', key)).toEqual({ status: 'invalid' });
    expect(compareWithAnchor(events, 'no es JSON', key)).toEqual({ status: 'invalid' });
  });
});
