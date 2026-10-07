// Subida de pruebas como cuerpo binario crudo (imagen JPEG o PNG ya limpia en el navegador).
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { EvidenceMediaTypeSchema, MAX_EVIDENCE_BYTES, ROUTES } from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import { ApiFailure, errorResponse } from '../http/errors.ts';
import { mediaTypeOf } from '../http/request.ts';
import { requireProofOfWork } from '../security/proof-of-work.ts';
import { storeEvidence } from '../services/evidence-service.ts';

/** Registra `POST evidenceUpload`, que exige la prueba de trabajo de propósito `evidence`. */
export function registerEvidenceRoutes(app: Hono, ctx: AppContext): void {
  app.post(
    ROUTES.evidenceUpload,
    requireProofOfWork(ctx.pow, 'evidence'),
    bodyLimit({
      maxSize: MAX_EVIDENCE_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    async (c) => {
      const mediaType = EvidenceMediaTypeSchema.safeParse(mediaTypeOf(c));
      if (!mediaType.success) throw new ApiFailure('unsupported_media_type');
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      if (bytes.length === 0) throw new ApiFailure('bad_request');
      if (bytes.length > MAX_EVIDENCE_BYTES) throw new ApiFailure('payload_too_large');
      return c.json(storeEvidence(ctx, bytes, mediaType.data), 201);
    },
  );
}
