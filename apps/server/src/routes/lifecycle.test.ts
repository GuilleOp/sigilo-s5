// Pruebas del ciclo de vida legal completo (estándar 0.4.0): cada transición de la vía
// administrativa con sus dos ramas, el Tribunal como actor (y su registro por la substanciación si
// el estado no le dio cuentas), la abstención, la prevención del informe, los cinco recursos con su
// plazo, su resultado y su efecto, las medidas cautelares, la vía penal en paralelo, los recursos
// federales, la firmeza, la ejecución y su registro, los motivos legales de cierre, el
// desistimiento, la separación de funciones (LGRA, art. 115) y la migración de los datos anteriores.
import { describe, expect, it } from 'vitest';
import {
  ADMINISTRATIVE_TRANSITIONS,
  ComplaintDetailSchema,
  ComplaintSummarySchema,
  ProcedureStateSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type { ProcedureActionRequest, ProcedureView } from '@sigilo/contracts';
import { migrate, openDatabase, readOptionalText } from '../db/database.ts';
import { DatabaseSync } from 'node:sqlite';
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
  TEST_AUTHORITIES,
  testAuthorityRegistryWith,
  testToken,
} from '../test-support/harness.ts';
import type { TestAccountName, TestServer } from '../test-support/harness.ts';
import type { ReceiptKeys } from '@sigilo/core';

const BASIS = 'LGRA: fundamento sintético de la actuación de prueba (art. 208).';
const COURT_RECORD = {
  fileNumber: 'TJA/RA/0001/2026',
  legalBasis: 'LGRA, art. 209 fr. II: el Tribunal recibió los autos (registro sintético).',
};

function qualification(severity: 'serious' | 'non_serious') {
  return {
    severity,
    legalBasis: 'LGRA, art. 100: calificación sintética de prueba.',
    agreement: `Acuerdo sintético de calificación de la conducta como falta ${severity === 'serious' ? 'grave' : 'no grave'}.`,
  } as const;
}

async function setup(server: TestServer = createTestServer(), offenseCode?: string) {
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

async function ok(
  server: TestServer,
  name: TestAccountName,
  folio: string,
  request: ProcedureActionRequest,
) {
  const result = await act(server, name, folio, request);
  expect(result.status, JSON.stringify({ request, body: result.body })).toBe(200);
  return ProcedureStateSchema.parse(result.body);
}

async function advance(server: TestServer, name: TestAccountName, folio: string, stage: string) {
  return ok(server, name, folio, { action: 'advance_stage', stage } as ProcedureActionRequest);
}

async function tracking(server: TestServer, folio: string, reporter: ReceiptKeys) {
  const response = await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter));
  return TrackingViewSchema.parse(await response.json());
}

async function detail(server: TestServer, name: TestAccountName, folio: string) {
  const response = await getAsAuthority(
    server.app,
    ROUTES.authorityComplaint(folio),
    testToken(name),
  );
  return {
    status: response.status,
    body: response.status === 200 ? ComplaintDetailSchema.parse(await response.json()) : null,
  };
}

/** Turna, acepta, investiga, califica y presenta el IPRA. */
async function toReportFiled(severity: 'serious' | 'non_serious', server?: TestServer) {
  const context = await setup(server, severity === 'serious' ? undefined : 'LGRA-50');
  const { folio } = context;
  await ok(context.server, 'inboxIntake', folio, {
    action: 'route',
    authorityId: TEST_AUTHORITIES.oic,
    note: 'Se turna al órgano interno de control del ente (nota sintética).',
  });
  await ok(context.server, 'oicIntake', folio, { action: 'accept' });
  await advance(context.server, 'oicInvestigator', folio, 'investigation');
  await ok(context.server, 'oicInvestigator', folio, {
    action: 'advance_stage',
    stage: 'qualification',
    qualification: qualification(severity),
  });
  await advance(context.server, 'oicInvestigator', folio, 'report_filed');
  return context;
}

/** Del IPRA a la audiencia inicial cerrada (substanciación). */
async function toInitialHearing(severity: 'serious' | 'non_serious', server?: TestServer) {
  const context = await toReportFiled(severity, server);
  for (const stage of ['report_admitted', 'summoned', 'initial_hearing']) {
    await advance(context.server, 'oicSubstantiation', context.folio, stage);
  }
  return context;
}

function titles(view: ProcedureView | undefined): string[] {
  return (view?.steps ?? []).map((step) => step.title);
}

