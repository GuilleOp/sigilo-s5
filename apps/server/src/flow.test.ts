// Prueba de flujo completo: denuncia sellada, buzón en ambos sentidos, apertura, estatus y bitácora.
import { describe, expect, it } from 'vitest';
import {
  ComplaintDetailSchema,
  LedgerPageSchema,
  OpenIdentityResponseSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import {
  fromBase64Url,
  identityContextFromDetail,
  isMailboxSequenceComplete,
  keyIdFor,
  openIdentity,
  openMailboxMessage,
  sealMailboxMessage,
  verifyChain,
  verifyLedgerHead,
  verifyReceipt,
  verifyReceiptEvent,
} from '@sigilo/core';
import {
  authorityRecipient,
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  postJson,
  sampleJpeg,
  submitComplaint,
  SYNTHETIC_IDENTITY,
  TEST_TOKEN,
  uploadEvidence,
} from './test-support/harness.ts';

describe('flujo completo', () => {
  it('recorre recepción, trámite y seguimiento con una bitácora verificable', async () => {
    const server = createTestServer();
    const reporter = createReporter();

    const upload = await uploadEvidence(server.app, sampleJpeg(256), 'image/jpeg');
    const evidence = (await upload.json()) as EvidenceDescriptor;
    const request = await buildComplaintRequest(server, {
      mode: 'sealed',
      reporter,
      evidence: [evidence],
    });
    const { folio, receipt } = await submitComplaint(server, request);
    expect(verifyReceipt(receipt, server.serverPublicKey)).toBe(true);

    // La persona denunciante escribe a la autoridad.
    server.setNow(new Date('2026-10-21T10:30:00Z'));
    const toAuthority = await sealMailboxMessage(
      'Complemento sintético.',
      authorityRecipient(server),
      reporter.signing.privateKey,
      { folio, from: 'reporter', sequence: 0 },
    );
    const sent = await postJson(server.app, ROUTES.trackingMessages, {
      ...credentialsFor(folio, reporter),
      ...toAuthority,
    });
    expect(sent.status).toBe(201);

    // La autoridad lee el detalle, abre el mensaje y responde.
    const detail = ComplaintDetailSchema.parse(
      await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folio))).json(),
    );
    const [incoming] = detail.messages;
    if (!incoming) throw new Error('Falta el mensaje.');
    const reporterSigningKey = fromBase64Url(detail.reporterKeys.signingPublicKey);
    await expect(
      openMailboxMessage(incoming, server.authorityBox.privateKey, reporterSigningKey, folio),
    ).resolves.toBe('Complemento sintético.');
    const reporterBoxKey = fromBase64Url(detail.reporterKeys.boxPublicKey);
    const reply = await sealMailboxMessage(
      'Pregunta sintética.',
      { keyId: keyIdFor(reporterBoxKey), publicKey: reporterBoxKey },
      server.authoritySigning.privateKey,
      { folio, from: 'authority', sequence: 0 },
    );
    const replied = await postJson(server.app, ROUTES.authorityMessages(folio), reply, TEST_TOKEN);
    expect(replied.status).toBe(201);

    // La autoridad abre la identidad con el contexto recalculado desde el detalle.
    const openResponse = await postJson(
      server.app,
      ROUTES.authorityIdentity(folio),
      { legalBasis: 'Fundamento sintético: orden de la autoridad investigadora.' },
      TEST_TOKEN,
    );
    const opened = OpenIdentityResponseSchema.parse(await openResponse.json());
    const identity = await openIdentity(
      opened.sealedIdentity,
      server.authorityBox.privateKey,
      identityContextFromDetail(detail),
    );
    expect(identity).toEqual(SYNTHETIC_IDENTITY);
    server.setNow(new Date('2026-10-25T12:00:00Z'));
    await postJson(
      server.app,
      ROUTES.authorityStatus(folio),
      { status: 'investigating' },
      TEST_TOKEN,
    );

    // La persona denunciante ve todo en su seguimiento y verifica su evento de recepción.
    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.status).toBe('investigating');
    expect(view.timeline.map((entry) => entry.status)).toEqual(['received', 'investigating']);
    expect(view.identityAccess).toHaveLength(1);
    expect(view.messages.map((message) => [message.from, message.sequence])).toEqual([
      ['reporter', 0],
      ['authority', 0],
    ]);
    expect(isMailboxSequenceComplete(view.messages)).toBe(true);
    expect(verifyReceiptEvent(view.receivedEvent, view.receipt)).toBe(true);

    // Al día siguiente, la bitácora pública es una cadena íntegra con cabeza firmada.
    server.setNow(new Date('2026-10-26T00:00:01Z'));
    const page = LedgerPageSchema.parse(
      await (await server.app.request(ROUTES.ledgerEvents)).json(),
    );
    expect(page.events.map((event) => [event.type, event.actorRole])).toEqual([
      ['complaint.received', 'system'],
      ['message.sent', 'reporter'],
      ['message.sent', 'authority'],
      ['identity.opened', 'authority'],
      ['complaint.status_changed', 'authority'],
    ]);
    expect(verifyChain(page.events)).toEqual({ valid: true });
    expect(verifyLedgerHead(page.head, server.serverPublicKey)).toBe(true);
    expect(page.head.hash).toBe(page.events.at(-1)?.hash);
    expect(page.events[receipt.ledgerSeq]).toEqual(view.receivedEvent);
  });
});
