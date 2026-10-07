// Pruebas de subida de pruebas: tipo real por bytes mágicos, tamaño máximo, descriptor devuelto,
// reparto de la cuota (sin desalojo), purga de pendientes (diaria y por reto vencido), retención
// sin atención o archivadas y descarte por la autoridad.
import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  DiscardEvidenceResponseSchema,
  EvidenceUploadResponseSchema,
  LedgerPageSchema,
  MAX_EVIDENCE_BYTES,
  POW_HEADER,
  PowChallengeSchema,
  ROUTES,
  TrackingViewSchema,
} from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { ComplaintDetailSchema } from '@sigilo/contracts';
import { formatPowHeader, sha256Hex, solvePow } from '@sigilo/core';
import { createEvidenceRepository } from '../db/evidence-repository.ts';
import {
  CHALLENGE_UPLOADS_GRACE_MS,
  EVIDENCE_PURGE_INTERVAL_MS,
  evidenceDeletionDay,
  purgeStalePendingEvidence,
  purgeUnattendedEvidence,
  startEvidencePurge,
} from '../services/evidence-service.ts';
import type { Scheduler } from '../services/evidence-service.ts';
import {
  buildComplaintRequest,
  createReporter,
  createTestServer,
  credentialsFor,
  getAsAuthority,
  postJson,
  sampleJpeg,
  samplePng,
  submitComplaint,
  TEST_TOKEN,
  uploadEvidence,
} from '../test-support/harness.ts';
import type { TestServer } from '../test-support/harness.ts';