describe('catálogo de transiciones', () => {
  it('cada transición nombra una función del procedimiento y su fundamento', () => {
    for (const transition of ADMINISTRATIVE_TRANSITIONS) {
      expect(['investigation', 'substantiation', 'court']).toContain(transition.fn);
      expect(transition.legalBasis.length).toBeGreaterThan(0);
      expect(transition.label.length).toBeGreaterThan(5);
    }
  });
});

describe('falta grave: del IPRA al Tribunal', () => {
  it('la substanciación admite, emplaza y celebra la audiencia; el Tribunal recibe y resuelve', async () => {
    const { server, folio, reporter } = await toInitialHearing('serious');
    // Rama grave: no sigue con las pruebas de la substanciadora.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'evidence_hearing',
        })
      ).status,
    ).toBe(409);
    expect((await advance(server, 'oicSubstantiation', folio, 'case_file_sent')).status).toBe(
      'in_court',
    );
    // Con cuentas del Tribunal, la substanciación ya no avanza sus etapas.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'court_received',
        })
      ).status,
    ).toBe(403);
    // El Tribunal ve la denuncia en su lista y en el detalle, sin el buzón de la persona.
    const listed = await getAsAuthority(server.app, ROUTES.authorityComplaints, testToken('court'));
    const summaries = ComplaintSummarySchema.array().parse(await listed.json());
    expect(summaries.map((item) => item.folio)).toContain(folio);
    const courtDetail = await detail(server, 'court', folio);
    expect(courtDetail.status).toBe(200);
    expect(courtDetail.body?.messages).toEqual([]);
    for (const stage of [
      'court_received',
      'court_evidence_hearing',
      'court_closing_arguments',
      'court_instruction_closed',
      'court_resolution',
    ]) {
      expect((await advance(server, 'court', folio, stage)).status).toBe('in_court');
    }
    // El Tribunal no actúa fuera de sus etapas: no emplaza ni investiga.
    expect((await act(server, 'court', folio, { action: 'accept' })).status).toBe(403);
    // Apelación de la persona denunciante como tercera: detiene la firmeza.
    await ok(server, 'court', folio, {
      action: 'file_remedy',
      kind: 'appeal',
      filedBy: 'reporter',
      signed: true,
    });
    expect(
      (await act(server, 'court', folio, { action: 'advance_stage', stage: 'final' })).status,
    ).toBe(409);
    const seen = await tracking(server, folio, reporter);
    expect(seen.status).toBe('under_remedy');
    expect(seen.procedure?.remedies?.[0]).toMatchObject({
      kind: 'appeal',
      filedBy: 'reporter',
      status: 'pending',
    });
    await ok(server, 'court', folio, {
      action: 'resolve_remedy',
      kind: 'appeal',
      outcome: 'confirmed',
      legalBasis: BASIS,
    });
    await advance(server, 'court', folio, 'final');
    // Al quedar firme, el Tribunal ya no ve la denuncia; la ejecución la registra la substanciación.
    expect((await detail(server, 'court', folio)).status).toBe(404);
    await advance(server, 'oicSubstantiation', folio, 'executed');
    await ok(server, 'oicSubstantiation', folio, {
      action: 'register_sanction',
      registryReference: 'S3-SINTETICO-0001',
      legalBasis: 'LGRA, art. 27: inscripción sintética en el sistema de sancionados.',
    });
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'register_sanction',
          registryReference: 'S3-SINTETICO-0001',
          legalBasis: 'LGRA, art. 27: inscripción sintética en el sistema de sancionados.',
        })
      ).status,
    ).toBe(409);
    const closed = await ok(server, 'oicSubstantiation', folio, {
      action: 'close',
      reason: 'attended',
      legalOutcome: 'sanctioned',
      legalBasis: 'LGRA, arts. 206 y 222: resolución firme y sanción ejecutada (sintético).',
      agreement: SYNTHETIC_AGREEMENT,
    });
    expect(closed.status).toBe('final_sanction');
    const final = await tracking(server, folio, reporter);
    expect(final.procedure?.closure?.legalOutcomeName).toBe('Resolución firme con sanción');
    expect(final.procedure?.sanctionRegistered?.registryReference).toBe('S3-SINTETICO-0001');
    expect(titles(final.procedure)).toEqual(
      expect.arrayContaining([
        'Etapa: Procedimiento iniciado (informe admitido)',
        'Etapa: Emplazamiento',
        'Etapa: Audiencia inicial',
        'Etapa: Envío del expediente al Tribunal',
        'Etapa: Recibido en el Tribunal',
        'Etapa: Sentencia del Tribunal',
        'Etapa: Resolución firme',
        'Etapa: Sanción ejecutada',
        'Sanción inscrita en el registro de sancionados (S3)',
      ]),
    );
  });

  it('el Tribunal devuelve el expediente si no es grave y ordena reclasificar con plazo', async () => {
    const { server, folio } = await toInitialHearing('serious');
    await advance(server, 'oicSubstantiation', folio, 'case_file_sent');
    await advance(server, 'court', folio, 'court_received');
    await ok(server, 'court', folio, { action: 'order_reclassification', legalBasis: BASIS });
    let view = (await detail(server, 'oicSubstantiation', folio)).body?.procedure;
    expect(view?.deadlines.map((item) => item.key)).toContain('reclassification');
    // La devolución exige fundamento.
    expect(
      (await act(server, 'court', folio, { action: 'advance_stage', stage: 'evidence_hearing' }))
        .status,
    ).toBe(400);
    const returned = await ok(server, 'court', folio, {
      action: 'advance_stage',
      stage: 'evidence_hearing',
      legalBasis: BASIS,
    });
    expect(returned.legalStage).toBe('evidence_hearing');
    // Vuelve a la rama no grave con la substanciadora.
    for (const stage of ['closing_arguments', 'instruction_closed', 'resolution']) {
      await advance(server, 'oicSubstantiation', folio, stage);
    }
    view = (await detail(server, 'oicSubstantiation', folio)).body?.procedure;
    expect(titles(view)).toContain('El Tribunal devolvió el expediente: no es falta grave');
  });

  it('sin cuentas del Tribunal, la substanciación registra sus actuaciones con expediente', async () => {
    const registry = testAuthorityRegistryWith((accounts) =>
      accounts.filter(([name]) => name !== 'court'),
    );
    const server = createTestServer({ authorities: registry });
    const { folio, reporter } = await toInitialHearing('serious', server);
    await advance(server, 'oicSubstantiation', folio, 'case_file_sent');
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'court_received',
        })
      ).status,
    ).toBe(400);
    // Fuera del registro del Tribunal, el expediente no se admite.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'report_admitted',
          courtRecord: COURT_RECORD,
        })
      ).status,
    ).toBe(409);
    await ok(server, 'oicSubstantiation', folio, {
      action: 'advance_stage',
      stage: 'court_received',
      courtRecord: COURT_RECORD,
    });
    const view = (await tracking(server, folio, reporter)).procedure;
    const step = view?.steps.at(-1);
    expect(step?.title).toBe('Registro de actuación del Tribunal: Etapa: Recibido en el Tribunal');
    expect(step?.record).toMatchObject({
      recordedForCourt: true,
      courtFileNumber: 'TJA/RA/0001/2026',
    });
    expect((await detail(server, 'oicSubstantiation', folio)).body?.procedure?.courtRecording).toBe(
      true,
    );
  });
});

