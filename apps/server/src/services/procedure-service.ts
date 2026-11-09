// Acciones del trámite con el catálogo del Estándar S5: turnar, aceptar, reasignar, devolver al
// buzón general, avanzar de etapa legal y cerrar con fundamento. Cada acción respeta el flujo de
// gestión, la función de la cuenta y la autoridad competente, y queda en la bitácora.
import type {
  ClosureReason,
  ComplaintStatus,
  LegalStage,
  ManagementState,
  ProcedureAction,
  ProcedureActionRequest,
  ProcedureState,
} from '@sigilo/contracts';
import {
  ADMINISTRATIVE_STAGES,
  CRIMINAL_STAGES,
  findLegalStage,
  functionForStage,
  functionInChargeAt,
  hasAnyFunction,
  hasFunction,
  isManagementTransition,
} from '@sigilo/contracts';
import { randomBytes, sha256Hex, toDayDate, toHex, toMexicoCentralDay } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import { ApiFailure } from '../http/errors.ts';
import { logSecurityEvent } from '../security/authority-auth.ts';
import { requestIndexWithdrawal, withdrawalReasonFor } from './corroboration-service.ts';
import {
  ARCHIVE_NOTICE,
  NON_SERIOUS_NOTICE,
  recordQualification,
} from './qualification-service.ts';
import {
  conflictResponseOf,
  isExcusedAuthority,
  reviewConflictOnAssignment,
  verifyClosureSanction,
} from './pdn-context.ts';
import type { AuthorityAccount } from '../security/authority-registry.ts';

/** Autoridad que tiene la denuncia; las anteriores al nodo de varias autoridades, el buzón. */
export function assignedAuthorityOf(ctx: AppContext, complaint: ComplaintRecord): string {
  return complaint.assignedAuthorityId ?? ctx.authorities.inboxAuthorityId;
}

/** Indica si la cuenta pertenece a la autoridad que tiene la denuncia (competencia por folio). */
export function isCompetent(
  ctx: AppContext,
  account: AuthorityAccount,
  complaint: ComplaintRecord,
): boolean {
  return account.authorityId === assignedAuthorityOf(ctx, complaint);
}

/** Estatus de la API v1 que corresponde a una etapa legal. */
function statusForStage(stage: LegalStage): ComplaintStatus {
  if (stage === 'investigation') return 'investigating';
  return findLegalStage(stage)?.track === 'criminal' ? 'investigating' : 'classified';
}

/** Estatus de la API v1 que corresponde a un cierre: el archivo es `archived`; los demás, `resolved`. */
function statusForClosure(reason: ClosureReason): ComplaintStatus {
  return reason === 'insufficient_information' ? 'archived' : 'resolved';
}

/**
 * Indica si `next` es una etapa válida después de `current`: la primera de su vía si no hay etapa,
 * o una posterior de la misma vía.
 */
function isStageAdvance(current: LegalStage | null, next: LegalStage): boolean {
  const order: readonly LegalStage[][] = [
    ADMINISTRATIVE_STAGES.map((stage) => stage.key),
    CRIMINAL_STAGES.map((stage) => stage.key),
  ];
  const track = order.find((stages) => stages.includes(next));
  if (track === undefined) return false;
  if (current === null) return track[0] === next;
  return track.includes(current) && track.indexOf(next) > track.indexOf(current);
}

/** Resultado calculado de una acción antes de guardarse. */
interface PlannedStep {
  action: ProcedureAction;
  managementState: ManagementState;
  status: ComplaintStatus;
  assignedAuthorityId: string;
  legalStage: LegalStage | null;
  closureReason: ClosureReason | null;
  note: string | null;
}