describe('POST evidence', () => {
  it('guarda PNG y JPEG y devuelve su descriptor con SHA-256', async () => {
    const { app } = createTestServer();
    for (const [bytes, mediaType] of [
      [samplePng(), 'image/png'],
      [sampleJpeg(), 'image/jpeg'],
    ] as const) {
      const response = await uploadEvidence(app, bytes, mediaType);
      expect(response.status).toBe(201);
      const descriptor = EvidenceUploadResponseSchema.parse(await response.json());
      expect(descriptor).toMatchObject({
        mediaType,
        sha256: sha256Hex(bytes),
        sizeBytes: bytes.length,
      });
      expect(descriptor.evidenceId).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it('rechaza bytes mágicos que no coinciden con el tipo declarado', async () => {
    const { app } = createTestServer();
    const mismatched = await uploadEvidence(app, sampleJpeg(), 'image/png');
    expect(mismatched.status).toBe(415);
    const garbage = await uploadEvidence(app, new Uint8Array(64).fill(1), 'image/jpeg');
    expect(garbage.status).toBe(415);
    expect(ApiErrorSchema.parse(await garbage.json()).error.code).toBe('unsupported_media_type');
  });

  it('rechaza tipos de contenido distintos de JPEG y PNG', async () => {
    const { app } = createTestServer();
    const response = await uploadEvidence(app, samplePng(), 'application/pdf');
    expect(response.status).toBe(415);
  });

  it('rechaza un cuerpo vacío', async () => {
    const { app } = createTestServer();
    const response = await uploadEvidence(app, new Uint8Array(0), 'image/png');
    expect(response.status).toBe(400);
  });

  it('responde 413 cuando se excede el tamaño máximo', async () => {
    const { app } = createTestServer();
    const response = await uploadEvidence(app, samplePng(MAX_EVIDENCE_BYTES + 1), 'image/png');
    expect(response.status).toBe(413);
    expect(ApiErrorSchema.parse(await response.json()).error.code).toBe('payload_too_large');
  });
});

describe('cuota de almacenamiento', () => {
  it('limita las pendientes a su parte de la cuota y responde 507 al excederla', async () => {
    // Cuota 400: las pendientes pueden ocupar 100.
    const server = createTestServer({ evidenceQuotaBytes: 400 });
    expect((await uploadEvidence(server.app, samplePng(60), 'image/png')).status).toBe(201);
    const full = await uploadEvidence(server.app, samplePng(60), 'image/png');
    expect(full.status).toBe(507);
    expect(ApiErrorSchema.parse(await full.json()).error.code).toBe('storage_full');
    expect((await uploadEvidence(server.app, samplePng(40), 'image/png')).status).toBe(201);
  });

  it('nunca borra pruebas asociadas para hacer sitio: sin espacio responde storage_full', async () => {
    const server = createTestServer({ evidenceQuotaBytes: 1000 });
    const attach = async (size: number) => {
      const evidence = EvidenceUploadResponseSchema.parse(
        await (await uploadEvidence(server.app, samplePng(size), 'image/png')).json(),
      );
      await submitComplaint(
        server,
        await buildComplaintRequest(server, {
          mode: 'anonymous',
          reporter: createReporter(),
          evidence: [evidence],
        }),
      );
      return evidence;
    };
    const kept = [await attach(240), await attach(240), await attach(240), await attach(240)];
    // 960 guardados + 60 superan la cuota de 1000: se rechaza en lugar de desalojar.
    const full = await uploadEvidence(server.app, samplePng(60), 'image/png');
    expect(full.status).toBe(507);
    expect(ApiErrorSchema.parse(await full.json()).error.code).toBe('storage_full');
    for (const evidence of kept) {
      expect(server.evidenceStore.read(evidence.evidenceId)).not.toBeNull();
    }
    expect((await uploadEvidence(server.app, samplePng(40), 'image/png')).status).toBe(201);
  });

  it('rechaza una denuncia cuyas pruebas exceden su parte de la cuota', async () => {
    // Cuota pequeña: la parte por denuncia es una prueba de tamaño máximo.
    const server = createTestServer({ evidenceQuotaBytes: 1000 });
    const evidence = EvidenceUploadResponseSchema.parse(
      await (await uploadEvidence(server.app, samplePng(100), 'image/png')).json(),
    );
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      evidence: [{ ...evidence, sizeBytes: MAX_EVIDENCE_BYTES }, evidence].map((item, index) =>
        index === 0 ? { ...item, evidenceId: 'f'.repeat(32) } : item,
      ),
    });
    const response = await postJson(server.app, ROUTES.complaints, request);
    expect(response.status).toBe(413);
  });
});

describe('retención de pruebas sin atender', () => {
  async function scenario() {
    const server = createTestServer();
    const upload = async () =>
      EvidenceUploadResponseSchema.parse(
        await (await uploadEvidence(server.app, samplePng(), 'image/png')).json(),
      );
    const tracked = createReporter();
    const other = createReporter();
    const trackedEvidence = await upload();
    const otherEvidence = await upload();
    const first = await submitComplaint(
      server,
      await buildComplaintRequest(server, {
        mode: 'anonymous',
        reporter: tracked,
        evidence: [trackedEvidence],
      }),
    );
    const second = await submitComplaint(
      server,
      await buildComplaintRequest(server, {
        mode: 'anonymous',
        reporter: other,
        evidence: [otherEvidence],
      }),
    );
    await postJson(server.app, ROUTES.tracking, credentialsFor(first.folio, tracked));
    return { server, trackedEvidence, otherEvidence, folios: [first.folio, second.folio] };
  }

  function purge(server: TestServer, now: Date, retentionDays: number) {
    return purgeUnattendedEvidence({
      evidence: createEvidenceRepository(server.db),
      evidenceStore: server.evidenceStore,
      now: () => now,
      retentionDays,
    });
  }

  it('borra tras el plazo los archivos de denuncias sin atender, aunque tengan seguimiento', async () => {
    const { server, trackedEvidence, otherEvidence } = await scenario();
    const later = new Date('2026-12-01T00:00:00Z');
    expect(purge(server, later, 0)).toBe(0);
    expect(purge(server, new Date('2026-10-25T00:00:00Z'), 30)).toBe(0);
    expect(purge(server, later, 30)).toBe(2);
    expect(server.evidenceStore.read(otherEvidence.evidenceId)).toBeNull();
    expect(server.evidenceStore.read(trackedEvidence.evidenceId)).toBeNull();
    expect(purge(server, later, 30)).toBe(0);
    // El descriptor se conserva (para recalcular digestos); el archivo ya no se entrega.
    const download = await getAsAuthority(
      server.app,
      ROUTES.authorityEvidence(otherEvidence.evidenceId),
    );
    expect(download.status).toBe(404);
    expect(createEvidenceRepository(server.db).totalStoredBytes()).toBe(0);
  });

  it('el detalle avisa el día en que se borrarán las pruebas si la denuncia sigue sin atender', async () => {
    const { server, folios } = await scenario();
    const [first = '', second = ''] = folios;
    const detail = async (folio: string) =>
      ComplaintDetailSchema.parse(
        await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folio))).json(),
      );
    // Recibida el 2026-10-20 con 30 días de retención: la purga la borra a partir del 2026-11-20.
    expect(evidenceDeletionDay('2026-10-20', 30)).toBe('2026-11-20');
    expect(evidenceDeletionDay('2026-10-20', 0)).toBeNull();
    expect((await detail(first)).evidenceDeletionOn).toBe('2026-11-20');
    expect(purge(server, new Date('2026-11-19T23:59:00Z'), 30)).toBe(0);
    await postJson(server.app, ROUTES.authorityStatus(second), { status: 'routing' }, TEST_TOKEN);
    expect((await detail(second)).evidenceDeletionOn).toBeUndefined();
    expect(purge(server, new Date('2026-11-20T00:01:00Z'), 30)).toBe(1);
    // Ya sin archivos guardados, no hay nada que avisar.
    expect((await detail(first)).evidenceDeletionOn).toBeUndefined();
    const disabled = createTestServer({ evidenceRetentionDays: 0 });
    const { folio } = await submitComplaint(
      disabled,
      await buildComplaintRequest(disabled, {
        mode: 'anonymous',
        reporter: createReporter(),
        evidence: [
          EvidenceUploadResponseSchema.parse(
            await (await uploadEvidence(disabled.app, samplePng(), 'image/png')).json(),
          ),
        ],
      }),
    );
    const withoutRetention = ComplaintDetailSchema.parse(
      await (await getAsAuthority(disabled.app, ROUTES.authorityComplaint(folio))).json(),
    );
    expect(withoutRetention.evidenceDeletionOn).toBeUndefined();
  });

  it('también borra las de denuncias archivadas: archivar el spam no bloquea la cuota', async () => {
    const { server, folios } = await scenario();
    for (const folio of folios) {
      await postJson(server.app, ROUTES.authorityStatus(folio), { status: 'archived' }, TEST_TOKEN);
    }
    const detail = ComplaintDetailSchema.parse(
      await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folios[0] ?? ''))).json(),
    );
    expect(detail.evidenceDeletionOn).toBe('2026-11-20');
    expect(purge(server, new Date('2026-12-01T00:00:00Z'), 30)).toBe(2);
    expect(createEvidenceRepository(server.db).totalStoredBytes()).toBe(0);
  });

  it('respeta las denuncias que la autoridad ya atendió', async () => {
    const { server, otherEvidence, folios } = await scenario();
    const [, otherFolio] = folios;
    await postJson(
      server.app,
      ROUTES.authorityStatus(otherFolio ?? ''),
      { status: 'routing' },
      TEST_TOKEN,
    );
    expect(purge(server, new Date('2026-12-01T00:00:00Z'), 30)).toBe(1);
    expect(server.evidenceStore.read(otherEvidence.evidenceId)).not.toBeNull();
  });
});