describe('falta no grave: la substanciadora resuelve y la revocación detiene la firmeza', () => {
  it('pruebas, alegatos, cierre, resolución, revocación y firmeza', async () => {
    const { server, folio } = await toInitialHearing('non_serious');
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'case_file_sent',
        })
      ).status,
    ).toBe(409);
    for (const stage of [
      'evidence_hearing',
      'closing_arguments',
      'instruction_closed',
      'resolution',
    ]) {
      expect((await advance(server, 'oicSubstantiation', folio, stage)).status).toBe(
        'in_procedure',
      );
    }
    let view = (await detail(server, 'oicSubstantiation', folio)).body?.procedure;
    expect(view?.deadlines.map((item) => item.key)).toEqual(
      expect.arrayContaining(['resolution_notice', 'revocation_filing']),
    );
    // La revocación solo la presenta la persona sancionada.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'file_remedy',
          kind: 'revocation',
          filedBy: 'reporter',
          signed: true,
        })
      ).status,
    ).toBe(400);
    await ok(server, 'oicSubstantiation', folio, {
      action: 'file_remedy',
      kind: 'revocation',
      filedBy: 'accused',
      signed: true,
    });
    expect(
      (await act(server, 'oicSubstantiation', folio, { action: 'advance_stage', stage: 'final' }))
        .status,
    ).toBe(409);
    view = (await detail(server, 'oicSubstantiation', folio)).body?.procedure;
    expect(view?.deadlines.map((item) => item.key)).toContain('revocation_resolution');
    expect(view?.deadlines.map((item) => item.key)).not.toContain('revocation_filing');
    await ok(server, 'oicSubstantiation', folio, {
      action: 'resolve_remedy',
      kind: 'revocation',
      outcome: 'admitted',
      legalBasis: BASIS,
    });
    expect(
      (await act(server, 'oicSubstantiation', folio, { action: 'advance_stage', stage: 'final' }))
        .status,
    ).toBe(409);
    await ok(server, 'oicSubstantiation', folio, {
      action: 'resolve_remedy',
      kind: 'revocation',
      outcome: 'confirmed',
      legalBasis: BASIS,
    });
    await advance(server, 'oicSubstantiation', folio, 'final');
    // «Sanción ejecutada» se cierra con sanción; en firme sin sanción, otro motivo.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'close',
          reason: 'attended',
          legalOutcome: 'sanctioned',
          legalBasis: BASIS,
          agreement: SYNTHETIC_AGREEMENT,
        })
      ).status,
    ).toBe(409);
    const closed = await ok(server, 'oicSubstantiation', folio, {
      action: 'close',
      reason: 'attended',
      legalOutcome: 'responsible_no_sanction',
      legalBasis: BASIS,
      agreement: SYNTHETIC_AGREEMENT,
    });
    expect(closed.status).toBe('final_no_sanction');
  });

  it('la reclamación no detiene el procedimiento y la resuelve quien dictó el auto', async () => {
    const { server, folio } = await toReportFiled('non_serious');
    await advance(server, 'oicSubstantiation', folio, 'report_admitted');
    await ok(server, 'oicSubstantiation', folio, {
      action: 'file_remedy',
      kind: 'claim',
      filedBy: 'accused',
      signed: true,
    });
    expect((await advance(server, 'oicSubstantiation', folio, 'summoned')).status).toBe(
      'under_remedy',
    );
    const view = (await detail(server, 'oicSubstantiation', folio)).body?.procedure;
    expect(view?.deadlines.map((item) => item.key)).toContain('claim_resolution');
    const resolved = await ok(server, 'oicSubstantiation', folio, {
      action: 'resolve_remedy',
      kind: 'claim',
      outcome: 'inadmissible',
      legalBasis: BASIS,
    });
    expect(resolved.status).toBe('in_procedure');
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'resolve_remedy',
          kind: 'claim',
          outcome: 'confirmed',
          legalBasis: BASIS,
        })
      ).status,
    ).toBe(409);
  });

  it('la revisión la pide la autoridad investigadora y la resuelve el Tribunal', async () => {
    const { server, folio } = await toInitialHearing('serious');
    await advance(server, 'oicSubstantiation', folio, 'case_file_sent');
    for (const stage of [
      'court_received',
      'court_evidence_hearing',
      'court_closing_arguments',
      'court_instruction_closed',
      'court_resolution',
    ]) {
      await advance(server, 'court', folio, stage);
    }
    expect(
      (
        await act(server, 'oicInvestigator', folio, {
          action: 'file_remedy',
          kind: 'review',
          filedBy: 'reporter',
          signed: true,
        })
      ).status,
    ).toBe(400);
    await ok(server, 'oicInvestigator', folio, {
      action: 'file_remedy',
      kind: 'review',
      filedBy: 'investigating_authority',
      signed: true,
    });
    expect(
      (
        await act(server, 'oicInvestigator', folio, {
          action: 'resolve_remedy',
          kind: 'review',
          outcome: 'revoked',
          legalBasis: BASIS,
        })
      ).status,
    ).toBe(403);
    await ok(server, 'court', folio, {
      action: 'resolve_remedy',
      kind: 'review',
      outcome: 'modified',
      legalBasis: BASIS,
    });
    expect((await advance(server, 'court', folio, 'final')).legalStage).toBe('final');
  });
});

