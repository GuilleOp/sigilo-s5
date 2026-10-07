// Recepción de denuncias y acciones de la autoridad sobre ellas (estatus y apertura de identidad).
import type {
  ComplaintStatus,
  OpenIdentityResponse,
  SubmitComplaintRequest,
  SubmitComplaintResponse,
} from '@sigilo/contracts';
import {
  computeSubmissionDigest,
  generateFolio,
  identityOpenedPayload,
  randomBytes,
  signReceipt,
  toDayDate,
  toHex,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { hasIdentityShape, isKey32 } from './crypto-checks.ts';
import { budgetOf } from './evidence-service.ts';

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
  // Seguridad: cada denuncia ocupa a lo más su parte de la cuota de pruebas.
  const totalBytes = request.evidence.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (totalBytes > budgetOf(ctx).perComplaint) throw new ApiFailure('payload_too_large');
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
 * Lanza `bad_request` si algo no corresponde, en particular si otro recibo ya usa el mismo
 * `authVerifier`; `payload_too_large` si sus pruebas exceden la parte de la cuota por denuncia;
 * `ledger_day_full` si la bitácora alcanzó su tope del día, y `rate_limited` solo con el freno
 * extremo de envíos.
 * Seguridad: el freno extremo se descuenta solo cuando la transacción se confirma; un intento
 * rechazado (por ejemplo, con un verificador repetido) no gasta la cuota de nadie. Contra el abuso
 * actúa antes la dificultad adaptativa de la prueba de trabajo.
 */
export function submitComplaint(
  ctx: AppContext,
  request: SubmitComplaintRequest,
): SubmitComplaintResponse {
  assertRequestShape(ctx, request);
  if (ctx.limiters.complaintSubmissions.isLimited(SUBMISSIONS_KEY)) {
    throw new ApiFailure('rate_limited');
  }
  const submissionDigest = computeSubmissionDigest(request);
  const receivedOn = toDayDate(ctx.deps.now());
  const response = withTransaction(ctx.deps.db, () => {
    // Seguridad: cada recibo pertenece a una sola denuncia. Reutilizar el verificador de otra es
    // el primer paso para trasplantar su sobre de identidad (el índice único también lo impide).
    if (ctx.complaints.hasAuthVerifier(request.authVerifier)) throw new ApiFailure('bad_request');
    const folio = newFolio(ctx);
    // Seguridad: los datos de cada evento incluyen el folio (60 bits secretos), así su digesto
    // público no se puede adivinar probando valores, pero la persona denunciante sí lo verifica.
    // El evento queda pendiente hasta que cierre el día; el comprobante firma su `payloadDigest`.
    const event = ctx.ledger.record({
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
        payloadDigest: event.payloadDigest,
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
    ctx.statusHistory.insert(folio, 'received', receivedOn);
    return { folio, receipt };
  });
  ctx.limiters.complaintSubmissions.consume(SUBMISSIONS_KEY);
  return response;
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
    const changedOn = toDayDate(ctx.deps.now());
    ctx.ledger.record({
      type: 'complaint.status_changed',
      folio,
      at: changedOn,
      actorRole: 'authority',
      // Seguridad: un identificador aleatorio hace único el digesto aunque el estatus se repita,
      // y el folio impide adivinarlo probando estatus.
      payload: { folio, status, changeId: toHex(randomBytes(16)) },
    });
    ctx.complaints.updateStatus(folio, status);
    ctx.statusHistory.insert(folio, status, changedOn);
    return { ...current, status };
  });
}

/**
 * Registra `identity.opened` con su fundamento y después entrega el sobre de identidad. La
 * autoridad recalcula su contexto (AAD) desde el detalle de la denuncia.
 * Lanza `not_found` si la denuncia es anónima.
 * Seguridad: es la única vía para obtener el sobre y siempre deja rastro. La persona denunciante
 * ve la apertura de inmediato en su seguimiento; el evento público se encadena al cerrar el día y
 * lleva la etiqueta de su recibo, para que lo encuentre aunque se registre con otro folio.
 */
export function openIdentity(
  ctx: AppContext,
  complaint: ComplaintRecord,
  legalBasis: string,
): OpenIdentityResponse {
  const sealedIdentity = complaint.sealedIdentity;
  if (complaint.mode !== 'sealed' || sealedIdentity === null) throw new ApiFailure('not_found');
  const openedOn = toDayDate(ctx.deps.now());
  const openingId = toHex(randomBytes(16));
  const payload = identityOpenedPayload({
    folio: complaint.folio,
    openingId,
    legalBasis,
    authVerifier: complaint.authVerifier,
  });
  withTransaction(ctx.deps.db, () => {
    ctx.ledger.record({
      type: 'identity.opened',
      folio: complaint.folio,
      at: openedOn,
      actorRole: 'authority',
      payload,
      receiptTag: payload.receiptTag,
    });
    ctx.identityOpenings.insert(complaint.folio, openingId, openedOn, legalBasis);
  });
  return { sealedIdentity, openingId };
}
