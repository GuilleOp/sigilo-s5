// Pruebas del trámite con el catálogo del Estándar S5: turnar, aceptar, reasignar, devolver, avanzar
// de etapa y cerrar con fundamento; separación de funciones, competencia por folio, notas públicas,
// plazos en la línea de tiempo y actor individual en la bitácora.
import { describe, expect, it } from 'vitest';
import {
  ClosureRecordSchema,
  ComplaintDetailSchema,
  ProcedureStateSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type { ProcedureActionRequest } from '@sigilo/contracts';
import { readText } from '../db/database.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  postJson,
  procedureAs,
  submitComplaint,
  SYNTHETIC_AGREEMENT,
  TEST_ACCOUNTS,
  TEST_AUTHORITIES,
  testToken,
} from '../test-support/harness.ts';
import type { TestAccountName, TestServer } from '../test-support/harness.ts';
import type { ReceiptKeys } from '@sigilo/core';

const CLOSE: ProcedureActionRequest = {
  action: 'close',
  reason: 'attended',
  legalBasis: 'LGRA, art. 100: se concluye con elementos (fundamento sintético).',
  agreement: SYNTHETIC_AGREEMENT,
};

const QUALIFICATION = {
  severity: 'non_serious',
  legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
  agreement: 'Acuerdo sintético de calificación de la conducta como falta no grave.',
} as const;

async function setup(offenseCode?: string) {
  const server = createTestServer();
  const reporter = createReporter();
  const request = await buildComplaintRequest(server, {
    mode: 'sealed',
    reporter,
    ...(offenseCode === undefined ? {} : { offenseCode }),
  });
  const { folio } = await submitComplaint(server, request);
  return { server, reporter, folio };
}

async function act(
  server: TestServer,
  name: TestAccountName,
  folio: string,
  request: ProcedureActionRequest,
) {
  const response = await procedureAs(server, name, folio, request);
  return { status: response.status, body: (await response.json()) as unknown };
}

async function tracking(server: TestServer, folio: string, reporter: ReceiptKeys) {
  const response = await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
  return TrackingViewSchema.parse(await response.json());
}

function storedPayloads(server: TestServer): Record<string, unknown>[] {
  return server.db
    .prepare("SELECT payload_json FROM ledger_pending WHERE type = 'complaint.status_changed'")
    .all()
    .map((row) => JSON.parse(readText(row, 'payload_json')) as Record<string, unknown>);
}

