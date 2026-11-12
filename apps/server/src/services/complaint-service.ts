// Recepción de denuncias: validación, folio, comprobante firmado y entrada al buzón general del nodo.
import type { SubmitComplaintRequest, SubmitComplaintResponse } from '@sigilo/contracts';
import {
  computeSubmissionDigest,
  corroborationDigest,
  generateFolio,
  signReceipt,
  toDayDate,
  toMexicoCentralDay,
} from '@sigilo/core';
import type { AppContext } from '../context.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { hasInvisibleCharacters } from '../security/invisible-text.ts';
import { hasEscalationShape, hasIdentityShape, isKey32 } from './crypto-checks.ts';
import { directoryAuthority } from '../network/network-context.ts';
import { authorityOfKeyId, isAcceptedIdentityKey } from './authority-keys.ts';
import { budgetOf } from './evidence-service.ts';
import { queueCorroboration } from './corroboration-service.ts';
import { reviewConflictOnAssignment } from './pdn-context.ts';

/** Cómo llegó la denuncia: por el enrutador ciego (con su autoridad destino) o directo al nodo. */
export interface SubmissionOrigin {
  /** Autoridad destino del sobre de red, si llegó por el enrutador. */
  routedTo?: string;
  /**
   * Folio que eligió el navegador (solo por el buzón de red): así la persona lo conoce aunque la
   * denuncia espere en la cola del enrutador. Se rechaza si ya existe.
   */
  folio?: string;
}

const MAX_FOLIO_ATTEMPTS = 8;