describe('purga de pruebas pendientes', () => {
  async function upload(server: TestServer): Promise<EvidenceDescriptor> {
    return (await (
      await uploadEvidence(server.app, samplePng(), 'image/png')
    ).json()) as EvidenceDescriptor;
  }

  function purgeDeps(server: TestServer, now: Date) {
    return {
      evidence: createEvidenceRepository(server.db),
      evidenceStore: server.evidenceStore,
      now: () => now,
    };
  }

  it('borra solo las pendientes con más de 24 h y conserva las asociadas', async () => {
    const server = createTestServer();
    const stale = await upload(server);
    const associated = await upload(server);
    await submitComplaint(
      server,
      await buildComplaintRequest(server, {
        mode: 'anonymous',
        reporter: createReporter(),
        evidence: [associated],
      }),
    );
    server.setNow(new Date('2026-10-21T10:00:00Z'));
    const recent = await upload(server);
    const repository = createEvidenceRepository(server.db);

    // Menos de 24 h después de la subida más tardía posible del día 20: nada se borra.
    expect(purgeStalePendingEvidence(purgeDeps(server, new Date('2026-10-21T23:00:00Z')))).toBe(0);
    expect(purgeStalePendingEvidence(purgeDeps(server, new Date('2026-10-22T00:00:01Z')))).toBe(1);
    expect(repository.find(stale.evidenceId)).toBeNull();
    expect(server.evidenceStore.read(stale.evidenceId)).toBeNull();
    expect(repository.find(associated.evidenceId)?.folio).not.toBeNull();
    expect(server.evidenceStore.read(associated.evidenceId)).not.toBeNull();
    expect(repository.find(recent.evidenceId)).not.toBeNull();
  });

  it('purga al arrancar y en cada intervalo con el reloj inyectado', async () => {
    const server = createTestServer();
    const first = await upload(server);
    let now = new Date('2026-10-22T01:00:00Z');
    const tasks: { intervalMs: number; task: () => void }[] = [];
    const scheduler: Scheduler = {
      every: (intervalMs, task) => {
        tasks.push({ intervalMs, task });
        return () => undefined;
      },
    };
    const repository = createEvidenceRepository(server.db);
    startEvidencePurge(
      { evidence: repository, evidenceStore: server.evidenceStore, now: () => now },
      scheduler,
    );
    expect(repository.find(first.evidenceId)).toBeNull();
    expect(tasks.map((item) => item.intervalMs)).toEqual([EVIDENCE_PURGE_INTERVAL_MS]);

    server.setNow(new Date('2026-10-22T02:00:00Z'));
    const second = await upload(server);
    tasks[0]?.task();
    expect(repository.find(second.evidenceId)).not.toBeNull();
    now = new Date('2026-10-24T00:00:00Z');
    tasks[0]?.task();
    expect(repository.find(second.evidenceId)).toBeNull();
  });
});

