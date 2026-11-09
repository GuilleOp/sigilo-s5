// Panel de la autoridad: autoridades del nodo, listado y detalle por competencia, trámite, apertura
// de identidad 2 de 3, buzón, pruebas y su descarte, acuerdos de cierre y escalamientos.
import type { Context, Hono } from 'hono';
import {
  API_PREFIX,
  ApproveIdentityRequestSchema,
  AuthorityMessageRequestSchema,
  FolioSchema,
  OpenIdentityRequestSchema,
  OpeningIdSchema,
  ProcedureActionRequestSchema,
  ImportClosuresRequestSchema,
  ROUTES,
  TransferComplaintRequestSchema,
  TransferReceiptRequestSchema,
} from '@sigilo/contracts';
import { bodyLimit } from 'hono/body-limit';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { ApiFailure, errorResponse } from '../http/errors.ts';
import { jsonBodyLimit, readJson } from '../http/request.ts';
import {
  currentAccount,
  requireAuthoritySession,
  requireFunction,
} from '../security/authority-auth.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import {
  deliverEscalationEnvelope,
  isEscalatedTo,
  listEscalations,
} from '../services/escalation-service.ts';
import { discardEvidence } from '../services/evidence-service.ts';
import {
  approveIdentityOpening,
  IDENTITY_CUSTODIAN_FUNCTIONS,
  releaseIdentityEnvelope,
  requestIdentityOpening,
} from '../services/identity-service.ts';
import { recordMessage } from '../services/mailbox-service.ts';
import { applyProcedureAction, isCompetent } from '../services/procedure-service.ts';
import { importClosures } from '../services/closure-import-service.ts';
import { confirmTransfer, transferComplaint } from '../services/transfer-service.ts';
import { buildComplaintDetail } from '../services/views.ts';
import { MAX_INBOX_BODY_BYTES } from './network.ts';

/** Lote de acuerdos importados: hasta 1000 acuerdos de 20 000 caracteres. */
const MAX_IMPORT_BODY_BYTES = 24 * 1024 * 1024;

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

function parsePage(c: Context): { offset: number; limit: number } {
  const offset = parseCount(c.req.query('offset'), 0);
  const limit = parseCount(c.req.query('limit'), DEFAULT_COMPLAINTS_PAGE);
  if (limit < 1) throw new ApiFailure('bad_request');
  return { offset, limit: Math.min(limit, MAX_COMPLAINTS_PAGE) };
}

const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png' } as const;

function folioOf(c: Context): string {
  const folio = FolioSchema.safeParse(c.req.param('folio'));
  if (!folio.success) throw new ApiFailure('not_found');
  return folio.data;
}

function requestIdOf(c: Context): string {
  const requestId = OpeningIdSchema.safeParse(c.req.param('requestId'));
  if (!requestId.success) throw new ApiFailure('not_found');
  return requestId.data;
}

/**
 * Denuncia de la autoridad de la cuenta.
 * Seguridad (SEC-17): una denuncia de otra autoridad responde igual que una inexistente.
 */
function findCompetent(ctx: AppContext, c: Context, account: AuthorityAccount): ComplaintRecord {
  const complaint = ctx.complaints.find(folioOf(c));
  if (complaint === null || !isCompetent(ctx, account, complaint)) {
    throw new ApiFailure('not_found');
  }
  return complaint;
}

