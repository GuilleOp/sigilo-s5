// Prueba de flujo completo: denuncia sellada, buzón en ambos sentidos, apertura, estatus y bitácora.
import { describe, expect, it } from 'vitest';
import {
  ComplaintDetailSchema,
  LedgerPageSchema,
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
  messageBody,
  moveTo,
  openIdentityTwoOfThree,
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
    await server.advanceTo(new Date('2026-10-21T10:30:00Z'));
    const toAuthority = await sealMailboxMessage(
      'Complemento sintético.',
      authorityRecipient(server),
      reporter.signing.privateKey,
      { folio, from: 'reporter', sequence: 0 },
    );
    const sent = await postJson(server.app, ROUTES.trackingMessages, {
      ...credentialsFor(folio, reporter),
      ...messageBody(toAuthority),
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
    const replied = await postJson(
      server.app,
      ROUTES.authorityMessages(folio),
      messageBody(reply),
      TEST_TOKEN,
    );
    expect(replied.status).toBe(201);

    // La autoridad abre la identidad con el contexto recalculado desde el detalle.
    // Apertura 2 de 3: la pide una persona y la aprueba otra de la misma autoridad.
    const opened = await openIdentityTwoOfThree(
      server,
      folio,
      'Fundamento sintético: orden de la autoridad investigadora.',
    );
    const identity = await openIdentity(
      opened.sealedIdentity,
      server.authorityBox.privateKey,
      identityContextFromDetail(detail),
    );
    expect(identity).toEqual(SYNTHETIC_IDENTITY);
    await server.advanceTo(new Date('2026-10-25T12:00:00Z'));
    // El buzón general la turna y la autoridad turnada la devuelve: vuelve a buscar autoridad.
    await moveTo(server, folio, 'routing');

    // La persona denunciante ve todo en su seguimiento y verifica su evento de recepción.
    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.status).toBe('routing');
    expect(view.timeline.map((entry) => entry.status)).toEqual(['received', 'routed', 'routing']);
    expect(view.procedure?.steps.map((step) => step.action)).toEqual([
      'received',
      'routed',
      'returned_to_inbox',
    ]);
    expect(view.identityAccess).toHaveLength(1);
    expect(view.messages.map((message) => [message.from, message.sequence])).toEqual([
      ['reporter', 0],
      ['authority', 0],
    ]);
    expect(isMailboxSequenceComplete(view.messages)).toBe(true);
    // El día de recepción ya cerró: su evento está publicado y corresponde al comprobante.
    if (view.receivedEvent === undefined) throw new Error('Falta el evento de recepción.');
    expect(verifyReceiptEvent(view.receivedEvent, view.receipt)).toBe(true);

    // Al día siguiente, la bitácora pública es una cadena íntegra con cabeza firmada.
    await server.advanceTo(new Date('2026-10-26T00:00:01Z'));
    const page = LedgerPageSchema.parse(
      await (await server.app.request(ROUTES.ledgerEvents)).json(),
    );
    const described = page.events.map((event) => `${event.at} ${event.type} ${event.actorRole}`);
    // Cada día va completo y en orden de días; dentro del día el orden es barajado.
    expect(described[0]).toBe('2026-10-20 complaint.received system');
    // La apertura 2 de 3 deja dos aprobaciones, la apertura misma y la entrega del sobre (H7).
    expect(described.slice(1, 7).sort()).toEqual([
      '2026-10-21 identity.approved authority',
      '2026-10-21 identity.approved authority',
      '2026-10-21 identity.opened authority',
      '2026-10-21 identity.released authority',
      '2026-10-21 message.sent authority',
      '2026-10-21 message.sent reporter',
    ]);
    // Turnar y devolver al buzón general son dos acciones del trámite.
    expect(described.slice(7)).toEqual([
      '2026-10-25 complaint.status_changed authority',
      '2026-10-25 complaint.status_changed authority',
    ]);
    expect(verifyChain(page.events)).toEqual({ valid: true });
    expect(verifyLedgerHead(page.head, server.serverPublicKey)).toBe(true);
    expect(page.head.hash).toBe(page.events.at(-1)?.hash);
    const published = page.events.find((event) => event.payloadDigest === receipt.payloadDigest);
    expect(published).toEqual(view.receivedEvent);
  });
});