describe('descarte de pruebas por la autoridad', () => {
  async function complaintWithEvidence(server: TestServer, count: number) {
    const evidence: EvidenceDescriptor[] = [];
    for (let index = 0; index < count; index += 1) {
      evidence.push(
        EvidenceUploadResponseSchema.parse(
          await (await uploadEvidence(server.app, samplePng(), 'image/png')).json(),
        ),
      );
    }
    const reporter = createReporter();
    const { folio } = await submitComplaint(
      server,
      await buildComplaintRequest(server, { mode: 'anonymous', reporter, evidence }),
    );
    return { folio, reporter, evidence };
  }

  it('borra los archivos, libera la cuota, queda en la bitácora y en el seguimiento', async () => {
    const server = createTestServer();
    const { folio, reporter, evidence } = await complaintWithEvidence(server, 2);
    const discard = (token?: string) =>
      postJson(server.app, ROUTES.authorityEvidenceDiscard(folio), {}, token);
    expect((await discard()).status).toBe(401);
    expect(
      (
        await postJson(
          server.app,
          ROUTES.authorityEvidenceDiscard('ZZZZ-ZZZZ-ZZZZ'),
          {},
          TEST_TOKEN,
        )
      ).status,
    ).toBe(404);

    const response = await discard(TEST_TOKEN);
    expect(response.status).toBe(200);
    expect(DiscardEvidenceResponseSchema.parse(await response.json())).toEqual({ discarded: 2 });
    for (const item of evidence) expect(server.evidenceStore.read(item.evidenceId)).toBeNull();
    expect(createEvidenceRepository(server.db).totalStoredBytes()).toBe(0);
    const detail = ComplaintDetailSchema.parse(
      await (await getAsAuthority(server.app, ROUTES.authorityComplaint(folio))).json(),
    );
    // Los descriptores siguen (los digestos son verificables); los archivos ya no.
    expect(detail.evidence).toHaveLength(2);
    expect(detail.storedEvidenceCount).toBe(0);
    expect(detail.evidenceDeletionOn).toBeUndefined();

    // Sin archivos guardados, otro descarte no registra nada.
    expect(DiscardEvidenceResponseSchema.parse(await (await discard(TEST_TOKEN)).json())).toEqual({
      discarded: 0,
    });
    const view = TrackingViewSchema.parse(
      await (await postJson(server.app, ROUTES.tracking, credentialsFor(folio, reporter))).json(),
    );
    expect(view.evidenceDiscards).toEqual([{ on: '2026-10-20', count: 2 }]);

    await server.advanceTo(new Date('2026-10-21T09:00:00Z'));
    const page = LedgerPageSchema.parse(
      await (await server.app.request(`${ROUTES.ledgerEvents}?from=0&limit=10`)).json(),
    );
    const discarded = page.events.filter((event) => event.type === 'evidence.discarded');
    expect(discarded).toHaveLength(1);
    expect(discarded[0]).toMatchObject({ actorRole: 'authority', at: '2026-10-20' });
  });
});