describe('flujo del buzón general', () => {
  it('turna, acepta, investiga y cierra con acuerdo; la persona ve cada paso explicado', async () => {
    const { server, folio, reporter } = await setup();
    const routed = await act(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna al órgano interno de control del ente (nota sintética).',
    });
    expect(routed.status).toBe(200);
    expect(ProcedureStateSchema.parse(routed.body)).toMatchObject({
      status: 'routed',
      managementState: 'routed',
      assignedAuthorityId: TEST_AUTHORITIES.oic,
    });
    // Ya no está en el buzón: su investigación ya no la ve; la del OIC sí.
    const inboxView = await getAsAuthority(server.app, ROUTES.authorityComplaint(folio));
    expect(inboxView.status).toBe(404);
    const oicDetail = await getAsAuthority(
      server.app,
      ROUTES.authorityComplaint(folio),
      testToken('oicInvestigator'),
    );
    expect(oicDetail.status).toBe(200);

    expect((await act(server, 'oicIntake', folio, { action: 'accept' })).status).toBe(200);
    const stage = await act(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'investigation',
      note: 'Se pidió información a la unidad compradora (nota sintética).',
    });
    expect(ProcedureStateSchema.parse(stage.body)).toMatchObject({
      status: 'investigating',
      legalStage: 'investigation',
    });
    server.setNow(new Date('2026-10-30T18:00:00Z'));
    const closed = await act(server, 'oicInvestigator', folio, CLOSE);
    expect(ProcedureStateSchema.parse(closed.body)).toMatchObject({
      status: 'resolved',
      managementState: 'closed',
      closureReason: 'attended',
    });

    const view = await tracking(server, folio, reporter);
    expect(view.status).toBe('resolved');
    const procedure = view.procedure;
    if (procedure === undefined) throw new Error('Falta el trámite.');
    expect(procedure.steps.map((step) => step.action)).toEqual([
      'received',
      'routed',
      'accepted',
      'stage_advanced',
      'closed',
    ]);
    expect(procedure.steps[1]).toMatchObject({
      title: 'Turnada a Órgano interno de control de prueba',
      note: 'Se turna al órgano interno de control del ente (nota sintética).',
    });
    expect(procedure.steps[1]?.explanation).toContain('Turnar significa');
    expect(procedure.closure).toMatchObject({
      reason: 'attended',
      reasonName: 'Atendido',
      agreement: SYNTHETIC_AGREEMENT,
      legalOn: '2026-10-30',
    });
    // Ninguna parte del seguimiento revela qué cuenta actuó.
    expect(JSON.stringify(view)).not.toContain('acct-');
  });

  it('registra el seudónimo de la cuenta en los datos privados de cada evento', async () => {
    const { server, folio } = await setup();
    await act(server, 'inboxIntake', folio, { action: 'route', authorityId: TEST_AUTHORITIES.oic });
    await act(server, 'oicIntake', folio, { action: 'accept' });
    const actors = storedPayloads(server).map((payload) => payload.actor);
    expect(actors).toEqual(
      expect.arrayContaining([
        TEST_ACCOUNTS.inboxIntake.accountId,
        TEST_ACCOUNTS.oicIntake.accountId,
      ]),
    );
    // El evento público solo lleva el digesto: el seudónimo no se publica.
    await server.advanceTo(new Date('2026-10-21T09:00:00Z'));
    const page = await (await server.app.request(ROUTES.ledgerEvents)).text();
    expect(page).not.toContain('acct-');
  });

  it('reasigna y devuelve al buzón general con nota obligatoria', async () => {
    const { server, folio, reporter } = await setup();
    await act(server, 'inboxIntake', folio, { action: 'route', authorityId: TEST_AUTHORITIES.oic });
    const withoutNote = await procedureAs(server, 'oicIntake', folio, {
      action: 'reassign',
      authorityId: TEST_AUTHORITIES.other,
    } as unknown as ProcedureActionRequest);
    expect(withoutNote.status).toBe(400);
    const reassigned = await act(server, 'oicIntake', folio, {
      action: 'reassign',
      authorityId: TEST_AUTHORITIES.other,
      note: 'Los hechos son de otra dependencia (nota sintética).',
    });
    expect(ProcedureStateSchema.parse(reassigned.body).assignedAuthorityId).toBe(
      TEST_AUTHORITIES.other,
    );
    // La autoridad anterior ya no la ve.
    expect(
      (
        await getAsAuthority(
          server.app,
          ROUTES.authorityComplaint(folio),
          testToken('oicInvestigator'),
        )
      ).status,
    ).toBe(404);
    // La nueva no tiene cuenta de recepción: su investigación no puede devolverla.
    expect(
      (await act(server, 'otherInvestigator', folio, { action: 'return', note: 'No (sintético).' }))
        .status,
    ).toBe(403);
    const view = await tracking(server, folio, reporter);
    expect(view.procedure?.steps.at(-1)).toMatchObject({
      action: 'reassigned',
      note: 'Los hechos son de otra dependencia (nota sintética).',
    });
  });
});