describe('prevención del informe y abstención', () => {
  it('la substanciadora previene; la investigadora corrige o el informe se tiene por no presentado', async () => {
    const { server, folio } = await toReportFiled('serious');
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'report_prevented',
        })
      ).status,
    ).toBe(400);
    await ok(server, 'oicSubstantiation', folio, {
      action: 'advance_stage',
      stage: 'report_prevented',
      legalBasis: BASIS,
    });
    let view = (await detail(server, 'oicInvestigator', folio)).body?.procedure;
    expect(view?.deadlines.map((item) => item.key)).toContain('report_correction');
    await advance(server, 'oicInvestigator', folio, 'report_filed');
    await ok(server, 'oicSubstantiation', folio, {
      action: 'advance_stage',
      stage: 'report_prevented',
      legalBasis: BASIS,
    });
    const back = await ok(server, 'oicSubstantiation', folio, {
      action: 'advance_stage',
      stage: 'investigation',
      legalBasis: BASIS,
    });
    expect(back).toMatchObject({ legalStage: 'investigation', status: 'investigating' });
    view = (await detail(server, 'oicInvestigator', folio)).body?.procedure;
    expect(titles(view)).toContain(
      'El informe se tuvo por no presentado y volvió a la investigación',
    );
  });

  it('abstención con aviso e inconformidad firmada; confirmada, se cierra sin sanción', async () => {
    const { server, folio, reporter } = await toReportFiled('non_serious');
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'abstention',
          legalBasis: BASIS,
        })
      ).status,
    ).toBe(400);
    await ok(server, 'oicSubstantiation', folio, {
      action: 'advance_stage',
      stage: 'abstention',
      legalBasis: BASIS,
      agreement: SYNTHETIC_AGREEMENT,
    });
    let seen = await tracking(server, folio, reporter);
    expect(seen.procedure?.abstention?.agreement).toBe(SYNTHETIC_AGREEMENT);
    expect(seen.procedure?.inconformity?.against).toBe('abstention');
    // Aviso en línea de la persona: no es la inconformidad.
    const notice = await postJson(server.app, ROUTES.trackingAppeal, {
      ...credentialsFor(folio, reporter),
      reasons: 'La conducta sí causó daño: no procede la abstención (motivos sintéticos).',
      revealIdentityForAppeal: true,
    });
    expect(notice.status).toBe(201);
    seen = await tracking(server, folio, reporter);
    expect(titles(seen.procedure)).toContain('Aviso de inconformidad (falta el escrito con firma)');
    expect(seen.procedure?.inconformity?.signedOn).toBeUndefined();
    // La investigadora registra el escrito firmado: la abstención ya no se cierra mientras se resuelve.
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'file_remedy',
          kind: 'inconformity',
          filedBy: 'reporter',
          signed: true,
        })
      ).status,
    ).toBe(403);
    await ok(server, 'oicInvestigator', folio, {
      action: 'file_remedy',
      kind: 'inconformity',
      filedBy: 'reporter',
      signed: true,
    });
    const closeAbstention: ProcedureActionRequest = {
      action: 'close',
      reason: 'attended',
      legalOutcome: 'abstention',
      legalBasis: 'LGRA, art. 101: abstención confirmada (sintético).',
      agreement: SYNTHETIC_AGREEMENT,
    };
    expect((await act(server, 'oicSubstantiation', folio, closeAbstention)).status).toBe(409);
    // La Sala del Tribunal la resuelve: la ve mientras está pendiente.
    expect((await detail(server, 'court', folio)).status).toBe(200);
    await ok(server, 'court', folio, {
      action: 'resolve_remedy',
      kind: 'inconformity',
      outcome: 'confirmed',
      legalBasis: BASIS,
    });
    seen = await tracking(server, folio, reporter);
    expect(seen.procedure?.inconformity).toMatchObject({ outcome: 'confirmed' });
    expect((await ok(server, 'oicSubstantiation', folio, closeAbstention)).status).toBe(
      'final_no_sanction',
    );
  });

  it('inconformidad revocada: contra la abstención vuelve al informe; contra la no grave, a calificar', async () => {
    const first = await toReportFiled('non_serious');
    await ok(first.server, 'oicSubstantiation', first.folio, {
      action: 'advance_stage',
      stage: 'abstention',
      legalBasis: BASIS,
      agreement: SYNTHETIC_AGREEMENT,
    });
    await ok(first.server, 'oicInvestigator', first.folio, {
      action: 'file_remedy',
      kind: 'inconformity',
      filedBy: 'reporter',
      signed: true,
    });
    const reverted = await ok(first.server, 'court', first.folio, {
      action: 'resolve_remedy',
      kind: 'inconformity',
      outcome: 'revoked',
      legalBasis: BASIS,
    });
    expect(reverted.legalStage).toBe('report_filed');

    const second = await toReportFiled('non_serious');
    await ok(second.server, 'oicInvestigator', second.folio, {
      action: 'file_remedy',
      kind: 'inconformity',
      filedBy: 'reporter',
      signed: true,
    });
    // Mientras se resuelve no se inicia el procedimiento (LGRA, art. 102).
    expect(
      (
        await act(second.server, 'oicSubstantiation', second.folio, {
          action: 'advance_stage',
          stage: 'report_admitted',
        })
      ).status,
    ).toBe(409);
    const requalify = await ok(second.server, 'court', second.folio, {
      action: 'resolve_remedy',
      kind: 'inconformity',
      outcome: 'revoked',
      legalBasis: BASIS,
    });
    expect(requalify.legalStage).toBe('investigation');
    await ok(second.server, 'oicInvestigator', second.folio, {
      action: 'advance_stage',
      stage: 'qualification',
      qualification: qualification('serious'),
    });
  });

  it('la inconformidad no procede contra la calificación de grave', async () => {
    const { server, folio } = await toReportFiled('serious');
    expect(
      (
        await act(server, 'oicInvestigator', folio, {
          action: 'file_remedy',
          kind: 'inconformity',
          filedBy: 'reporter',
          signed: true,
        })
      ).status,
    ).toBe(409);
  });
});

