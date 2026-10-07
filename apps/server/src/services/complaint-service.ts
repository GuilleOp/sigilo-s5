// Recepción de denuncias y acciones de la autoridad sobre ellas (estatus y apertura de identidad).
import type {
  ComplaintStatus,
  OpenIdentityResponse,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import { computeSubmissionDigest, generateFolio, signReceipt, toDayDate } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { hasIdentityShape, isKey32 } from './crypto-checks.ts';

const MAX_FOLIO_ATTEMPTS = 8;
const SUBMISSIONS_KEY = 'global';

function assertRequestShape(ctx: AppContext, request: SubmitComplaintRequest): void {
  const { reporterKeys, authVerifier, sealedIdentity } = request;
  const hasValidKeys =
    isKey32(reporterKeys.boxPublicKey) &&
    isKey32(reporterKeys.signingPublicKey) &&
    isKey32(authVerifier);
  if (!hasValidKeys) throw new ApiFailure('bad_request');
  if (request.mode === 'sealed') {
    // Seguridad: la identidad solo se acepta cifrada hacia la llave fijada de la autoridad.
    const isForAuthority = sealedIdentity?.keyId === ctx.deps.keys.publicKeySet.authority.keyId;
    if (sealedIdentity === undefined || !isForAuthority || !hasIdentityShape(sealedIdentity)) {
      throw new ApiFailure('bad_request');
    }
  }
}

function associateEvidence(ctx: AppContext, request: SubmitComplaintRequest, folio: string): void {
  const ids = request.evidence.map((item) => item.evidenceId);
  if (new Set(ids).size !== ids.length) throw new ApiFailure('bad_request');
  request.evidence.forEach((item, position) => {
    const stored = ctx.evidence.find(item.evidenceId);
    const isMatch =
      stored !== null &&
      stored.folio === null &&
      stored.sha256 === item.sha256 &&
      stored.sizeBytes === item.sizeBytes &&
      stored.mediaType === item.mediaType;
    if (!isMatch || !ctx.evidence.associate(item.evidenceId, folio, position)) {
      throw new ApiFailure('bad_request');
    }
  });
}

function newFolio(ctx: AppContext): string {
  for (let attempt = 0; attempt < MAX_FOLIO_ATTEMPTS; attempt += 1) {
    const folio = generateFolio();
    if (!ctx.complaints.exists(folio)) return folio;
  }
  throw new Error('No se pudo generar un folio único.');
}

/**
 * Valida y guarda la denuncia, asocia sus pruebas, registra `complaint.received` y firma el
 * comprobante, todo en una sola transacción.
 * Lanza `rate_limited` si se agotó la cuota global de envíos y `bad_request` si algo no
 * corresponde, en particular si otro recibo ya usa el mismo `authVerifier`.
 */
export function submitComplaint(
  ctx: AppContext,
  request: SubmitComplaintRequest,
): SubmitComplaintResponse {
  assertRequestShape(ctx, request);
  if (!ctx.limiters.complaintSubmissions.consume(SUBMISSIONS_KEY)) {
    throw new ApiFailure('rate_limited');
  }
  const submissionDigest = computeSubmissionDigest(request);
  const receivedOn = toDayDate(ctx.deps.now());
  return withTransaction(ctx.deps.db, () => {
    // Seguridad: cada recibo pertenece a una sola denuncia. Reutilizar el verificador de otra es
    // el primer paso para trasplantar su sobre de identidad (el índice único también lo impide).
    if (ctx.complaints.hasAuthVerifier(request.authVerifier)) throw new ApiFailure('bad_request');
    const folio = newFolio(ctx);
    // Seguridad: los datos de cada evento incluyen el folio (60 bits secretos), así su digesto
    // público no se puede adivinar probando valores, pero la persona denunciante sí lo verifica.
    const event = ctx.ledger.append({
      type: 'complaint.received',
      folio,
      at: receivedOn,
      actorRole: 'system',
      payload: { folio, submissionDigest },
    });
    const receipt = signReceipt(
      {
        folio,
        submissionDigest,
        receivedOn,
        ledgerSeq: event.seq,
        serverKeyId: ctx.deps.keys.publicKeySet.server.keyId,
      },
      ctx.deps.keys.serverSigningPrivateKey,
    );
    ctx.complaints.insert({
      folio,
      mode: request.mode,
      status: 'received',
      receivedOn,
      facts: request.facts,
      protectionRequested: request.protectionRequested,
      sealedIdentity: request.sealedIdentity ?? null,
      reporterKeys: request.reporterKeys,
      authVerifier: request.authVerifier,
      receipt,
    });
    associateEvidence(ctx, request, folio);
    return { folio, receipt };
  });
}

/**
 * Cambia el estatus y registra `complaint.status_changed`.
 * Lanza `not_found` si el folio no existe y `bad_request` si el estatus no cambia.
 * Seguridad: el estatus vigente se vuelve a leer dentro de la transacción, así dos cambios
 * simultáneos no registran dos eventos del mismo estatus.
 */
export function changeStatus(
  ctx: AppContext,
  folio: string,
  status: ComplaintStatus,
): ComplaintRecord {
  return withTransaction(ctx.deps.db, () => {
    const current = ctx.complaints.find(folio);
    if (current === null) throw new ApiFailure('not_found');
    if (current.status === status) throw new ApiFailure('bad_request');
    ctx.ledger.append({
      type: 'complaint.status_changed',
      folio,
      at: toDayDate(ctx.deps.now()),
      actorRole: 'authority',
      payload: { folio, status },
    });
    ctx.complaints.updateStatus(folio, status);
    return { ...current, status };
  });
}

/**
 * Registra `identity.opened` con su fundamento y después entrega el sobre de identidad. La
 * autoridad recalcula su contexto (AAD) desde el detalle de la denuncia.
 * Lanza `not_found` si la denuncia es anónima.
 * Seguridad: es la única vía para obtener el sobre y siempre deja rastro visible para la persona.
 */
export function openIdentity(
  ctx: AppContext,
  complaint: ComplaintRecord,
  legalBasis: string,
): OpenIdentityResponse {
  const sealedIdentity = complaint.sealedIdentity;
  if (complaint.mode !== 'sealed' || sealedIdentity === null) throw new ApiFailure('not_found');
  const openedOn = toDayDate(ctx.deps.now());
  const event = withTransaction(ctx.deps.db, () => {
    const appended = ctx.ledger.append({
      type: 'identity.opened',
      folio: complaint.folio,
      at: openedOn,
      actorRole: 'authority',
      payload: { folio: complaint.folio, legalBasis },
    });
    ctx.identityOpenings.insert(complaint.folio, appended.seq, openedOn, legalBasis);
    return appended;
  });
  return { sealedIdentity, ledgerSeq: event.seq };
}