describe('separación de funciones y competencia', () => {
  it('cada función hace solo lo suyo y lo ajeno responde 403 antes de buscar el folio', async () => {
    const { server, folio } = await setup();
    // Investigación no turna; supervisión no actúa sobre el trámite.
    expect(
      (
        await act(server, 'inboxInvestigator', folio, {
          action: 'route',
          authorityId: TEST_AUTHORITIES.oic,
        })
      ).status,
    ).toBe(403);
    expect((await act(server, 'inboxSupervision', folio, { action: 'accept' })).status).toBe(403);
    // Con un folio inexistente, la función se rechaza igual: no se revela si existe.
    expect(
      (await act(server, 'inboxSupervision', 'ZZZZ-ZZZZ-ZZZZ', { action: 'accept' })).status,
    ).toBe(403);
    await act(server, 'inboxIntake', folio, { action: 'route', authorityId: TEST_AUTHORITIES.oic });
    await act(server, 'oicIntake', folio, { action: 'accept' });
    // Recepción no avanza etapas ni cierra lo aceptado.
    expect(
      (await act(server, 'oicIntake', folio, { action: 'advance_stage', stage: 'investigation' }))
        .status,
    ).toBe(403);
    expect((await act(server, 'oicIntake', folio, CLOSE)).status).toBe(403);
    const denied = server.ctx.securityLog
      .listAll()
      .filter((event) => event.kind === 'function_denied');
    expect(denied.length).toBeGreaterThanOrEqual(4);
  });

  it('una cuenta de recepción e investigación acepta, investiga y presenta el IPRA, y también reasigna', async () => {
    const { server, folio } = await setup();
    await act(server, 'inboxIntake', folio, { action: 'route', authorityId: TEST_AUTHORITIES.oic });
    expect((await act(server, 'oicIntakeInvestigator', folio, { action: 'accept' })).status).toBe(
      200,
    );
    for (const request of [
      { action: 'advance_stage', stage: 'investigation' },
      { action: 'advance_stage', stage: 'qualification', qualification: QUALIFICATION },
      { action: 'advance_stage', stage: 'report_filed' },
    ] as const satisfies ProcedureActionRequest[]) {
      expect((await act(server, 'oicIntakeInvestigator', folio, request)).status).toBe(200);
    }
    // Turnar: la misma cuenta reasigna lo que le llegó a otra autoridad.
    const fresh = await setup();
    await act(fresh.server, 'inboxIntake', fresh.folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
    });
    const reassigned = await act(fresh.server, 'oicIntakeInvestigator', fresh.folio, {
      action: 'reassign',
      authorityId: TEST_AUTHORITIES.other,
      note: 'Corresponde a otra autoridad por la materia (nota sintética).',
    });
    expect(reassigned.status).toBe(200);
  });

  it('después del IPRA solo substanciación avanza y resuelve; investigación ya no (LGRA, art. 115)', async () => {
    const { server, folio } = await setup();
    await act(server, 'inboxIntake', folio, { action: 'route', authorityId: TEST_AUTHORITIES.oic });
    // Substanciación no acepta, no reasigna, no devuelve ni avanza la investigación.
    expect((await act(server, 'oicSubstantiation', folio, { action: 'accept' })).status).toBe(403);
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'reassign',
          authorityId: TEST_AUTHORITIES.other,
          note: 'Nota sintética de reasignación.',
        })
      ).status,
    ).toBe(403);
    expect(
      (await act(server, 'oicSubstantiation', folio, { action: 'return', note: 'Nota sintética.' }))
        .status,
    ).toBe(403);
    await act(server, 'oicIntake', folio, { action: 'accept' });
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'investigation',
        })
      ).status,
    ).toBe(403);
    await act(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'investigation',
    });
    await act(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'qualification',
      qualification: QUALIFICATION,
    });
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'report_filed',
        })
      ).status,
    ).toBe(403);
    // Sin el IPRA presentado, la substanciación no empieza: no se salta `report_filed`.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'evidence_hearing',
        })
      ).status,
    ).toBe(409);
    await act(server, 'oicInvestigator', folio, { action: 'advance_stage', stage: 'report_filed' });
    // Investigación (sola o con recepción) ya no avanza ni cierra lo que se substancia.
    for (const name of ['oicInvestigator', 'oicIntakeInvestigator'] as const) {
      expect(
        (await act(server, name, folio, { action: 'advance_stage', stage: 'evidence_hearing' }))
          .status,
      ).toBe(403);
      expect((await act(server, name, folio, CLOSE)).status).toBe(403);
    }
    for (const stage of ['evidence_hearing', 'closing_arguments', 'resolution'] as const) {
      expect(
        (await act(server, 'oicSubstantiation', folio, { action: 'advance_stage', stage })).status,
      ).toBe(200);
    }
    expect((await act(server, 'oicSubstantiation', folio, CLOSE)).status).toBe(200);
  });

  it('otra autoridad recibe 404, igual que un folio inexistente', async () => {
    const { server, folio } = await setup();
    const other = await act(server, 'oicIntake', folio, { action: 'accept' });
    const missing = await act(server, 'oicIntake', 'ZZZZ-ZZZZ-ZZZZ', { action: 'accept' });
    expect(other).toEqual(missing);
    expect(other.status).toBe(404);
    const list = await getAsAuthority(
      server.app,
      ROUTES.authorityComplaints,
      testToken('oicInvestigator'),
    );
    expect(await list.json()).toEqual([]);
  });

  it('rechaza con 409 lo que el flujo no admite', async () => {
    const { server, folio } = await setup();
    // Desde el buzón no se acepta sin turnar.
    expect((await act(server, 'inboxIntake', folio, { action: 'accept' })).status).toBe(409);
    await act(server, 'inboxIntake', folio, { action: 'route', authorityId: TEST_AUTHORITIES.oic });
    expect(
      (
        await act(server, 'oicInvestigator', folio, {
          action: 'advance_stage',
          stage: 'investigation',
        })
      ).status,
    ).toBe(409);
    await act(server, 'oicIntake', folio, { action: 'accept' });
    // Las etapas no se saltan ni retroceden.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'resolution',
        })
      ).status,
    ).toBe(409);
    await act(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'investigation',
    });
    await act(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'qualification',
    });
    expect(
      (
        await act(server, 'oicInvestigator', folio, {
          action: 'advance_stage',
          stage: 'investigation',
        })
      ).status,
    ).toBe(409);
    // No se turna al buzón general ni a una autoridad que no existe.
    const fresh = await setup();
    for (const authorityId of [TEST_AUTHORITIES.inbox, 'authority.no-existe']) {
      expect(
        (await act(fresh.server, 'inboxIntake', fresh.folio, { action: 'route', authorityId }))
          .status,
      ).toBe(400);
    }
  });

  it('el buzón general puede cerrar como improcedente sin turnar; el cierre exige el acuerdo', async () => {
    const { server, folio } = await setup();
    const incomplete = await procedureAs(server, 'inboxIntake', folio, {
      action: 'close',
      reason: 'inadmissible',
      legalBasis: 'Fundamento sintético: no involucra a personas servidoras públicas.',
    } as unknown as ProcedureActionRequest);
    expect(incomplete.status).toBe(400);
    const closed = await act(server, 'inboxIntake', folio, { ...CLOSE, reason: 'inadmissible' });
    expect(ProcedureStateSchema.parse(closed.body).status).toBe('resolved');
  });
});

