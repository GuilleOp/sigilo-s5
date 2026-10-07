// Pruebas de subida de pruebas: tipo real por bytes mágicos, tamaño máximo y descriptor devuelto.
import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  EvidenceUploadResponseSchema,
  MAX_EVIDENCE_BYTES,
} from '@sigilo/contracts';
import { sha256Hex } from '@sigilo/core';
import {
  createTestServer,
  sampleJpeg,
  samplePng,
  uploadEvidence,
} from '../test-support/harness.ts';

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