describe('medidas cautelares', () => {
  it('las pide la investigadora y las resuelve la substanciadora; la persona no ve la medida', async () => {
    const { server, folio, reporter } = await toReportFiled('serious');
    const request: ProcedureActionRequest = {
      action: 'request_precautionary',
      measure: 'Suspensión temporal del presunto responsable (medida sintética).',
      legalBasis: 'LGRA, arts. 123 y 124 fr. I: medida sintética de prueba.',
    };
    expect((await act(server, 'oicSubstantiation', folio, request)).status).toBe(403);
    await ok(server, 'oicInvestigator', folio, request);
    expect((await act(server, 'oicInvestigator', folio, request)).status).toBe(409);
    let seen = await tracking(server, folio, reporter);
    expect(JSON.stringify(seen)).not.toContain('Suspensión temporal del presunto');
    expect(titles(seen.procedure)).not.toContain('Se pidió una medida cautelar');
    expect(
      (
        await act(server, 'court', folio, {
          action: 'decide_precautionary',
          outcome: 'granted',
          legalBasis: BASIS,
        })
      ).status,
    ).toBe(404);
    await ok(server, 'oicSubstantiation', folio, {
      action: 'decide_precautionary',
      outcome: 'granted',
      legalBasis: BASIS,
    });
    seen = await tracking(server, folio, reporter);
    expect(titles(seen.procedure)).toContain('Se dictaron medidas para proteger la investigación');
    expect(seen.procedure?.steps.at(-1)?.record?.precautionaryOutcome).toBeUndefined();
    const panel = (await detail(server, 'oicInvestigator', folio)).body?.procedure;
    expect(panel?.steps.at(-1)?.record?.precautionaryOutcome).toBe('granted');
  });

  it('en las etapas del Tribunal, el Tribunal resuelve la medida', async () => {
    const { server, folio } = await toInitialHearing('serious');
    await advance(server, 'oicSubstantiation', folio, 'case_file_sent');
    await advance(server, 'court', folio, 'court_received');
    await ok(server, 'oicInvestigator', folio, {
      action: 'request_precautionary',
      measure: 'Embargo precautorio de bienes (medida sintética).',
      legalBasis: 'LGRA, art. 124: medida sintética de prueba.',
    });
    expect(
      (
        await act(server, 'oicSubstantiation', folio, {
          action: 'decide_precautionary',
          outcome: 'denied',
          legalBasis: BASIS,
        })
      ).status,
    ).toBe(403);
    await ok(server, 'court', folio, {
      action: 'decide_precautionary',
      outcome: 'provisional',
      legalBasis: BASIS,
    });
  });
});