describe('acuerdos de cierre para el auditor', () => {
  it('supervisión lista los acuerdos de su autoridad y de las que supervisa', async () => {
    const { server, folio } = await setup();
    await act(server, 'inboxIntake', folio, {
      ...CLOSE,
      reason: 'insufficient_information',
    });
    const response = await getAsAuthority(
      server.app,
      ROUTES.authorityClosures,
      testToken('supervisor'),
    );
    const [record] = ClosureRecordSchema.array().parse(await response.json());
    expect(record).toMatchObject({
      folio,
      authorityId: TEST_AUTHORITIES.inbox,
      reason: 'insufficient_information',
      agreement: SYNTHETIC_AGREEMENT,
      actorId: TEST_ACCOUNTS.inboxIntake.accountId,
    });
    expect(
      (await getAsAuthority(server.app, ROUTES.authorityClosures, testToken('oicInvestigator')))
        .status,
    ).toBe(403);
    // El archivo queda como estatus `archived` y el acuerdo, en el detalle.
    const detail = ComplaintDetailSchema.parse(
      await (
        await getAsAuthority(
          server.app,
          ROUTES.authorityComplaint(folio),
          testToken('inboxSupervision'),
        )
      ).json(),
    );
    expect(detail.summary.status).toBe('archived');
    expect(detail.procedure?.closure?.agreement).toBe(SYNTHETIC_AGREEMENT);
  });
});

describe('plazos en el seguimiento', () => {
  it('muestra el plazo de 30 días ante falta grave en curso, por vencer y vencido', async () => {
    const { server, folio, reporter } = await setup('LGRA-52');
    const deadline = async () =>
      (await tracking(server, folio, reporter)).procedure?.deadlines.find(
        (item) => item.key === 'serious_offense_start',
      );
    expect(await deadline()).toMatchObject({
      startsOn: '2026-10-20',
      dueOn: '2026-11-19',
      status: 'running',
      remainingUnit: 'natural_days',
    });
    server.setNow(new Date('2026-11-16T18:00:00Z'));
    expect((await deadline())?.status).toBe('due_soon');
    server.setNow(new Date('2026-11-21T18:00:00Z'));
    expect(await deadline()).toMatchObject({ status: 'overdue', remaining: -2 });
    // Una falta no grave no corre ese plazo, pero sí la prescripción de 3 años.
    const minor = await setup('LGRA-50');
    const keys = (
      await tracking(minor.server, minor.folio, minor.reporter)
    ).procedure?.deadlines.map((item) => item.key);
    expect(keys).toEqual(['prescription_non_serious']);
  });

  it('cuenta los plazos con el día legal en la hora del centro de México', async () => {
    const server = createTestServer();
    // Jueves 22 de octubre a las 19:00 hora del centro = viernes 23 a la 01:00 UTC.
    server.setNow(new Date('2026-10-23T01:00:00Z'));
    const reporter = createReporter();
    const { folio } = await submitComplaint(
      server,
      await buildComplaintRequest(server, { mode: 'anonymous', reporter }),
    );
    const view = await tracking(server, folio, reporter);
    expect(view.receipt.receivedOn).toBe('2026-10-23');
    expect(view.procedure?.steps[0]).toMatchObject({ on: '2026-10-23', legalOn: '2026-10-22' });
    expect(
      view.procedure?.deadlines.find((item) => item.key === 'serious_offense_start')?.dueOn,
    ).toBe('2026-11-21');
  });
});