describe('purga de pendientes por reto vencido', () => {
  const BITS = 4;

  async function proof(server: TestServer): Promise<string> {
    const { token, bits } = PowChallengeSchema.parse(
      await (await server.app.request(`${ROUTES.powChallenge}?purpose=complaint`)).json(),
    );
    return formatPowHeader(token, solvePow(token, bits) ?? '0');
  }

  function upload(server: TestServer, header: string, size = 1000) {
    return server.app.request(ROUTES.evidenceUpload, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png', [POW_HEADER]: header },
      body: samplePng(size),
    });
  }

  it('libera las pendientes de un reto que venció sin denuncia, sin esperar la purga diaria', async () => {
    // Cuota de 40 000 B: las pendientes caben hasta 10 000 B.
    const server = createTestServer({ powBits: BITS, evidenceQuotaBytes: 40_000 });
    const start = new Date('2026-10-20T10:00:00Z');
    server.setNow(start);
    const repository = createEvidenceRepository(server.db);

    // Un reto que sí termina en denuncia: sus pruebas asociadas no se tocan.
    const kept = await proof(server);
    const keptEvidence = EvidenceUploadResponseSchema.parse(
      await (await upload(server, kept, 500)).json(),
    );
    const request = await buildComplaintRequest(server, {
      mode: 'anonymous',
      reporter: createReporter(),
      evidence: [keptEvidence],
    });
    const created = await server.app.request(ROUTES.complaints, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [POW_HEADER]: kept },
      body: JSON.stringify(request),
    });
    expect(created.status).toBe(201);

    // Un atacante llena las pendientes con un reto que nunca cierra.
    const hoard = await proof(server);
    for (let index = 0; index < 9; index += 1)
      expect((await upload(server, hoard)).status).toBe(201);
    expect((await upload(server, await proof(server), 2000)).status).toBe(507);

    // Al vencer el reto más el margen, la siguiente subida legítima cabe.
    server.setNow(new Date(start.getTime() + 10 * 60 * 1000 + CHALLENGE_UPLOADS_GRACE_MS));
    expect((await upload(server, await proof(server), 2000)).status).toBe(201);
    expect(repository.pendingStoredBytes()).toBe(2000);
    expect(repository.find(keptEvidence.evidenceId)?.folio).not.toBeNull();
    expect(server.evidenceStore.read(keptEvidence.evidenceId)).not.toBeNull();
  });
});