describe('vía penal en paralelo', () => {
  it('la vista al Ministerio Público abre la vía penal sin detener la administrativa', async () => {
    const { server, folio, reporter } = await setup();
    await ok(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna al órgano interno de control del ente (nota sintética).',
    });
    await ok(server, 'oicIntake', folio, { action: 'accept' });
    await advance(server, 'oicInvestigator', folio, 'investigation');
    const referral: ProcedureActionRequest = {
      action: 'refer_to_prosecutor',
      basis: 'internal_control',
      prosecutor: 'Fiscalía Especializada en Combate a la Corrupción (sintética)',
    };
    expect((await act(server, 'oicIntake', folio, referral)).status).toBe(403);
    const referred = await ok(server, 'oicInvestigator', folio, referral);
    expect(referred).toMatchObject({
      legalStage: 'investigation',
      criminalStage: 'criminal_complaint_filed',
    });
    expect((await act(server, 'oicInvestigator', folio, referral)).status).toBe(409);
    await advance(server, 'oicInvestigator', folio, 'criminal_investigation');
    // La vía administrativa sigue: califica mientras la penal investiga.
    const qualified = await ok(server, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'qualification',
      qualification: qualification('serious'),
    });
    expect(qualified).toMatchObject({
      legalStage: 'qualification',
      criminalStage: 'criminal_investigation',
    });
    await advance(server, 'oicInvestigator', folio, 'prosecutor_determination');
    const seen = await tracking(server, folio, reporter);
    expect(seen.procedure).toMatchObject({
      legalStage: 'qualification',
      criminalStage: 'prosecutor_determination',
    });
    expect(seen.procedure?.deadlines.map((item) => item.key)).toContain(
      'prosecutor_determination_challenge',
    );
    expect(titles(seen.procedure)).toEqual(
      expect.arrayContaining([
        'Se dio vista al Ministerio Público (denuncia penal)',
        'Vía penal: Investigación penal',
        'Vía penal: Determinación del Ministerio Público',
      ]),
    );
    const step = seen.procedure?.steps.find((item) => item.action === 'criminal_referral_filed');
    expect(step?.record?.legalBasis).toBe('LGRA, art. 10, fracc. III');
    // Saltos que la vía penal no admite.
    expect(
      (await act(server, 'oicInvestigator', folio, { action: 'advance_stage', stage: 'sentence' }))
        .status,
    ).toBe(409);
  });
});

