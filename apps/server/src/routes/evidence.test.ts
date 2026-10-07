// Pruebas de subida de pruebas: tipo real por bytes mágicos, tamaño máximo, descriptor devuelto,
// cuotas de subidas y de almacenamiento, purga de pendientes vencidas y retención sin seguimiento.
import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  EvidenceUploadResponseSchema,
  MAX_EVIDENCE_BYTES,
  ROUTES,
} from '@sigilo/contracts';
import type { EvidenceDescriptor } from '@sigilo/contracts';
import { sha256Hex } from '@sigilo/core';
import { createComplaintsRepository } from '../db/complaints-repository.ts';
import { createEvidenceRepository } from '../db/evidence-repository.ts';
import {
  EVIDENCE_PURGE_INTERVAL_MS,
  purgeStalePendingEvidence,
  purgeUntrackedEvidence,
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

describe('cuota de subidas', () => {
  it('responde 429 al agotar la cuota de la ventana y la reinicia después', async () => {
    const server = createTestServer({
      rateLimits: { evidenceUploads: { limit: 2, windowMs: 60 * 60 * 1000 } },
    });
    const statuses: number[] = [];
    for (let index = 0; index < 3; index += 1) {
      statuses.push((await uploadEvidence(server.app, samplePng(), 'image/png')).status);
    }
    expect(statuses).toEqual([201, 201, 429]);
    server.setNow(new Date('2026-10-20T17:00:00Z'));
    expect((await uploadEvidence(server.app, samplePng(), 'image/png')).status).toBe(201);
  });
});

describe('cuota de almacenamiento', () => {
  it('responde 507 si la prueba excedería la cuota total y libera al purgar', async () => {
    const server = createTestServer({ evidenceQuotaBytes: 200 });
    expect((await uploadEvidence(server.app, samplePng(120), 'image/png')).status).toBe(201);
    const full = await uploadEvidence(server.app, samplePng(120), 'image/png');
    expect(full.status).toBe(507);
    expect(ApiErrorSchema.parse(await full.json()).error.code).toBe('storage_full');
    expect((await uploadEvidence(server.app, samplePng(80), 'image/png')).status).toBe(201);
  });
});

describe('retención de pruebas sin seguimiento', () => {
  async function scenario() {
    const server = createTestServer();
    const upload = async () =>
      EvidenceUploadResponseSchema.parse(
        await (await uploadEvidence(server.app, samplePng(), 'image/png')).json(),
      );
    const tracked = createReporter();
    const untracked = createReporter();
    const trackedEvidence = await upload();
    const untrackedEvidence = await upload();
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
        reporter: untracked,
        evidence: [untrackedEvidence],
      }),
    );
    await postJson(server.app, ROUTES.tracking, credentialsFor(first.folio, tracked));
    return { server, trackedEvidence, untrackedEvidence, folios: [first.folio, second.folio] };
  }

  function purge(server: TestServer, now: Date, retentionDays: number) {
    return purgeUntrackedEvidence({
      complaints: createComplaintsRepository(server.db),
      evidence: createEvidenceRepository(server.db),
      evidenceStore: server.evidenceStore,
      now: () => now,
      retentionDays,
    });
  }

  it('borra solo los archivos de denuncias sin seguimiento ni atención tras el plazo', async () => {
    const { server, trackedEvidence, untrackedEvidence } = await scenario();
    const later = new Date('2026-12-01T00:00:00Z');
    expect(purge(server, later, 0)).toBe(0);
    expect(purge(server, new Date('2026-10-25T00:00:00Z'), 30)).toBe(0);
    expect(purge(server, later, 30)).toBe(1);
    expect(server.evidenceStore.read(untrackedEvidence.evidenceId)).toBeNull();
    expect(server.evidenceStore.read(trackedEvidence.evidenceId)).not.toBeNull();
    expect(purge(server, later, 30)).toBe(0);
    // El descriptor se conserva (para recalcular digestos); el archivo ya no se entrega.
    const download = await getAsAuthority(
      server.app,
      ROUTES.authorityEvidence(untrackedEvidence.evidenceId),
    );
    expect(download.status).toBe(404);
    expect(createEvidenceRepository(server.db).totalStoredBytes()).toBe(trackedEvidence.sizeBytes);
  });

  it('respeta las denuncias que la autoridad ya atendió', async () => {
    const { server, untrackedEvidence, folios } = await scenario();
    const [, untrackedFolio] = folios;
    await postJson(
      server.app,
      ROUTES.authorityStatus(untrackedFolio ?? ''),
      { status: 'routing' },
      TEST_TOKEN,
    );
    expect(purge(server, new Date('2026-12-01T00:00:00Z'), 30)).toBe(0);
    expect(server.evidenceStore.read(untrackedEvidence.evidenceId)).not.toBeNull();
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