/**
 * Comprueba la acción contra el flujo de gestión, la función de la cuenta y la competencia, y
 * calcula el estado resultante. Lanza `forbidden` si la función no puede, `not_found` si la cuenta
 * no es de la autoridad que tiene la denuncia y `conflict` si el flujo no lo admite.
 * Seguridad (separación de funciones): recepción y turnado (`intake`) turna, acepta, reasigna y
 * devuelve; investigación avanza las etapas hasta presentar el IPRA (`report_filed`) y cierra lo
 * que investiga; substanciación y resolución avanza las etapas posteriores al informe y cierra lo
 * que substancia (LGRA art. 3 fr. III y IV, art. 115: nunca la misma cuenta que investiga); el
 * buzón general puede cerrar como improcedente lo que nunca turnó. Una cuenta de recepción e
 * investigación hace lo de ambas.
 */
function plan(
  ctx: AppContext,
  account: AuthorityAccount,
  complaint: ComplaintRecord,
  request: ProcedureActionRequest,
): PlannedStep {
  const current = complaint.managementState;
  const assigned = assignedAuthorityOf(ctx, complaint);
  const inbox = ctx.authorities.inboxAuthorityId;
  const base = {
    assignedAuthorityId: assigned,
    legalStage: complaint.legalStage,
    closureReason: null,
    note: null,
  };
  const requireIntake = () => {
    if (!hasFunction(account, 'intake')) throw new ApiFailure('forbidden');
  };
  const requireTarget = (authorityId: string) => {
    if (ctx.authorities.authority(authorityId) === null || authorityId === inbox) {
      throw new ApiFailure('bad_request');
    }
  };
  const requireTransition = (to: ManagementState) => {
    if (!isManagementTransition(current, to)) throw new ApiFailure('conflict');
  };
  // LGRA, art. 58 (H5): la autoridad que se excusó no acepta ni resuelve; solo reasigna o turna.
  const isResolutive =
    request.action === 'accept' || request.action === 'advance_stage' || request.action === 'close';
  if (isResolutive && current !== 'closed' && isExcusedAuthority(ctx, complaint)) {
    throw new ApiFailure('conflict');
  }
  switch (request.action) {
    case 'route':
      requireIntake();
      requireTransition('routed');
      requireTarget(request.authorityId);
      return {
        ...base,
        action: 'routed',
        managementState: 'routed',
        status: 'routed',
        assignedAuthorityId: request.authorityId,
        note: request.note ?? null,
      };
    case 'accept': {
      // Aceptar también reabre una denuncia cerrada por nuevos indicios (LGRA, art. 100): lo hace
      // quien recibe o investiga, nunca supervisión ni substanciación.
      const isReopen = current === 'closed';
      const allowed = isReopen ? (['intake', 'investigation'] as const) : (['intake'] as const);
      if (!hasAnyFunction(account, allowed)) throw new ApiFailure('forbidden');
      requireTransition('accepted');
      return {
        ...base,
        action: 'accepted',
        managementState: 'accepted',
        status: complaint.legalStage === null ? 'routed' : statusForStage(complaint.legalStage),
        note: request.note ?? null,
      };
    }
    case 'reassign':
      requireIntake();
      requireTransition('reassigned');
      requireTarget(request.authorityId);
      if (request.authorityId === assigned) throw new ApiFailure('conflict');
      return {
        ...base,
        action: 'reassigned',
        managementState: 'reassigned',
        status: 'routed',
        assignedAuthorityId: request.authorityId,
        note: request.note,
      };
    case 'return':
      requireIntake();
      requireTransition('returned_to_inbox');
      return {
        ...base,
        action: 'returned_to_inbox',
        managementState: 'returned_to_inbox',
        status: 'routing',
        assignedAuthorityId: inbox,
        note: request.note,
      };
    case 'advance_stage': {
      // Investigación avanza hasta el IPRA; substanciación, lo que sigue (`functionForStage`).
      if (!hasFunction(account, functionForStage(request.stage))) {
        throw new ApiFailure('forbidden');
      }
      // La calificación solo acompaña el paso a la etapa de calificación (LGRA, art. 100).
      if (request.qualification !== undefined && request.stage !== 'qualification') {
        throw new ApiFailure('bad_request');
      }
      // La substanciación empieza con el IPRA presentado: no se salta `report_filed`.
      const skipsReport =
        functionForStage(request.stage) === 'substantiation' &&
        (complaint.legalStage === null ||
          functionInChargeAt(complaint.legalStage) !== 'substantiation');
      if (
        current !== 'accepted' ||
        !isStageAdvance(complaint.legalStage, request.stage) ||
        skipsReport
      ) {
        throw new ApiFailure('conflict');
      }
      const isNonSerious = request.qualification?.severity === 'non_serious';
      return {
        ...base,
        action: 'stage_advanced',
        managementState: 'accepted',
        status: statusForStage(request.stage),
        legalStage: request.stage,
        // LGRA, art. 102: la persona identificable ve de inmediato cómo puede inconformarse.
        note: request.note ?? (isNonSerious ? NON_SERIOUS_NOTICE : null),
      };
    }
    case 'close': {
      const isInboxClosure = current === 'received_in_inbox' || current === 'returned_to_inbox';
      // Fuera del buzón cierra quien lleva la etapa actual: investigación o, desde que se presentó
      // el IPRA, substanciación (que resuelve).
      const allowed = isInboxClosure
        ? 'intake'
        : complaint.legalStage === null
          ? 'investigation'
          : functionInChargeAt(complaint.legalStage);
      if (!hasFunction(account, allowed)) throw new ApiFailure('forbidden');
      requireTransition('closed');
      return {
        ...base,
        action: 'closed',
        managementState: 'closed',
        status: statusForClosure(request.reason),
        closureReason: request.reason,
        // Aviso del sistema en el seguimiento al archivar (H6); el aviso legal llega por el buzón.
        note: request.reason === 'insufficient_information' ? ARCHIVE_NOTICE : null,
      };
    }
    case 'respond_conflict': {
      // Excusa o justificación ante un posible conflicto de interés (LGRA, art. 58): no cambia el
      // estado del trámite, pero evita el escalamiento por resolver con conflicto.
      if (!hasAnyFunction(account, ['intake', 'investigation', 'substantiation'])) {
        throw new ApiFailure('forbidden');
      }
      const review = ctx.integration.lastConflictReview(complaint.folio);
      const isPending =
        review !== null &&
        review.requiresResponse &&
        review.authorityId === assigned &&
        conflictResponseOf(ctx, complaint) === null;
      if (!isPending || current === 'closed') throw new ApiFailure('conflict');
      return {
        ...base,
        action: request.response === 'excuse' ? 'conflict_excused' : 'conflict_justified',
        managementState: current,
        status: complaint.status,
        closureReason: complaint.closureReason,
        note: request.note,
      };
    }
  }
}

