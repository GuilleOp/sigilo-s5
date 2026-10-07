// Pruebas de la orquestación criptográfica: llaves fijadas, envío, seguimiento, autoridad y bitácora.
import { describe, expect, it } from 'vitest';
import type { ComplaintDetail, MailboxMessage, SubmitComplaintResponse } from '@sigilo/contracts';
import {
  buildEvent,
  computeSubmissionDigest,
  keyIdFor,
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
import { downloadAndVerifyLedger, evaluateLedger } from './ledger-verification.ts';
import {
  buildIdentityBlock,
  buildSubmitRequest,
  createReceipt,
  sealReporterIdentity,
  verifySubmission,
} from './submission.ts';
import { createTestDeployment } from './test-keys.ts';
import {
  decodeReporterThread,
  sealReporterReply,
  startTrackingSession,
  verifyTrackingReceipt,
} from './tracking.ts';

const FOLIO = 'ABCD-EFGH-JKMN';
const FACTS = {
  stateCode: '22',
  entityId: 'VE-OBRAS',
  offenseCode: 'LGRA-52',
  occurredPeriod: '2026-03',
  accused: 'Servidor Ficticio Dos',
  description: 'Descripción sintética de una adjudicación directa irregular.',
};

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

describe('envío y seguimiento', () => {
  it('sella la identidad, verifica el comprobante y recupera las llaves con las 8 palabras', async () => {
    const deployment = createTestDeployment();
    const { pinned } = deployment;
    const receipt = createReceipt();
    expect(receipt.words).toHaveLength(8);

    const block = buildIdentityBlock(
      { fullName: ' Persona Denunciante Uno ', contact: '', witnesses: ['Testigo Ficticio', ' '] },
      ['c'.repeat(64)],
    );
    expect(block).toEqual({
      fullName: 'Persona Denunciante Uno',
      witnesses: ['Testigo Ficticio'],
      originalEvidenceSha256: ['c'.repeat(64)],
    });
    const sealed = await sealReporterIdentity(block, receipt.keys, pinned);
    const request = buildSubmitRequest(
      { mode: 'sealed', facts: FACTS, evidence: [], protectionRequested: true },
      receipt.keys,
      sealed,
    );
    expect(request.sealedIdentity?.keyId).toBe(pinned.set.authority.keyId);

    const signed = signReceipt(
      {
        folio: FOLIO,
        submissionDigest: computeSubmissionDigest(request),
        receivedOn: '2026-10-20',
        ledgerSeq: 0,
        serverKeyId: pinned.set.server.keyId,
      },
      deployment.server.privateKey,
    );
    const response: SubmitComplaintResponse = { folio: FOLIO, receipt: signed };
    expect(verifySubmission(request, response, pinned)).toBe(true);
    expect(verifySubmission({ ...request, protectionRequested: false }, response, pinned)).toBe(
      false,
    );

    // La autoridad abre la identidad con el authVerifier que entrega el servidor.
    const authorityKeys = await importAuthorityKey(
      JSON.stringify({
        version: 1,
        keyId: pinned.set.authority.keyId,
        boxPublicKey: toBase64Url(deployment.authorityBox.publicKey),
        boxPrivateKey: toBase64Url(deployment.authorityBox.privateKey),
        signingPublicKey: toBase64Url(deployment.authoritySigning.publicKey),
        signingPrivateKey: toBase64Url(deployment.authoritySigning.privateKey),
      }),
      pinned,
    );
    const identity = await openSealedIdentity(
      { sealedIdentity: sealed, authVerifier: request.authVerifier, ledgerSeq: 1 },
      authorityKeys,
    );
    expect(identity.fullName).toBe('Persona Denunciante Uno');

    // La persona recupera sus llaves con las palabras (sin acentos ni mayúsculas).
    const typed = receipt.words.map((word) =>
      word.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase(),
    );
    const session = startTrackingSession(FOLIO, typed);
    expect(session.credentials.authKey).toBe(toBase64Url(receipt.keys.authKey));
    const view = {
      folio: FOLIO,
      mode: 'sealed' as const,
      status: 'received' as const,
      timeline: [],
      identityAccess: [],
      messages: [],
      receipt: signed,
    };
    expect(verifyTrackingReceipt(view, pinned)).toBe(true);

    // Buzón en ambos sentidos.
    const detail: ComplaintDetail = {
      summary: {
        folio: FOLIO,
        mode: 'sealed',
        status: 'received',
        receivedOn: '2026-10-20',
        stateCode: '22',
        offenseCode: 'LGRA-52',
        protectionRequested: true,
      },
      facts: FACTS,
      evidence: [],
      reporterBoxPublicKey: request.reporterKeys.boxPublicKey,
      reporterSigningPublicKey: request.reporterKeys.signingPublicKey,
      messages: [],
      identityOpenedCount: 0,
    };
    const question = await sealAuthorityQuestion('¿Recuerda el contrato?', detail, authorityKeys);
    const reply = await sealReporterReply('Sí, el contrato sintético 1.', session, pinned);
    const toMessage = (
      from: MailboxMessage['from'],
      sealedMessage: { envelope: MailboxMessage['envelope']; signature: string },
      id: string,
    ): MailboxMessage => ({
      messageId: id.repeat(32),
      from,
      sentOn: '2026-10-21T10:00Z',
      envelope: sealedMessage.envelope,
      signature: sealedMessage.signature,
    });
    const messages = [toMessage('authority', question, 'a'), toMessage('reporter', reply, 'b')];
    const reporterThread = await decodeReporterThread(messages, session, pinned);
    expect(reporterThread[0]).toMatchObject({ state: 'opened', text: '¿Recuerda el contrato?' });
    expect(reporterThread[1]).toMatchObject({ state: 'sealed-for-authority' });
    const authorityThread = await decodeAuthorityThread({ ...detail, messages }, authorityKeys);
    expect(authorityThread[1]).toMatchObject({
      state: 'opened',
      text: 'Sí, el contrato sintético 1.',
    });

    // Un mensaje firmado con otra llave no se muestra como de la autoridad.
    const forged = await decodeReporterThread(messages, session, createTestDeployment().pinned);
    expect(forged[0]).toMatchObject({ state: 'unreadable' });
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

  it('rechaza un recibo con una palabra fuera de la lista sin citarla', () => {
    const words = ['zzzz', ...createReceipt().words.slice(1)];
    expect(() => startTrackingSession(FOLIO, words)).toThrow(/palabra 1/u);
  });
});

describe('llave de autoridad', () => {
  it('rechaza una llave que no corresponde a la fijada', async () => {
    const deployment = createTestDeployment();
    const other = createTestDeployment();
    const file = JSON.stringify({
      version: 1,
      keyId: keyIdFor(other.authorityBox.publicKey),
      boxPublicKey: toBase64Url(other.authorityBox.publicKey),
      boxPrivateKey: toBase64Url(other.authorityBox.privateKey),
      signingPublicKey: toBase64Url(other.authoritySigning.publicKey),
      signingPrivateKey: toBase64Url(other.authoritySigning.privateKey),
    });
    await expect(importAuthorityKey(file, deployment.pinned)).rejects.toThrow(/no corresponde/u);
    await expect(importAuthorityKey('{', deployment.pinned)).rejects.toThrow(/no es una llave/u);
  });
});

describe('bitácora', () => {
  function buildLedger(count: number) {
    const deployment = createTestDeployment();
    const events = [];
    let previous = null;
    for (let index = 0; index < count; index++) {
      previous = buildEvent(previous, {
        type: 'complaint.received',
        folio: FOLIO,
        at: '2026-10-20',
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
        at: '2026-10-20',
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
});