function serveEvidence(ctx: AppContext, c: Context): Response {
  const account = currentAccount(c);
  const evidenceId = c.req.param('evidenceId') ?? '';
  const record = EVIDENCE_ID_PATTERN.test(evidenceId) ? ctx.evidence.find(evidenceId) : null;
  // Las pruebas pendientes (sin denuncia) no se sirven; las de otra autoridad, tampoco, salvo a la
  // supervisora de una denuncia escalada.
  const complaint = record?.folio ? ctx.complaints.find(record.folio) : null;
  const isAllowed =
    complaint !== null &&
    (isCompetent(ctx, account, complaint) || isEscalatedTo(ctx, account, complaint.folio));
  const bytes = isAllowed ? ctx.deps.evidenceStore.read(evidenceId) : null;
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
 * Registra las rutas de la autoridad, todas con sesión de una cuenta individual. Cada ruta
 * comprueba primero la función de la cuenta (`forbidden`) y después la competencia por folio
 * (`not_found`).
 */
export function registerAuthorityRoutes(app: Hono, ctx: AppContext): void {
  app.use(`${API_PREFIX}/authority/*`, requireAuthoritySession(ctx));

  app.get(ROUTES.authorityAuthorities, (c) => c.json(ctx.authorities.listAuthorities()));

  // Paginación simple por desplazamiento: `offset` (0 por omisión) y `limit` (de 1 a 500).
  app.get(ROUTES.authorityComplaints, (c) => {
    const account = currentAccount(c);
    const { offset, limit } = parsePage(c);
    return c.json(
      ctx.complaints.listSummariesForAuthority(
        account.authorityId,
        ctx.authorities.inboxAuthorityId,
        offset,
        limit,
      ),
    );
  });

  app.get(ROUTES.authorityComplaint(':folio'), (c) =>
    c.json(buildComplaintDetail(ctx, findCompetent(ctx, c, currentAccount(c)), currentAccount(c))),
  );

  app.post(ROUTES.authorityProcedure(':folio'), jsonBodyLimit, async (c) => {
    const account = requireFunction(ctx, c, ['intake', 'investigation', 'substantiation']);
    const folio = folioOf(c);
    const request = await readJson(c, ProcedureActionRequestSchema);
    return c.json(applyProcedureAction(ctx, account, folio, request));
  });

  // Turnado a otro nodo: el cuerpo lleva el sobre re-cifrado en el navegador (hasta 16 MiB).
  app.post(
    ROUTES.authorityTransfer(':folio'),
    bodyLimit({
      maxSize: MAX_INBOX_BODY_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    async (c) => {
      const account = requireFunction(ctx, c, ['intake']);
      const folio = folioOf(c);
      const request = await readJson(c, TransferComplaintRequestSchema);
      return c.json(await transferComplaint(ctx, account, folio, request));
    },
  );

  app.post(ROUTES.authorityTransferReceipt(':folio'), jsonBodyLimit, async (c) => {
    const account = requireFunction(ctx, c, ['intake']);
    const folio = folioOf(c);
    confirmTransfer(ctx, account, folio, await readJson(c, TransferReceiptRequestSchema));
    return c.body(null, 204);
  });

  app.post(
    ROUTES.authorityClosureImports,
    bodyLimit({
      maxSize: MAX_IMPORT_BODY_BYTES,
      onError: (c) => errorResponse(c, 'payload_too_large'),
    }),
    async (c) => {
      const account = requireFunction(ctx, c, ['intake', 'investigation']);
      const request = await readJson(c, ImportClosuresRequestSchema);
      return c.json(importClosures(ctx, account, request), 201);
    },
  );

  // Conteos agregados del auditor: sin folios ni texto, para el observatorio.
  app.get(ROUTES.authorityAuditSummary, (c) => c.json(ctx.integration.countAuditSignals()));

  app.post(ROUTES.authorityIdentityRequests(':folio'), jsonBodyLimit, async (c) => {
    // Seguridad (separación de funciones): quien turna nunca solicita ni aprueba aperturas.
    const account = requireFunction(ctx, c, IDENTITY_CUSTODIAN_FUNCTIONS);
    const folio = folioOf(c);
    const { legalBasis } = await readJson(c, OpenIdentityRequestSchema);
    return c.json(requestIdentityOpening(ctx, account, folio, legalBasis), 201);
  });

  app.post(ROUTES.authorityIdentityApprovals(':folio', ':requestId'), jsonBodyLimit, async (c) => {
    const account = requireFunction(ctx, c, IDENTITY_CUSTODIAN_FUNCTIONS);
    const folio = folioOf(c);
    const requestId = requestIdOf(c);
    const { legalBasis } = await readJson(c, ApproveIdentityRequestSchema);
    return c.json(approveIdentityOpening(ctx, account, folio, requestId, legalBasis));
  });

  // Sin cuerpo: la entrega solo depende de la solicitud aprobada.
  app.post(ROUTES.authorityIdentityEnvelope(':folio', ':requestId'), (c) => {
    const account = requireFunction(ctx, c, IDENTITY_CUSTODIAN_FUNCTIONS);
    return c.json(releaseIdentityEnvelope(ctx, account, folioOf(c), requestIdOf(c)));
  });

  app.post(ROUTES.authorityMessages(':folio'), jsonBodyLimit, async (c) => {
    const account = requireFunction(ctx, c, ['investigation']);
    const complaint = findCompetent(ctx, c, account);
    const { sequence, envelope, signature } = await readJson(c, AuthorityMessageRequestSchema);
    const message = recordMessage(ctx, complaint, {
      from: 'authority',
      sequence,
      envelope,
      signature,
      actorId: account.accountId,
    });
    return c.json(message, 201);
  });

  // Sin cuerpo: la acción solo depende del folio. El buzón general también descarta el spam.
  app.post(ROUTES.authorityEvidenceDiscard(':folio'), (c) => {
    const account = requireFunction(ctx, c, ['intake', 'investigation']);
    const complaint = findCompetent(ctx, c, account);
    return c.json({ discarded: discardEvidence(ctx, complaint.folio, account.accountId) });
  });

  app.get(ROUTES.authorityEvidence(':evidenceId'), (c) => serveEvidence(ctx, c));

  // Acuerdos de cierre de la autoridad y de las que supervisa, para el auditor.
  app.get(ROUTES.authorityClosures, (c) => {
    const account = requireFunction(ctx, c, ['supervision']);
    const { offset, limit } = parsePage(c);
    const authorityIds = [
      account.authorityId,
      ...ctx.authorities.supervisedBy(account.authorityId),
    ];
    return c.json(ctx.procedure.listClosures(authorityIds, offset, limit));
  });

  app.get(ROUTES.authorityEscalations, (c) => {
    const account = requireFunction(ctx, c, ['supervision']);
    return c.json(listEscalations(ctx, account));
  });

  // Sin cuerpo: la entrega solo depende de que una regla de escalamiento se haya cumplido.
  app.post(ROUTES.authorityEscalationEnvelope(':folio'), (c) => {
    const account = requireFunction(ctx, c, ['supervision']);
    return c.json(deliverEscalationEnvelope(ctx, account, folioOf(c)));
  });
}