/**
 * Aplica una acción del trámite: guarda el estado, el paso de la línea de tiempo (con su nota
 * pública) y, al cerrar, el acuerdo en versión pública; registra `complaint.status_changed` con el
 * seudónimo de la cuenta. Todo en una transacción que vuelve a leer la denuncia.
 * Lanza `not_found` si el folio no existe o la cuenta no es de la autoridad competente (sin
 * distinguirlos), `forbidden`, `conflict` o `bad_request` según `plan`.
 */
export function applyProcedureAction(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  request: ProcedureActionRequest,
): ProcedureState {
  try {
    const state = withTransaction(ctx.deps.db, () =>
      applyInTransaction(ctx, account, folio, request),
    );
    // Después de guardar: al turnar o reasignar se revisa el conflicto de interés de la autoridad
    // que recibe; al cerrar con sanción, se verifica contra S3. Ambas solo informan.
    if (request.action === 'route' || request.action === 'reassign') {
      reviewConflictOnAssignment(ctx, folio, request.authorityId);
    }
    // H3: una denuncia improcedente (spam incluido) deja de contar en el índice de corroboración.
    const withdrawal = request.action === 'close' ? withdrawalReasonFor(request.reason) : null;
    if (withdrawal !== null) requestIndexWithdrawal(ctx, folio, withdrawal);
    if (request.action === 'close' && request.sanction !== undefined) {
      verifyClosureSanction(ctx, folio, request.sanction, toMexicoCentralDay(ctx.deps.now()));
    }
    return state;
  } catch (error) {
    // Fuera de la transacción, para que el registro no se revierta con la acción rechazada.
    if (error instanceof ApiFailure && error.code === 'forbidden') {
      logSecurityEvent(ctx, 'function_denied', account.accountId, folio);
    }
    throw error;
  }
}