function assertRequestShape(ctx: AppContext, request: SubmitComplaintRequest): void {
  const { reporterKeys, authVerifier, sealedIdentity, escalationEnvelope, facts } = request;
  // Seguridad (PRV-23): un carácter invisible en el texto libre puede ser la marca que delata a
  // quien filtró el documento; la web siempre los quita, así que se rechaza en lugar de guardarlo.
  if (hasInvisibleCharacters(facts.accused) || hasInvisibleCharacters(facts.description)) {
    throw new ApiFailure('bad_request');
  }
  if (escalationEnvelope !== undefined) {
    // Seguridad: la segunda llave solo se acepta cifrada hacia la supervisora publicada.
    const supervisorKeyId = ctx.deps.keys.publicKeySet.supervisor?.keyId;
    const isForSupervisor =
      supervisorKeyId !== undefined && escalationEnvelope.keyId === supervisorKeyId;
    if (!isForSupervisor || !hasEscalationShape(escalationEnvelope)) {
      throw new ApiFailure('bad_request');
    }
  }
  const hasValidKeys =
    isKey32(reporterKeys.boxPublicKey) &&
    isKey32(reporterKeys.signingPublicKey) &&
    isKey32(authVerifier);
  if (!hasValidKeys) throw new ApiFailure('bad_request');
  if (request.mode === 'sealed') {
    // Seguridad: la identidad solo se acepta cifrada hacia la llave fijada de la autoridad o
    // hacia la de una autoridad que el nodo aloja según el directorio verificado.
    const isForAuthority =
      sealedIdentity !== undefined && isAcceptedIdentityKey(ctx, sealedIdentity.keyId);
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

/**
 * Folio de la denuncia: el que eligió el navegador por la red o uno nuevo al azar.
 * Seguridad: el navegador lo genera con el mismo generador aleatorio que el nodo; uno repetido se
 * rechaza (`bad_request`) en lugar de sobrescribir o fusionar denuncias.
 */
function folioFor(ctx: AppContext, origin: SubmissionOrigin): string {
  if (origin.folio === undefined) return newFolio(ctx);
  if (ctx.complaints.exists(origin.folio)) throw new ApiFailure('bad_request');
  return origin.folio;
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
 * y `ledger_day_full` si la bitácora alcanzó su tope del día.
 * Seguridad: no hay tope global de envíos; contra el abuso actúa la dificultad adaptativa de la
 * prueba de trabajo. La fecha de recepción es la del evento registrado (ver `LedgerService`), así
 * el comprobante y la bitácora coinciden aunque el reloj retroceda.
 */
/**
 * Autoridad que recibe directamente la denuncia: la que eligió la ventanilla única (destino del
 * sobre de red) o aquella hacia cuya llave del directorio se cifró la identidad, si el nodo la
 * aloja y no es el buzón general. `null` la deja en el buzón general.
 */
/**
 * Indica si la autoridad es supervisora (por el directorio o por el archivo de cuentas). Una
 * supervisora recibe escalamientos con la segunda llave; nunca denuncias directas (H11).
 */
function isSupervisory(ctx: AppContext, authorityId: string): boolean {
  const network = ctx.deps.network;
  const inDirectory =
    network === undefined ? undefined : directoryAuthority(network, authorityId)?.role;
  return inDirectory === 'supervisory' || ctx.authorities.supervisorAuthorityId === authorityId;
}

function directTarget(
  ctx: AppContext,
  request: SubmitComplaintRequest,
  origin: SubmissionOrigin,
): string | null {
  const inbox = ctx.authorities.inboxAuthorityId;
  const isTarget = (authorityId: string | null): authorityId is string =>
    authorityId !== null &&
    authorityId !== inbox &&
    ctx.authorities.authority(authorityId) !== null &&
    !isSupervisory(ctx, authorityId);
  const routed = origin.routedTo ?? null;
  if (isTarget(routed)) return routed;
  const keyId = request.sealedIdentity?.keyId;
  const byKey = keyId === undefined ? null : authorityOfKeyId(ctx, keyId);
  return isTarget(byKey) ? byKey : null;
}

export function submitComplaint(
  ctx: AppContext,
  request: SubmitComplaintRequest,
  origin: SubmissionOrigin = {},
): SubmitComplaintResponse {
  assertRequestShape(ctx, request);
  const submissionDigest = computeSubmissionDigest(request);
  const target = directTarget(ctx, request, origin);
  const response = withTransaction(ctx.deps.db, () => {
    // Seguridad: cada recibo pertenece a una sola denuncia. Reutilizar el verificador de otra es
    // el primer paso para trasplantar su sobre de identidad (el índice único también lo impide).
    if (ctx.complaints.hasAuthVerifier(request.authVerifier)) throw new ApiFailure('bad_request');
    const folio = folioFor(ctx, origin);
    // Seguridad: los datos de cada evento incluyen el folio (60 bits secretos), así su digesto
    // público no se puede adivinar probando valores, pero la persona denunciante sí lo verifica.
    // El evento queda pendiente hasta que cierre el día; el comprobante firma su `payloadDigest`.
    const event = ctx.ledger.record({
      type: 'complaint.received',
      folio,
      at: toDayDate(ctx.deps.now()),
      actorRole: 'system',
      payload: { folio, submissionDigest },
    });
    const receivedOn = event.at;
    // Día legal de recepción (hora del centro de México): de él corren los plazos.
    const receivedLegalOn = toMexicoCentralDay(ctx.deps.now());
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
      receivedLegalOn,
      assignedAuthorityId: ctx.authorities.inboxAuthorityId,
      managementState: 'received_in_inbox',
      legalStage: null,
      closureReason: null,
      escalationEnvelope: request.escalationEnvelope ?? null,
      corroborationDigest:
        request.corroboration === undefined ? null : corroborationDigest(request.corroboration),
    });
    associateEvidence(ctx, request, folio);
    ctx.statusHistory.insert(folio, 'received', receivedOn);
    ctx.procedure.insertStep(folio, {
      action: 'received',
      on: receivedOn,
      legalOn: receivedLegalOn,
      managementState: 'received_in_inbox',
      legalStage: null,
      closureReason: null,
      authorityId: ctx.authorities.inboxAuthorityId,
      actorId: null,
      note: null,
    });
    if (target !== null) {
      // La ventanilla única ya eligió la autoridad competente con el directorio: llega turnada.
      ctx.complaints.updateProcedure(folio, {
        status: 'routed',
        assignedAuthorityId: target,
        managementState: 'routed',
        legalStage: null,
        closureReason: null,
      });
      ctx.statusHistory.insert(folio, 'routed', receivedOn);
      ctx.procedure.insertStep(folio, {
        action: 'routed',
        on: receivedOn,
        legalOn: receivedLegalOn,
        managementState: 'routed',
        legalStage: null,
        closureReason: null,
        authorityId: target,
        actorId: null,
        note: 'La ventanilla única la envió a la autoridad competente según el directorio de la red.',
      });
    }
    queueCorroboration(ctx, folio, request, origin.routedTo === undefined ? 'direct' : 'relay');
    return { folio, receipt };
  });
  // Seguridad: la revisión de conflicto solo informa; si falla, la denuncia ya quedó guardada.
  if (target !== null) reviewConflictOnAssignment(ctx, response.folio, target);
  return response;
}
