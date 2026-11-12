// Pruebas de la apertura de identidad 2 de 3: dos personas distintas de la autoridad competente,
// cada una con su fundamento; nadie aprueba dos veces, quien turna no participa y el sobre solo se
// entrega a quien aprobó después del umbral. La persona denunciante ve la apertura.
import { describe, expect, it } from 'vitest';
import {
  formatCriminalOpeningBasis,
  IdentityOpeningRequestViewSchema,
  OpenIdentityResponseSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import {
  identityContextFromDetail,
  identityOpenedPayloadDigest,
  openIdentity,
  reconcileIdentityOpenings,
} from '@sigilo/core';
import { ComplaintDetailSchema, LedgerPageSchema } from '@sigilo/contracts';
import { readText } from '../db/database.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  moveTo,
  postJson,
  procedureAs,
  submitComplaint,
  SYNTHETIC_IDENTITY,
  TEST_ACCOUNTS,
  testToken,
} from '../test-support/harness.ts';
import type { TestAccountName, TestServer } from '../test-support/harness.ts';

const FIRST_BASIS = 'Fundamento sintético: citar a la persona como testigo (art. 91).';
const SECOND_BASIS = 'Coincido: el testimonio es indispensable en el expediente sintético.';

async function setup() {
  const server = createTestServer();
  const reporter = createReporter();
  const request = await buildComplaintRequest(server, { mode: 'sealed', reporter });
  const { folio } = await submitComplaint(server, request);
  return { server, reporter, folio };
}

function post(server: TestServer, path: string, body: unknown, name: TestAccountName) {
  return postJson(server.app, path, body, testToken(name));
}

async function request(server: TestServer, folio: string, name: TestAccountName) {
  const response = await post(
    server,
    ROUTES.authorityIdentityRequests(folio),
    { legalBasis: FIRST_BASIS },
    name,
  );
  expect(response.status).toBe(201);
  return IdentityOpeningRequestViewSchema.parse(await response.json());
}

function approve(server: TestServer, folio: string, requestId: string, name: TestAccountName) {
  return post(
    server,
    ROUTES.authorityIdentityApprovals(folio, requestId),
    { legalBasis: SECOND_BASIS },
    name,
  );
}

function envelope(server: TestServer, folio: string, requestId: string, name: TestAccountName) {
  return post(server, ROUTES.authorityIdentityEnvelope(folio, requestId), {}, name);
}