function applyInTransaction(
  ctx: AppContext,
  account: AuthorityAccount,
  folio: string,
  request: ProcedureActionRequest,
): ProcedureState {
  const complaint = ctx.complaints.find(folio);
  // Seguridad: una denuncia de otra autoridad responde igual que una inexistente (SEC-17).
  if (complaint === null || !isCompetent(ctx, account, complaint)) {
    throw new ApiFailure('not_found');
  }
  const planned = plan(ctx, account, complaint, request);
  const now = ctx.deps.now();
  const legalOn = toMexicoCentralDay(now);
  const agreementDigest =
    request.action === 'close' ? sha256Hex(request.agreement.normalize('NFC')) : undefined;
  const qualification =
    request.action === 'advance_stage' && request.qualification !== undefined
      ? {
          input: request.qualification,
          digest: sha256Hex(request.qualification.agreement.normalize('NFC')),
        }
      : null;
  const { at: on } = ctx.ledger.record({
    type: 'complaint.status_changed',
    folio,
    at: toDayDate(now),
    actorRole: 'authority',
    // Seguridad: los datos son privados del nodo (solo su digesto es público); el seudónimo de
    // la cuenta permite atribuir cada acción (no repudio) sin publicar quién es.
    payload: {
      folio,
      status: planned.status,
      changeId: toHex(randomBytes(16)),
      action: planned.action,
      managementState: planned.managementState,
      authorityId: planned.assignedAuthorityId,
      actor: account.accountId,
      ...(planned.legalStage === null ? {} : { legalStage: planned.legalStage }),
      ...(planned.closureReason === null ? {} : { closureReason: planned.closureReason }),
      ...(agreementDigest === undefined ? {} : { agreementDigest }),
      ...(qualification === null
        ? {}
        : {
            qualification: qualification.input.severity,
            qualificationDigest: qualification.digest,
          }),
    },
  });
  ctx.complaints.updateProcedure(folio, {
    status: planned.status,
    assignedAuthorityId: planned.assignedAuthorityId,
    managementState: planned.managementState,
    legalStage: planned.legalStage,
    closureReason: planned.closureReason,
  });
  ctx.procedure.insertStep(folio, {
    action: planned.action,
    on,
    legalOn,
    managementState: planned.managementState,
    legalStage: planned.legalStage,
    closureReason: planned.closureReason,
    authorityId: planned.assignedAuthorityId,
    actorId: account.accountId,
    note: planned.note,
  });
  // Momento del acto (H6): solo un mensaje de la autoridad posterior cuenta como su notificación.
  const authoritySequence = ctx.messages.nextSequence(folio, 'authority');
  if (qualification !== null)
    ctx.qualifications.insertActInstant(folio, 'qualification', authoritySequence);
  if (request.action === 'close')
    ctx.qualifications.insertActInstant(folio, 'closure', authoritySequence);
  if (qualification !== null) {
    recordQualification(ctx, complaint, qualification.input, {
      on,
      legalOn,
      actorId: account.accountId,
    });
  }
  if (request.action === 'close' && agreementDigest !== undefined) {
    ctx.procedure.insertClosure({
      folio,
      authorityId: assignedAuthorityOf(ctx, complaint),
      on,
      legalOn,
      reason: request.reason,
      legalBasis: request.legalBasis,
      agreement: request.agreement,
      agreementDigest,
      actorId: account.accountId,
    });
  }
  if (planned.status !== complaint.status) ctx.statusHistory.insert(folio, planned.status, on);
  return {
    folio,
    status: planned.status,
    managementState: planned.managementState,
    ...(planned.legalStage === null ? {} : { legalStage: planned.legalStage }),
    ...(planned.closureReason === null ? {} : { closureReason: planned.closureReason }),
    assignedAuthorityId: planned.assignedAuthorityId,
  };
}
