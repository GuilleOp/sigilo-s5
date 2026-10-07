// Panel de la autoridad: listado, detalle, apertura de identidad, estatus, buzón, pruebas y su
// descarte.
import type { Context, Hono } from 'hono';
import {
  API_PREFIX,
  AuthorityMessageRequestSchema,
  FolioSchema,
  OpenIdentityRequestSchema,
  ROUTES,
  UpdateStatusRequestSchema,
} from '@sigilo/contracts';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import { requireAuthority } from '../security/authority-auth.ts';
import { changeStatus, openIdentity } from '../services/complaint-service.ts';
import { discardEvidence } from '../services/evidence-service.ts';
import { recordMessage } from '../services/mailbox-service.ts';
import { buildComplaintDetail, toSummary } from '../services/views.ts';

const EVIDENCE_ID_PATTERN = /^[0-9a-f]{32}$/;
const COUNT_PATTERN = /^\d{1,9}$/;

/** Tamaño de página del listado por omisión y máximo. */
export const DEFAULT_COMPLAINTS_PAGE = 100;
export const MAX_COMPLAINTS_PAGE = 500;

function parseCount(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!COUNT_PATTERN.test(value)) throw new ApiFailure('bad_request');
  return Number(value);
}
const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;

function findComplaint(ctx: AppContext, c: Context): ComplaintRecord {
  const folio = FolioSchema.safeParse(c.req.param('folio'));
  const complaint = folio.success ? ctx.complaints.find(folio.data) : null;
  if (complaint === null) throw new ApiFailure('not_found');
  return complaint;
}

function serveEvidence(ctx: AppContext, c: Context): Response {
  const evidenceId = c.req.param('evidenceId') ?? '';
  const record = EVIDENCE_ID_PATTERN.test(evidenceId) ? ctx.evidence.find(evidenceId) : null;
  // Las pruebas pendientes (sin denuncia) no se sirven.
  const bytes = record?.folio ? ctx.deps.evidenceStore.read(evidenceId) : null;
  if (record === null || bytes === null) throw new ApiFailure('not_found');
  c.header('Content-Type', record.mediaType);
  // Seguridad: se fuerza la descarga y se impide que el navegador reinterprete el tipo.
  c.header(
    'Content-Disposition',
    `attachment; filename="${evidenceId}.${EXTENSION_BY_TYPE[record.mediaType]}"`,
  );
  c.header('X-Content-Type-Options', 'nosniff');
  return c.body(new Uint8Array(bytes));
}

/**
 * Registra las rutas de la autoridad, todas protegidas con token bearer. `GET authorityComplaints`
 * acepta `offset` y `limit`.
 */
export function registerAuthorityRoutes(app: Hono, ctx: AppContext): void {
  app.use(`${API_PREFIX}/authority/*`, requireAuthority(ctx.deps.authorityToken));

  // Paginación simple por desplazamiento: `offset` (0 por omisión) y `limit` (de 1 a 500).
  app.get(ROUTES.authorityComplaints, (c) => {
    const offset = parseCount(c.req.query('offset'), 0);
    const limit = parseCount(c.req.query('limit'), DEFAULT_COMPLAINTS_PAGE);
    if (limit < 1) throw new ApiFailure('bad_request');
    return c.json(ctx.complaints.listSummaries(offset, Math.min(limit, MAX_COMPLAINTS_PAGE)));
  });

  app.get(ROUTES.authorityComplaint(':folio'), (c) =>
    c.json(buildComplaintDetail(ctx, findComplaint(ctx, c))),
  );

  app.post(ROUTES.authorityIdentity(':folio'), jsonBodyLimit, async (c) => {
    const complaint = findComplaint(ctx, c);
    const { legalBasis } = await readJson(c, OpenIdentityRequestSchema);
    return c.json(openIdentity(ctx, complaint, legalBasis));
  });

  app.post(ROUTES.authorityStatus(':folio'), jsonBodyLimit, async (c) => {
    const complaint = findComplaint(ctx, c);
    const { status } = await readJson(c, UpdateStatusRequestSchema);
    return c.json(toSummary(changeStatus(ctx, complaint.folio, status)));
  });

  app.post(ROUTES.authorityMessages(':folio'), jsonBodyLimit, async (c) => {
    const complaint = findComplaint(ctx, c);
    const { sequence, envelope, signature } = await readJson(c, AuthorityMessageRequestSchema);
    const message = recordMessage(ctx, complaint, {
      from: 'authority',
      sequence,
      envelope,
      signature,
    });
    return c.json(message, 201);
  });

  // Sin cuerpo: la acción solo depende del folio.
  app.post(ROUTES.authorityEvidenceDiscard(':folio'), (c) => {
    const complaint = findComplaint(ctx, c);
    return c.json({ discarded: discardEvidence(ctx, complaint.folio) });
  });

  app.get(ROUTES.authorityEvidence(':evidenceId'), (c) => serveEvidence(ctx, c));
}