describe('apertura de identidad 2 de 3', () => {
  it('una sola persona no puede abrir: ni con una solicitud ni aprobando dos veces', async () => {
    const { server, folio } = await setup();
    const pending = await request(server, folio, 'inboxInvestigator');
    expect(pending).toMatchObject({ status: 'pending', threshold: 2 });
    expect(pending.approvals.map((item) => item.accountId)).toEqual([
      TEST_ACCOUNTS.inboxInvestigator.accountId,
    ]);
    // Antes del umbral no hay sobre para nadie.
    expect((await envelope(server, folio, pending.requestId, 'inboxInvestigator')).status).toBe(
      409,
    );
    // La misma persona no cuenta dos veces.
    expect((await approve(server, folio, pending.requestId, 'inboxInvestigator')).status).toBe(409);
    const stillPending = ComplaintDetailSchema.parse(
      await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folio))).json(),
    );
    expect(stillPending.identityOpenedCount).toBe(0);
    expect(stillPending.identityRequests?.[0]?.approvals).toHaveLength(1);
    // Tampoco con dos solicitudes propias: cada una sigue con una sola aprobación.
    const another = await request(server, folio, 'inboxInvestigator');
    expect((await envelope(server, folio, another.requestId, 'inboxInvestigator')).status).toBe(
      409,
    );
  });

  it('con la aprobación de otra persona se abre, se registra y la persona denunciante lo ve', async () => {
    const { server, folio, reporter } = await setup();
    const detail = ComplaintDetailSchema.parse(
      await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folio))).json(),
    );
    const pending = await request(server, folio, 'inboxInvestigator');
    const approved = IdentityOpeningRequestViewSchema.parse(
      await (await approve(server, folio, pending.requestId, 'inboxSupervision')).json(),
    );
    expect(approved.status).toBe('approved');
    // Ya no admite más aprobaciones.
    expect((await approve(server, folio, pending.requestId, 'inboxInvestigator2')).status).toBe(
      409,
    );
    // Quien no aprobó no recibe el sobre, aunque sea de la misma autoridad.
    expect((await envelope(server, folio, pending.requestId, 'inboxInvestigator2')).status).toBe(
      403,
    );
    const released = await envelope(server, folio, pending.requestId, 'inboxSupervision');
    const opened = OpenIdentityResponseSchema.parse(await released.json());
    // El servidor solo entrega el sobre: se abre con la llave de la autoridad, fuera del servidor.
    await expect(
      openIdentity(
        opened.sealedIdentity,
        server.authorityBox.privateKey,
        identityContextFromDetail(detail),
      ),
    ).resolves.toEqual(SYNTHETIC_IDENTITY);

    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.identityAccess).toEqual([
      {
        on: '2026-10-20',
        actorRole: 'authority',
        legalBasis: FIRST_BASIS,
        openingId: pending.requestId,
        approvalCount: 2,
      },
    ]);
    // Bitácora: dos aprobaciones con actor (privado) y una apertura que concilia con el seguimiento.
    const approvals = server.db
      .prepare("SELECT payload_json FROM ledger_pending WHERE type = 'identity.approved'")
      .all()
      .map((row) => (JSON.parse(readText(row, 'payload_json')) as { actor: string }).actor);
    expect(approvals.sort()).toEqual(
      [TEST_ACCOUNTS.inboxInvestigator.accountId, TEST_ACCOUNTS.inboxSupervision.accountId].sort(),
    );
    await server.advanceTo(new Date('2026-10-21T09:00:00Z'));
    const page = LedgerPageSchema.parse(
      await (await server.app.request(ROUTES.ledgerEvents)).json(),
    );
    expect(page.events.filter((event) => event.type === 'identity.approved')).toHaveLength(2);
    const opening = page.events.find((event) => event.type === 'identity.opened');
    expect(opening?.payloadDigest).toBe(
      identityOpenedPayloadDigest({
        folio,
        openingId: pending.requestId,
        legalBasis: FIRST_BASIS,
        authVerifier: reporter.authVerifier,
      }),
    );
    expect(
      reconcileIdentityOpenings(page.events, view.identityAccess, {
        folio,
        authVerifier: reporter.authVerifier,
        publishedThrough: page.head.at,
      }),
    ).toEqual({ unlisted: [], unpublished: [] });
    // Cada entrega del sobre queda en el registro de seguridad.
    const releases = server.ctx.securityLog
      .listAll()
      .filter((event) => event.kind === 'identity_envelope_released');
    expect(releases.map((event) => event.accountId)).toEqual([
      TEST_ACCOUNTS.inboxSupervision.accountId,
    ]);
  });

  it('quien turna no solicita ni aprueba aperturas; otra autoridad recibe 404', async () => {
    const { server, folio } = await setup();
    const byIntake = await post(
      server,
      ROUTES.authorityIdentityRequests(folio),
      { legalBasis: FIRST_BASIS },
      'inboxIntake',
    );
    expect(byIntake.status).toBe(403);
    const pending = await request(server, folio, 'inboxInvestigator');
    expect((await approve(server, folio, pending.requestId, 'inboxIntake')).status).toBe(403);
    expect((await approve(server, folio, pending.requestId, 'oicInvestigator')).status).toBe(404);
    expect((await approve(server, folio, pending.requestId, 'supervisor')).status).toBe(404);
  });

  it('la cuenta de recepción e investigación abre identidades; substanciación nunca', async () => {
    const { server, folio } = await setup();
    await moveTo(server, folio, 'routed');
    const bySubstantiation = await post(
      server,
      ROUTES.authorityIdentityRequests(folio),
      { legalBasis: FIRST_BASIS },
      'oicSubstantiation',
    );
    expect(bySubstantiation.status).toBe(403);
    const pending = await request(server, folio, 'oicIntakeInvestigator');
    expect((await approve(server, folio, pending.requestId, 'oicSubstantiation')).status).toBe(403);
    expect((await approve(server, folio, pending.requestId, 'oicInvestigator')).status).toBe(200);
    expect((await envelope(server, folio, pending.requestId, 'oicSubstantiation')).status).toBe(
      403,
    );
    expect((await envelope(server, folio, pending.requestId, 'oicIntakeInvestigator')).status).toBe(
      200,
    );
  });

  it('la solicitud vence a los 7 días sin la segunda aprobación', async () => {
    const { server, folio } = await setup();
    const pending = await request(server, folio, 'inboxInvestigator');
    expect(pending.expiresOn).toBe('2026-10-27');
    server.setNow(new Date('2026-10-28T12:00:00Z'));
    expect((await approve(server, folio, pending.requestId, 'inboxInvestigator2')).status).toBe(
      409,
    );
    const detail = ComplaintDetailSchema.parse(
      await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folio))).json(),
    );
    expect(detail.identityRequests?.[0]?.status).toBe('expired');
  });

  it('si la denuncia se turna, la solicitud de la autoridad anterior ya no se aprueba', async () => {
    const { server, folio } = await setup();
    const pending = await request(server, folio, 'inboxInvestigator');
    await moveTo(server, folio, 'routed');
    expect((await approve(server, folio, pending.requestId, 'inboxInvestigator2')).status).toBe(
      404,
    );
    expect((await approve(server, folio, pending.requestId, 'oicInvestigator')).status).toBe(409);
  });

  it('en la vía penal exige el fundamento de la lista y el número de la resolución (CNPP art. 109 fr. XXVI)', async () => {
    const { server, folio, reporter } = await setup();
    await moveTo(server, folio, 'routed');
    const accepted = await procedureAs(server, 'oicIntake', folio, { action: 'accept' });
    expect(accepted.status).toBe(200);
    const advanced = await procedureAs(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'criminal_investigation',
    });
    expect(advanced.status).toBe(200);
    // Un fundamento libre ya no basta: la apertura en la vía penal la decide una resolución.
    const free = await post(
      server,
      ROUTES.authorityIdentityRequests(folio),
      { legalBasis: FIRST_BASIS },
      'oicInvestigator',
    );
    expect(free.status).toBe(400);
    const basis = formatCriminalOpeningBasis({
      ground: 'cnpp_109_xxvi',
      resolutionReference: 'Causa penal 45/2026',
      reason: 'El juez de control ordenó dar a conocer la identidad a la defensa (sintético).',
    });
    const requested = await post(
      server,
      ROUTES.authorityIdentityRequests(folio),
      { legalBasis: basis },
      'oicInvestigator',
    );
    expect(requested.status).toBe(201);
    const pending = IdentityOpeningRequestViewSchema.parse(await requested.json());
    // La doble aprobación sigue igual: sola no abre.
    expect(pending.status).toBe('pending');
    const approved = await approve(server, folio, pending.requestId, 'oicIntakeInvestigator');
    expect(IdentityOpeningRequestViewSchema.parse(await approved.json()).status).toBe('approved');
    // La persona ve el fundamento con el número de la resolución.
    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.identityAccess.map((entry) => entry.legalBasis)).toEqual([basis]);
  });
});