describe('recursos federales', () => {
  it('se marca la denuncia, se da aviso y la vista lo muestra con la regla', async () => {
    const { server, folio } = await toReportFiled('serious');
    const notice: ProcedureActionRequest = {
      action: 'send_federal_notice',
      recipients: ['asf', 'sabg'],
      legalBasis: 'Ley de Coordinación Fiscal, art. 49: aviso inmediato (sintético).',
    };
    expect((await act(server, 'oicInvestigator', folio, notice)).status).toBe(409);
    await ok(server, 'oicInvestigator', folio, {
      action: 'flag_federal_funds',
      funding: 'aportaciones',
    });
    await ok(server, 'oicInvestigator', folio, notice);
    const view = (await detail(server, 'oicInvestigator', folio)).body?.procedure;
    expect(view?.federalFunds).toMatchObject({
      funding: 'aportaciones',
      fundingName: 'Aportaciones federales (Ramo 33)',
    });
    expect(view?.federalFunds?.noticeSentOn).toBeDefined();
  });
});

describe('motivos legales de cierre', () => {
  it('cada motivo exige su motivo del S5, su etapa y, en la remisión, el destino', async () => {
    const { server, folio } = await setup();
    await ok(server, 'inboxIntake', folio, {
      action: 'route',
      authorityId: TEST_AUTHORITIES.oic,
      note: 'Se turna al órgano interno de control del ente (nota sintética).',
    });
    await ok(server, 'oicIntake', folio, { action: 'accept' });
    await advance(server, 'oicInvestigator', folio, 'investigation');
    const close = (extra: Partial<Extract<ProcedureActionRequest, { action: 'close' }>>) =>
      act(server, 'oicInvestigator', folio, {
        action: 'close',
        reason: 'channeled',
        legalBasis: 'LGRA, arts. 14 y 196 fr. II: remisión por incompetencia (sintético).',
        agreement: SYNTHETIC_AGREEMENT,
        ...extra,
      });
    expect((await close({ legalOutcome: 'archived' })).status).toBe(400);
    expect((await close({ legalOutcome: 'incompetence' })).status).toBe(400);
    expect((await close({ reason: 'other', legalOutcome: 'expired' })).status).toBe(409);
    // El desistimiento queda documentado y no cierra.
    await ok(server, 'oicInvestigator', folio, {
      action: 'record_withdrawal',
      note: 'La persona presentó un escrito de desistimiento (sintético).',
    });
    const done = await close({
      legalOutcome: 'incompetence',
      destination: { kind: 'outside', name: 'Comisión Estatal de Derechos Humanos (ficticia)' },
    });
    expect(done.status).toBe(200);
    expect(ProcedureStateSchema.parse(done.body).status).toBe('resolved');
    const view = (await detail(server, 'oicInvestigator', folio)).body?.procedure;
    expect(view?.closure).toMatchObject({
      legalOutcome: 'incompetence',
      destination: { kind: 'outside', name: 'Comisión Estatal de Derechos Humanos (ficticia)' },
    });
    expect(titles(view)).toContain('Se recibió un escrito de desistimiento');
  });

  it('la prescripción cabe en cualquier etapa y deja su estatus', async () => {
    const { server, folio } = await toReportFiled('non_serious');
    const closed = await ok(server, 'oicSubstantiation', folio, {
      action: 'close',
      reason: 'other',
      legalOutcome: 'prescribed',
      legalBasis: 'LGRA, art. 74: prescribió la facultad de sancionar (sintético).',
      agreement: SYNTHETIC_AGREEMENT,
    });
    expect(closed.status).toBe('prescribed_or_expired');
  });
});

