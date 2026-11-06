// Apertura de la identidad sellada con aprobación de dos personas distintas de la autoridad
// competente (2 de 3 custodios). El servidor nunca descifra: solo libera el sobre cuando la
// solicitud alcanzó el umbral, a quien la aprobó; el descifrado ocurre en su navegador.
import type { IdentityOpeningRequestView, OpenIdentityResponse } from '@sigilo/contracts';
import {
  findDeadlineRule,
  IDENTITY_APPROVAL_THRESHOLD,
  IDENTITY_REQUEST_TTL_DAYS,
} from '@sigilo/contracts';
import {
  addNaturalDays,
  computeDueDate,
  identityOpenedPayload,
  randomBytes,
  receiptTagFor,
  termForRule,
  toDayDate,
  toHex,
  toMexicoCentralDay,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import type { StoredIdentityRequest } from '../db/identity-requests-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import { logSecurityEvent } from '../security/authority-auth.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';
import { isCompetent } from './procedure-service.ts';
import { REPORTER_REQUESTER } from './qualification-service.ts';

/** Funciones que pueden solicitar y aprobar aperturas: nunca recepción y turnado. */
export const IDENTITY_CUSTODIAN_FUNCTIONS = ['investigation', 'supervision'] as const;

function isOpened(ctx: AppContext, request: StoredIdentityRequest): boolean {
  return ctx.identityOpenings
    .listByFolio(request.folio)
    .some((opening) => opening.openingId === request.requestId);
}

function expiresOn(request: StoredIdentityRequest): string {
  return addNaturalDays(request.requestedOn, IDENTITY_REQUEST_TTL_DAYS);
}

/** Vista de una solicitud con sus aprobaciones y su estado al día de hoy. */
export function identityRequestView(
  ctx: AppContext,
  request: StoredIdentityRequest,
): IdentityOpeningRequestView {
  const today = toDayDate(ctx.deps.now());
  const status = isOpened(ctx, request)
    ? 'approved'
    : today > expiresOn(request)
      ? 'expired'
      : 'pending';
  return {
    requestId: request.requestId,
    requestedOn: request.requestedOn,
    legalBasis: request.legalBasis,
    status,
    approvals: ctx.identityRequests.listApprovals(request.requestId),
    threshold: IDENTITY_APPROVAL_THRESHOLD,
    expiresOn: expiresOn(request),
    purpose: request.requestedBy === REPORTER_REQUESTER ? 'appeal' : 'authority',
  };
}

/** Solicitudes de apertura de la denuncia, de la más antigua a la más reciente. */
export function listIdentityRequests(
  ctx: AppContext,
  complaint: ComplaintRecord,
): IdentityOpeningRequestView[] {
  return ctx.identityRequests
    .listRequests(complaint.folio)
    .map((request) => identityRequestView(ctx, request));
}

function assertCustodian(ctx: AppContext, account: AuthorityAccount, complaint: ComplaintRecord) {
  // Seguridad: la denuncia de otra autoridad responde igual que una inexistente; la anónima
  // también, porque no tiene identidad que abrir.
  const hasIdentity = complaint.mode === 'sealed' && complaint.sealedIdentity !== null;
  if (!isCompetent(ctx, account, complaint) || !hasIdentity) throw new ApiFailure('not_found');
}

function recordApproval(
  ctx: AppContext,
  account: AuthorityAccount,
  request: StoredIdentityRequest,
  legalBasis: string,
): void {
  const approvalId = toHex(randomBytes(16));
  const { at: approvedOn } = ctx.ledger.record({
    type: 'identity.approved',
    folio: request.folio,
    at: toDayDate(ctx.deps.now()),
    actorRole: 'authority',
    payload: {
      folio: request.folio,
      requestId: request.requestId,
      approvalId,
      legalBasis,
      actor: account.accountId,
    },
  });
  const isNew = ctx.identityRequests.insertApproval(approvalId, request.requestId, {
    accountId: account.accountId,
    on: approvedOn,
    legalBasis,
  });
  // Seguridad: una misma persona no cuenta dos veces (lo impide también el índice único).
  if (!isNew) throw new ApiFailure('conflict');
}

/**
 * Si la solicitud alcanzó el umbral de aprobaciones distintas, registra la apertura: el evento
 * `identity.opened` (con la etiqueta del recibo) y la entrada que la persona ve de inmediato.
 */
function openIfApproved(
  ctx: AppContext,
  complaint: ComplaintRecord,
  request: StoredIdentityRequest,
): void {
  const approvals = ctx.identityRequests.listApprovals(request.requestId);
  if (approvals.length < IDENTITY_APPROVAL_THRESHOLD) return;
  const payload = identityOpenedPayload({
    folio: complaint.folio,
    openingId: request.requestId,
    legalBasis: request.legalBasis,
    authVerifier: complaint.authVerifier,
  });
  const { at: openedOn } = ctx.ledger.record({
    type: 'identity.opened',
    folio: complaint.folio,
    at: toDayDate(ctx.deps.now()),
    actorRole: 'authority',
    payload,
    receiptTag: payload.receiptTag,
  });
  ctx.identityOpenings.insert(complaint.folio, request.requestId, openedOn, request.legalBasis);
}

/**
 * Crea una solicitud de apertura con su fundamento; cuenta como la primera aprobación y queda en
 * la bitácora (`identity.approved`).
 * Lanza `not_found` si la denuncia no existe, es de otra autoridad o es anónima.
 */
export function requestIdentityOpening(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  legalBasis: string,
): IdentityOpeningRequestView {
  return withTransaction(ctx.deps.db, () => {
    const complaint = ctx.complaints.find(folio);
    if (complaint === null) throw new ApiFailure('not_found');
    assertCustodian(ctx, account, complaint);
    const request: StoredIdentityRequest = {
      requestId: toHex(randomBytes(16)),
      folio,
      authorityId: account.authorityId,
      requestedOn: toDayDate(ctx.deps.now()),
      legalBasis,
      requestedBy: account.accountId,
    };
    ctx.identityRequests.insertRequest(request);
    recordApproval(ctx, account, request, legalBasis);
    openIfApproved(ctx, complaint, request);
    return identityRequestView(ctx, request);
  });
}

function findRequest(
  ctx: AppContext,
  complaint: ComplaintRecord,
  requestId: string,
): StoredIdentityRequest {
  const request = ctx.identityRequests.findRequest(requestId);
  const isSame = request !== null && request.folio === complaint.folio;
  if (!isSame) throw new ApiFailure('not_found');
  return request;
}

/**
 * Aprueba una solicitud con el fundamento de otra persona de la autoridad competente. Al llegar
 * al umbral registra la apertura, que la persona denunciante ve de inmediato en su seguimiento.
 * Lanza `not_found` si la solicitud no es de esa denuncia; `conflict` si ya alcanzó el umbral,
 * venció o la cuenta ya la había aprobado.
 */
export function approveIdentityOpening(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  requestId: string,
  legalBasis: string,
): IdentityOpeningRequestView {
  return withTransaction(ctx.deps.db, () => {
    const complaint = ctx.complaints.find(folio);
    if (complaint === null) throw new ApiFailure('not_found');
    assertCustodian(ctx, account, complaint);
    const request = findRequest(ctx, complaint, requestId);
    const view = identityRequestView(ctx, request);
    // La apertura del recurso ya la decidió la persona; la entrega del sobre pide además dos
    // aprobaciones de la autoridad dentro de la ventana del recurso (H7).
    const isForAppeal = request.requestedBy === REPORTER_REQUESTER;
    const isOpen = isForAppeal ? isAppealWindowOpen(ctx, complaint) : view.status === 'pending';
    if (!isOpen || request.authorityId !== account.authorityId) {
      throw new ApiFailure('conflict');
    }
    recordApproval(ctx, account, request, legalBasis);
    if (!isForAppeal) openIfApproved(ctx, complaint, request);
    return identityRequestView(ctx, request);
  });
}

/**
 * Registra la entrega del sobre: evento público `identity.released` con el seudónimo de la cuenta
 * y la etiqueta del recibo (la persona la encuentra en la bitácora), y la entrada que ve en su
 * seguimiento.
 */
function recordRelease(
  ctx: AppContext,
  complaint: ComplaintRecord,
  openingId: string,
  account: AuthorityAccount,
): void {
  withTransaction(ctx.deps.db, () => {
    const releaseId = toHex(randomBytes(16));
    const receiptTag = receiptTagFor(complaint.authVerifier);
    const { at } = ctx.ledger.record({
      type: 'identity.released',
      folio: complaint.folio,
      at: toDayDate(ctx.deps.now()),
      actorRole: 'authority',
      payload: {
        folio: complaint.folio,
        openingId,
        releaseId,
        actor: account.accountId,
        receiptTag,
      },
      receiptTag,
    });
    ctx.qualifications.insertRelease({
      releaseId,
      folio: complaint.folio,
      openingId,
      releasedOn: at,
      actorId: account.accountId,
    });
  });
}

/** Indica si sigue abierta la ventana del recurso: hasta el plazo de la Sala (art. 107). */
function isAppealWindowOpen(ctx: AppContext, complaint: ComplaintRecord): boolean {
  const appeal = ctx.qualifications.findAppeal(complaint.folio);
  const rule = findDeadlineRule('appeal_resolution');
  if (appeal === null || rule === undefined) return false;
  try {
    const dueOn = computeDueDate(appeal.legalOn, termForRule(rule));
    return toMexicoCentralDay(ctx.deps.now()) <= dueOn;
  } catch {
    return false;
  }
}

/**
 * Entrega el sobre de identidad de una solicitud aprobada a una de las personas que la aprobaron,
 * mientras la solicitud sigue vigente. Cada entrega queda en el registro de seguridad.
 * Lanza `not_found` si no existe; `conflict` si no alcanzó el umbral o venció; `forbidden` si la
 * cuenta no la aprobó.
 * Seguridad: el servidor no puede abrir el sobre; solo decide a quién y cuándo entregarlo.
 */
export function releaseIdentityEnvelope(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  requestId: string,
): OpenIdentityResponse {
  const complaint = ctx.complaints.find(folio);
  if (complaint === null) throw new ApiFailure('not_found');
  assertCustodian(ctx, account, complaint);
  const request = findRequest(ctx, complaint, requestId);
  const isApproved = isOpened(ctx, request);
  const today = toDayDate(ctx.deps.now());
  const isForAppeal = request.requestedBy === REPORTER_REQUESTER;
  // La apertura del recurso dura la ventana del recurso (hasta el plazo de la Sala); las demás,
  // 7 días desde la solicitud.
  const isCurrent = isForAppeal ? isAppealWindowOpen(ctx, complaint) : today <= expiresOn(request);
  if (!isApproved || !isCurrent) throw new ApiFailure('conflict');
  const approvals = ctx.identityRequests.listApprovals(requestId);
  const hasApproved = approvals.some((approval) => approval.accountId === account.accountId);
  // Recurso (H7): dos personas distintas, al menos una de supervisión (distinta de quien calificó).
  const isAppealQuorum =
    approvals.length >= IDENTITY_APPROVAL_THRESHOLD &&
    approvals.some(
      (approval) => ctx.authorities.findAccount(approval.accountId)?.function === 'supervision',
    );
  if (!hasApproved || (isForAppeal && !isAppealQuorum)) {
    logSecurityEvent(ctx, 'function_denied', account.accountId, folio);
    throw new ApiFailure(hasApproved ? 'conflict' : 'forbidden');
  }
  const sealedIdentity = complaint.sealedIdentity;
  if (sealedIdentity === null) throw new ApiFailure('not_found');
  recordRelease(ctx, complaint, request.requestId, account);
  logSecurityEvent(ctx, 'identity_envelope_released', account.accountId, folio);
  return { sealedIdentity, openingId: request.requestId };
}