describe('separación de funciones (LGRA, art. 115)', () => {
  it('la misma cuenta no investiga y substancia la misma denuncia, aunque cambie de función', async () => {
    const { server, folio } = await toReportFiled('serious');
    // La cuenta que investigó pasa a substanciación en el archivo de cuentas (mismo seudónimo).
    const swapped = testAuthorityRegistryWith((accounts) =>
      accounts.map(([name, account]) =>
        name === 'oicInvestigator'
          ? [name, { ...account, functions: ['substantiation'] }]
          : [name, account],
      ),
    );
    const later = createTestServer({ db: server.db, authorities: swapped });
    const denied = await act(later, 'oicInvestigator', folio, {
      action: 'advance_stage',
      stage: 'report_admitted',
    });
    expect(denied.status).toBe(403);
    // Otra cuenta de substanciación sí puede.
    expect(
      (
        await act(later, 'oicSubstantiation', folio, {
          action: 'advance_stage',
          stage: 'report_admitted',
        })
      ).status,
    ).toBe(200);
    // Y al revés: quien substanció no vuelve a investigar la denuncia.
    const reverse = testAuthorityRegistryWith((accounts) =>
      accounts.map(([name, account]) =>
        name === 'oicSubstantiation'
          ? [name, { ...account, functions: ['investigation'] }]
          : [name, account],
      ),
    );
    const third = createTestServer({ db: server.db, authorities: reverse });
    expect(
      (
        await act(third, 'oicSubstantiation', folio, {
          action: 'request_precautionary',
          measure: 'Exhibición de documentos originales (medida sintética).',
          legalBasis: 'LGRA, art. 124: medida sintética de prueba.',
        })
      ).status,
    ).toBe(403);
  });
});

describe('migración 18', () => {
  it('lleva la etapa penal a su capa y las etapas del Tribunal a las suyas', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    migrate(db, 17);
    const insert = db.prepare(
      `INSERT INTO complaints (folio, mode, status, received_on, state_code, offense_code,
         protection_requested, facts_json, reporter_box_public_key, reporter_signing_public_key,
         auth_verifier, receipt_json, management_state, legal_stage)
       VALUES (?, 'anonymous', 'classified', '2026-01-05', '22', 'LGRA-52', 0, '{}', 'x', 'y', ?, '{}',
         'accepted', ?)`,
    );
    insert.run('AAAA-AAAA-AAAA', 'v1', 'trial');
    insert.run('BBBB-BBBB-BBBB', 'v2', 'evidence_hearing');
    insert.run('CCCC-CCCC-CCCC', 'v3', 'evidence_hearing');
    const step = db.prepare(
      `INSERT INTO procedure_steps (folio, position, action, step_on, legal_on, management_state,
         legal_stage, authority_id) VALUES (?, ?, 'stage_advanced', '2026-02-01', '2026-02-01',
         'accepted', ?, 'authority.prueba')`,
    );
    step.run('BBBB-BBBB-BBBB', 0, 'case_file_sent');
    step.run('BBBB-BBBB-BBBB', 1, 'evidence_hearing');
    step.run('CCCC-CCCC-CCCC', 0, 'evidence_hearing');
    migrate(db);
    const stages = db
      .prepare('SELECT folio, legal_stage, criminal_stage FROM complaints ORDER BY folio')
      .all()
      .map((row) => [
        readOptionalText(row, 'legal_stage'),
        readOptionalText(row, 'criminal_stage'),
      ]);
    expect(stages).toEqual([
      [null, 'trial'],
      ['court_evidence_hearing', null],
      ['evidence_hearing', null],
    ]);
    // Los pasos guardados no cambian (son de solo agregar).
    expect(
      db
        .prepare(
          "SELECT legal_stage FROM procedure_steps WHERE folio = 'BBBB-BBBB-BBBB' AND position = 1",
        )
        .get()?.['legal_stage'],
    ).toBe('evidence_hearing');
    expect(openDatabase(':memory:')).toBeDefined();
  });
});
