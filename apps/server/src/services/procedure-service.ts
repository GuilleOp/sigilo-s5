// Acciones del trámite con el catálogo del Estándar S5: turnar, aceptar, reasignar, devolver al
// buzón general, avanzar de etapa legal (con las transiciones de `ADMINISTRATIVE_TRANSITIONS` y
// `CRIMINAL_TRANSITIONS`), cerrar con fundamento y motivo legal, y registrar los actos del ciclo
// de vida legal (abstención, recursos, medidas cautelares, vista al Ministerio Público, recursos
// federales, inscripción de la sanción y desistimiento). Cada acción respeta el flujo de gestión,
// la función de la cuenta, la separación de funciones (LGRA, art. 115) y la autoridad competente,
// y queda en la bitácora.
import type {
  AdministrativeStage,
  ClosureReason,
  ComplaintStatus,
  CourtRecord,
  CriminalStage,
  FederalFunding,
  LegalClosureReason,
  LegalStage,
  ManagementState,
  ProcedureAction,
  ProcedureActionRequest,
  ProcedureState,
  QualificationSeverity,
  ReferralDestination,
} from '@sigilo/contracts';
import {
  COURT_ACCESS_STAGES,
  CRIMINAL_REFERRAL_BASES,
  CriminalStageSchema,
  findCriminalTransition,
  findLegalClosureReason,
  findRemedyKind,
  findTransition,
  formatLegalReference,
  functionInChargeAt,
  hasAnyFunction,
  hasFunction,
  isCriminalStage,
  isLegalClosureAllowedAt,
  isManagementTransition,
  MAX_REASSIGNMENTS,
  MIN_ROUTING_NOTE_LENGTH,
  offenseSeverity,
  PRECAUTIONARY_RULE,
} from '@sigilo/contracts';
import type { ProcedureFunction } from '@sigilo/contracts';
import { randomBytes, sha256Hex, toDayDate, toHex, toMexicoCentralDay } from '@sigilo/core';
import type { AppContext } from '../context.ts';
import type { ComplaintRecord } from '../db/complaints-repository.ts';
import { withTransaction } from '../db/database.ts';
import type { StepDetails } from '../db/procedure-repository.ts';
import { ApiFailure } from '../http/errors.ts';
import { logSecurityEvent } from '../security/authority-auth.ts';
import { requestIndexWithdrawal, withdrawalReasonFor } from './corroboration-service.ts';
import {
  currentInconformity,
  isBlockedByRemedy,
  lifecycleStateOf,
  pendingRemedies,
} from './lifecycle-state.ts';
import type { ActingFunction, LifecycleState } from './lifecycle-state.ts';
import {
  ABSTENTION_NOTICE,
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
import { isProsecutionAuthority } from './prosecution.ts';

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

/** Hechos del ciclo de vida de la denuncia (recursos, abstención, medidas…). */
export function lifecycleOf(ctx: AppContext, complaint: ComplaintRecord): LifecycleState {
  return lifecycleStateOf(
    ctx.procedure.listSteps(complaint.folio),
    complaint.legalStage,
    complaint.criminalStage,
  );
}

/** Recursos que resuelve el Tribunal: la cuenta del Tribunal ve la denuncia mientras estén pendientes. */
function hasPendingCourtRemedy(state: LifecycleState): boolean {
  return pendingRemedies(state).some(
    (remedy) => findRemedyKind(remedy.kind)?.resolvedBy === 'court',
  );
}

/**
 * Indica si una cuenta del Tribunal (`court`) puede ver la denuncia y actuar sobre ella: solo en
 * las etapas del Tribunal (incluido el expediente enviado que todavía no recibe) o mientras tenga
 * pendiente un recurso que él resuelve (inconformidad, apelación, revisión). La denuncia sigue en
 * la autoridad que la tiene; el Tribunal no ve su buzón ni pide aperturas.
 */
export function isCourtCompetent(
  ctx: AppContext,
  account: AuthorityAccount,
  complaint: ComplaintRecord,
): boolean {
  if (!hasFunction(account, 'court') || complaint.managementState === 'closed') return false;
  if (complaint.legalStage !== null && COURT_ACCESS_STAGES.has(complaint.legalStage)) return true;
  return hasPendingCourtRemedy(lifecycleOf(ctx, complaint));
}

/** Indica si el nodo tiene cuentas del Tribunal; si no, la substanciación registra sus actos. */
export function hasCourtAccounts(ctx: AppContext): boolean {
  return ctx.authorities.hasAccountWith('court');
}

/** Reasignaciones que ya tuvo la denuncia (pasos `reassigned` de su línea de tiempo). */
export function reassignmentsOf(ctx: AppContext, folio: string): number {
  return ctx.procedure.listSteps(folio).filter((step) => step.action === 'reassigned').length;
}

const CLASSIFIED_STAGES: ReadonlySet<LegalStage> = new Set<LegalStage>([
  'qualification',
  'report_filed',
  'report_prevented',
  'abstention',
]);

/**
 * Estatus de la API v1 que corresponde a una etapa administrativa (o, si no hay, a la penal):
 * investigación; calificada hasta que se admite el informe; en procedimiento ante la
 * substanciadora; en el Tribunal; en procedimiento otra vez al quedar firme.
 */
export function statusForStage(
  stage: LegalStage | null,
  criminalStage: CriminalStage | null = null,
): ComplaintStatus {
  if (stage === null || isCriminalStage(stage)) {
    return criminalStage !== null || isCriminalStage(stage) ? 'investigating' : 'routed';
  }
  if (stage === 'investigation') return 'investigating';
  if (CLASSIFIED_STAGES.has(stage)) return 'classified';
  if (COURT_ACCESS_STAGES.has(stage)) return 'in_court';
  return 'in_procedure';
}

/**
 * Estatus de la API v1 de un cierre: el del motivo legal si lo hay; si no, el archivo es
 * `archived` y los demás `resolved`.
 */
function statusForClosure(
  reason: ClosureReason,
  legalOutcome: LegalClosureReason | null,
): ComplaintStatus {
  if (legalOutcome !== null) return findLegalClosureReason(legalOutcome)?.status ?? 'resolved';
  return reason === 'insufficient_information' ? 'archived' : 'resolved';
}

/** Resultado calculado de una acción antes de guardarse. */
interface PlannedStep {
  action: ProcedureAction;
  managementState: ManagementState;
  status: ComplaintStatus;
  assignedAuthorityId: string;
  legalStage: LegalStage | null;
  criminalStage: CriminalStage | null;
  fundingSource: FederalFunding | null;
  closureReason: ClosureReason | null;
  note: string | null;
  details: StepDetails;
  legalOutcome: LegalClosureReason | null;
  destination: ReferralDestination | null;
  /** Hay un recurso pendiente después de la acción. */
  isUnderRemedy: boolean;
}

/** Función que ejerce la cuenta y si lo hace como registro de actuación del Tribunal. */
interface Actor {
  fn: ActingFunction;
  recordedForCourt: boolean;
}

/** Calificación vigente para elegir la rama: la del acuerdo o, sin acuerdo, la de la conducta. */
function trackSeverity(
  ctx: AppContext,
  complaint: ComplaintRecord,
  state: LifecycleState,
): QualificationSeverity {
  if (state.returnedByCourt) return 'non_serious';
  const qualification = ctx.qualifications.lastQualification(complaint.folio);
  if (qualification !== null) return qualification.severity;
  return offenseSeverity(complaint.facts.offenseCode) === 'non_serious' ? 'non_serious' : 'serious';
}

/**
 * Comprueba la acción contra el flujo de gestión, las transiciones del estándar, la función de la
 * cuenta y la separación de funciones, y calcula el estado resultante. Lanza `forbidden` si la
 * función no puede, `conflict` si el flujo o la etapa no lo admiten y `bad_request` si faltan datos
 * que la transición exige.
 * Seguridad (separación de funciones): recepción y turnado (`intake`) turna, acepta, reasigna y
 * devuelve; investigación investiga, califica, presenta el IPRA, pide medidas cautelares, da vista
 * al Ministerio Público y registra la inconformidad firmada; substanciación previene, se abstiene,
 * admite, emplaza, celebra la audiencia inicial y, en no graves, resuelve; el Tribunal solo actúa
 * en sus etapas y en los recursos que resuelve; si el estado no dio cuentas al Tribunal, la
 * substanciación registra sus actuaciones con número de expediente. Una misma cuenta nunca
 * investiga y substancia (o juzga) la misma denuncia (LGRA art. 115).
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
  const state = lifecycleOf(ctx, complaint);
  const isPendingRemedy = pendingRemedies(state).length > 0;
  const base = {
    assignedAuthorityId: assigned,
    legalStage: complaint.legalStage,
    criminalStage: complaint.criminalStage,
    fundingSource: complaint.fundingSource,
    closureReason: null,
    note: null,
    legalOutcome: null,
    destination: null,
    isUnderRemedy: isPendingRemedy,
  };
  const keepStatus = () =>
    isPendingRemedy
      ? 'under_remedy'
      : statusForStage(complaint.legalStage, complaint.criminalStage);
  const requireIntake = () => {
    if (!hasFunction(account, 'intake')) throw new ApiFailure('forbidden');
  };
  // Destino de un turno o reasignación: una autoridad del nodo que pueda aceptarla (con cuenta
  // `intake`); nunca el buzón general, el Tribunal ni una autoridad sin recepción.
  const requireTarget = (authorityId: string) => {
    if (ctx.authorities.authority(authorityId)?.canReceive !== true || authorityId === inbox) {
      throw new ApiFailure('bad_request');
    }
  };
  const isProsecution = isProsecutionAuthority(ctx, account.authorityId);
  const requireTransition = (to: ManagementState) => {
    if (!isManagementTransition(current, to)) throw new ApiFailure('conflict');
  };
  const requireAccepted = () => {
    if (current !== 'accepted') throw new ApiFailure('conflict');
  };
  const courtRecordOf = (): CourtRecord | undefined =>
    'courtRecord' in request ? request.courtRecord : undefined;
  /**
   * Función con que actúa la cuenta para un acto de `fn`. Si el acto es del Tribunal y el estado no
   * le dio cuentas, la substanciación lo registra con número de expediente y fundamento.
   */
  const actAs = (fn: ProcedureFunction | 'intake'): Actor => {
    const record = courtRecordOf();
    if (fn === 'court' && !hasFunction(account, 'court')) {
      const canRecord = !hasCourtAccounts(ctx) && hasFunction(account, 'substantiation');
      if (!canRecord || !isCompetent(ctx, account, complaint)) throw new ApiFailure('forbidden');
      if (record === undefined) throw new ApiFailure('bad_request');
      return separated({ fn: 'substantiation', recordedForCourt: true });
    }
    if (!hasFunction(account, fn)) throw new ApiFailure('forbidden');
    // El registro de actuación del Tribunal solo lo usa la substanciación sin cuentas del Tribunal.
    if (record !== undefined) throw new ApiFailure('bad_request');
    return separated({ fn, recordedForCourt: false });
  };
  /** Primera de `allowed` que tiene la cuenta, con las reglas de `actAs`. */
  const actAsAny = (allowed: readonly (ProcedureFunction | 'intake')[]): Actor => {
    const own = allowed.find((fn) => fn !== 'court' && hasFunction(account, fn));
    if (own !== undefined) return actAs(own);
    if (allowed.includes('court')) return actAs('court');
    throw new ApiFailure('forbidden');
  };
  /** LGRA, art. 115: quien investigó esta denuncia no la substancia ni la juzga, y al revés. */
  const separated = (actor: Actor): Actor => {
    const used = state.functionsByActor.get(account.accountId);
    const isInvestigation = actor.fn === 'investigation';
    const isJudging = actor.fn === 'substantiation' || actor.fn === 'court';
    const crosses =
      used !== undefined &&
      ((isInvestigation && (used.has('substantiation') || used.has('court'))) ||
        (isJudging && used.has('investigation')));
    if (crosses) throw new ApiFailure('forbidden');
    return actor;
  };
  const detailsOf = (actor: Actor, extra: StepDetails = {}): StepDetails => ({
    fn: actor.fn,
    ...(actor.recordedForCourt
      ? {
          recordedForCourt: true as const,
          courtFileNumber: courtRecordOf()?.fileNumber,
          legalBasis: courtRecordOf()?.legalBasis,
        }
      : {}),
    ...extra,
  });
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
      // El motivo del turno es obligatorio (como en el S5): el esquema ya lo exige; esta comprobación
      // cubre a quien llame a `applyProcedureAction` sin pasar por la ruta.
      if (request.note.trim().length < MIN_ROUTING_NOTE_LENGTH) {
        throw new ApiFailure('bad_request');
      }
      return {
        ...base,
        action: 'routed',
        managementState: 'routed',
        status: 'routed',
        assignedAuthorityId: request.authorityId,
        note: request.note.trim(),
        details: { fn: 'intake' },
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
        status: statusForStage(complaint.legalStage, complaint.criminalStage),
        note: request.note ?? null,
        details: { fn: hasFunction(account, 'intake') ? 'intake' : 'investigation' },
      };
    }
    case 'reassign':
      requireIntake();
      requireTransition('reassigned');
      requireTarget(request.authorityId);
      if (request.authorityId === assigned) throw new ApiFailure('conflict');
      // Tope de reasignaciones del S5: después de la tercera, la denuncia vuelve al buzón general
      // (o la revisa supervisión) en lugar de pasar de mano en mano sin que nadie la acepte.
      if (reassignmentsOf(ctx, complaint.folio) >= MAX_REASSIGNMENTS) {
        throw new ApiFailure('reassignment_limit');
      }
      return {
        ...base,
        action: 'reassigned',
        managementState: 'reassigned',
        status: 'routed',
        assignedAuthorityId: request.authorityId,
        note: request.note,
        details: { fn: 'intake' },
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
        details: { fn: 'intake' },
      };
    case 'advance_stage':
      return isCriminalStage(request.stage)
        ? planCriminalAdvance(request.stage)
        : planAdministrativeAdvance(request.stage as AdministrativeStage);
    case 'close':
      return planClose(request);
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
        details: {},
      };
    }
    case 'order_reclassification': {
      // LGRA, art. 209 fr. II: el Tribunal ordena reclasificar a otra falta grave; la investigadora
      // tiene 3 días hábiles. La etapa no cambia.
      requireAccepted();
      if (complaint.legalStage !== 'court_received') throw new ApiFailure('conflict');
      const actor = actAs('court');
      return {
        ...base,
        action: 'reclassification_ordered',
        managementState: current,
        status: keepStatus(),
        note: request.note ?? null,
        details: detailsOf(actor, {
          legalBasis: actor.recordedForCourt ? courtRecordOf()?.legalBasis : request.legalBasis,
        }),
      };
    }
    case 'request_precautionary': {
      requireAccepted();
      const stages: readonly string[] = PRECAUTIONARY_RULE.stages;
      if (complaint.legalStage === null || !stages.includes(complaint.legalStage)) {
        throw new ApiFailure('conflict');
      }
      if (state.precautionary !== null && state.precautionary.decidedOn === null) {
        throw new ApiFailure('conflict');
      }
      const actor = actAs('investigation');
      return {
        ...base,
        action: 'precautionary_requested',
        managementState: current,
        status: keepStatus(),
        details: detailsOf(actor, { measure: request.measure, legalBasis: request.legalBasis }),
      };
    }
    case 'decide_precautionary': {
      requireAccepted();
      if (state.precautionary === null || state.precautionary.decidedOn !== null) {
        throw new ApiFailure('conflict');
      }
      // Resuelve la substanciadora o, en las etapas del Tribunal, el Tribunal (LGRA, art. 123).
      const isCourt =
        complaint.legalStage !== null && COURT_ACCESS_STAGES.has(complaint.legalStage);
      const actor = actAs(isCourt ? 'court' : 'substantiation');
      return {
        ...base,
        action: 'precautionary_decided',
        managementState: current,
        status: keepStatus(),
        details: detailsOf(actor, {
          precautionaryOutcome: request.outcome,
          legalBasis: actor.recordedForCourt ? courtRecordOf()?.legalBasis : request.legalBasis,
        }),
      };
    }
    case 'file_remedy':
      return planFileRemedy(request);
    case 'resolve_remedy':
      return planResolveRemedy(request);
    case 'refer_to_prosecutor': {
      // Vista al Ministerio Público: la vía penal corre aparte y en paralelo (CPEUM art. 109; LGRA
      // art. 14). La da quien investiga (LGRA art. 10 fr. III; art. 98 para las entidades de
      // fiscalización; CNPP art. 222 para toda persona servidora pública).
      // La fiscalía es el Ministerio Público: no se da vista a sí misma.
      if (isProsecution) throw new ApiFailure('forbidden');
      requireAccepted();
      if (complaint.criminalStage !== null) throw new ApiFailure('conflict');
      const actor = actAsAny(['investigation', 'substantiation']);
      const basis = CRIMINAL_REFERRAL_BASES.find((item) => item.key === request.basis);
      return {
        ...base,
        action: 'criminal_referral_filed',
        managementState: current,
        criminalStage: 'criminal_complaint_filed',
        status: keepStatus(),
        note:
          request.note ??
          `Se registró la vista al Ministerio Público (${request.prosecutor}) por hechos que pueden ser delito. La vía penal corre aparte y no detiene el procedimiento administrativo. Remitir la denuncia y sus pruebas a la fiscalía es un paso aparte, por oficio.`,
        details: detailsOf(actor, {
          criminalStage: 'criminal_complaint_filed',
          referralBasis: request.basis,
          prosecutor: request.prosecutor,
          legalBasis: basis?.legalBasis.map(formatLegalReference).join('; '),
        }),
      };
    }
    case 'flag_federal_funds': {
      if (current === 'closed') throw new ApiFailure('conflict');
      if (complaint.fundingSource === request.funding) throw new ApiFailure('conflict');
      const actor = actAsAny(['intake', 'investigation']);
      return {
        ...base,
        action: 'federal_funds_flagged',
        managementState: current,
        status: complaint.status,
        closureReason: complaint.closureReason,
        fundingSource: request.funding,
        note: request.note ?? null,
        details: detailsOf(actor, { funding: request.funding }),
      };
    }
    case 'send_federal_notice': {
      if (current === 'closed' || complaint.fundingSource === null) {
        throw new ApiFailure('conflict');
      }
      const actor = actAsAny(['intake', 'investigation']);
      return {
        ...base,
        action: 'federal_notice_sent',
        managementState: current,
        status: complaint.status,
        closureReason: complaint.closureReason,
        details: detailsOf(actor, {
          recipients: request.recipients,
          legalBasis: request.legalBasis,
        }),
      };
    }
    case 'register_sanction': {
      // Solo se registra el acto de inscripción en el S3 (LGRA art. 27); no hay integración.
      requireAccepted();
      if (complaint.legalStage !== 'executed' || state.sanctionRegistered !== null) {
        throw new ApiFailure('conflict');
      }
      const actor = actAs('substantiation');
      return {
        ...base,
        action: 'sanction_registered',
        managementState: current,
        status: keepStatus(),
        details: detailsOf(actor, {
          registryReference: request.registryReference,
          legalBasis: request.legalBasis,
        }),
      };
    }
    case 'record_withdrawal': {
      // Desistimiento: queda documentado y no cierra; la investigación también es de oficio
      // (LGRA, arts. 91 y 94).
      if (current === 'closed') throw new ApiFailure('conflict');
      const actor = actAsAny(['intake', 'investigation', 'substantiation']);
      return {
        ...base,
        action: 'withdrawal_received',
        managementState: current,
        status: complaint.status,
        closureReason: complaint.closureReason,
        note: request.note,
        details: detailsOf(actor),
      };
    }
  }

  function planCriminalAdvance(stage: LegalStage): PlannedStep {
    requireAccepted();
    const parsed = CriminalStageSchema.safeParse(stage);
    if (!parsed.success) throw new ApiFailure('bad_request');
    const advance = request.action === 'advance_stage' ? request : null;
    if (advance?.qualification !== undefined) throw new ApiFailure('bad_request');
    if (findCriminalTransition(complaint.criminalStage, parsed.data) === undefined) {
      throw new ApiFailure('conflict');
    }
    // La vía penal la registra la fiscalía (Ministerio Público, CNPP art. 127); la investigadora y la
    // substanciadora solo dan vista (`refer_to_prosecutor`).
    const actor = actAs('investigation');
    if (!isProsecution) throw new ApiFailure('forbidden');
    return {
      ...base,
      action: 'stage_advanced',
      managementState: 'accepted',
      criminalStage: parsed.data,
      status: isPendingRemedy ? 'under_remedy' : statusForStage(complaint.legalStage, parsed.data),
      note: advance?.note ?? null,
      details: detailsOf(actor, { criminalStage: parsed.data }),
    };
  }

  function planAdministrativeAdvance(stage: AdministrativeStage): PlannedStep {
    if (request.action !== 'advance_stage') throw new ApiFailure('bad_request');
    // La fiscalía no lleva la vía administrativa (LGRA, arts. 3 fr. II y 91): solo la penal.
    if (isProsecution) throw new ApiFailure('forbidden');
    requireAccepted();
    const from =
      complaint.legalStage !== null && !isCriminalStage(complaint.legalStage)
        ? (complaint.legalStage as AdministrativeStage)
        : null;
    const transition = findTransition(from, stage);
    if (transition === undefined) throw new ApiFailure('conflict');
    // La calificación solo acompaña el paso a la etapa de calificación (LGRA, art. 100).
    if (request.qualification !== undefined && stage !== 'qualification') {
      throw new ApiFailure('bad_request');
    }
    const requires = transition.requires ?? [];
    if (
      requires.includes('legalBasis') &&
      request.legalBasis === undefined &&
      request.courtRecord === undefined
    ) {
      throw new ApiFailure('bad_request');
    }
    if (requires.includes('agreement') && request.agreement === undefined) {
      throw new ApiFailure('bad_request');
    }
    // Rama después de la audiencia inicial: no grave con la substanciadora, grave al Tribunal.
    if (
      transition.severities !== undefined &&
      !transition.severities.includes(trackSeverity(ctx, complaint, state))
    ) {
      throw new ApiFailure('conflict');
    }
    // Un recurso pendiente detiene el inicio del procedimiento (inconformidad, LGRA art. 102) o la
    // firmeza (revocación, apelación y revisión).
    if (isBlockedByRemedy(state, stage)) throw new ApiFailure('conflict');
    const actor = actAs(transition.fn);
    const isNonSerious = request.qualification?.severity === 'non_serious';
    const defaultNote =
      transition.action === 'abstention_declared'
        ? ABSTENTION_NOTICE
        : isNonSerious
          ? NON_SERIOUS_NOTICE
          : null;
    return {
      ...base,
      action: transition.action,
      managementState: 'accepted',
      legalStage: stage,
      status: isPendingRemedy ? 'under_remedy' : statusForStage(stage, complaint.criminalStage),
      // LGRA, art. 102: la persona identificable ve de inmediato cómo puede inconformarse.
      note: request.note ?? defaultNote,
      details: detailsOf(actor, {
        ...(request.legalBasis === undefined || actor.recordedForCourt
          ? {}
          : { legalBasis: request.legalBasis }),
        ...(request.agreement === undefined ? {} : { agreement: request.agreement }),
        ...(transition.action === 'abstention_declared'
          ? { authoritySequence: ctx.messages.nextSequence(complaint.folio, 'authority') }
          : {}),
      }),
    };
  }

  function planClose(close: Extract<ProcedureActionRequest, { action: 'close' }>): PlannedStep {
    const isInboxClosure = current === 'received_in_inbox' || current === 'returned_to_inbox';
    // Fuera del buzón cierra quien lleva la etapa actual: investigación; desde que se presentó el
    // IPRA, substanciación; en las etapas del Tribunal, el Tribunal.
    const stage =
      complaint.legalStage !== null && !isCriminalStage(complaint.legalStage)
        ? (complaint.legalStage as AdministrativeStage)
        : null;
    const inCharge: ProcedureFunction | 'intake' = isInboxClosure
      ? 'intake'
      : stage === null
        ? 'investigation'
        : functionInChargeAt(stage);
    const actor = actAs(inCharge);
    requireTransition('closed');
    const legalOutcome = close.legalOutcome ?? null;
    if (legalOutcome !== null) {
      const option = findLegalClosureReason(legalOutcome);
      if (option === undefined || !option.s5Reasons.includes(close.reason)) {
        throw new ApiFailure('bad_request');
      }
      if (option.requiresDestination === true && close.destination === undefined) {
        throw new ApiFailure('bad_request');
      }
      if (!isLegalClosureAllowedAt(option, stage)) throw new ApiFailure('conflict');
      // La abstención no se cierra mientras su inconformidad está pendiente (LGRA, art. 102).
      const inconformity = currentInconformity(state);
      if (
        legalOutcome === 'abstention' &&
        inconformity !== null &&
        inconformity.status !== 'resolved'
      ) {
        throw new ApiFailure('conflict');
      }
    } else if (close.destination !== undefined) {
      throw new ApiFailure('bad_request');
    }
    return {
      ...base,
      action: 'closed',
      managementState: 'closed',
      status: statusForClosure(close.reason, legalOutcome),
      closureReason: close.reason,
      legalOutcome,
      destination: close.destination ?? null,
      isUnderRemedy: false,
      // Aviso del sistema en el seguimiento al archivar (H6); el aviso legal llega por el buzón.
      note: close.reason === 'insufficient_information' ? ARCHIVE_NOTICE : null,
      details: detailsOf(actor, {
        ...(legalOutcome === null ? {} : { legalOutcome }),
        ...(close.destination === undefined ? {} : { destination: close.destination }),
      }),
    };
  }

  function planFileRemedy(
    file: Extract<ProcedureActionRequest, { action: 'file_remedy' }>,
  ): PlannedStep {
    requireAccepted();
    const kind = findRemedyKind(file.kind);
    const stage = complaint.legalStage as AdministrativeStage | null;
    if (kind === undefined || stage === null || !kind.stages.includes(stage)) {
      throw new ApiFailure('conflict');
    }
    if (!kind.filedBy.includes(file.filedBy)) throw new ApiFailure('bad_request');
    // La inconformidad solo procede contra la calificación de no grave o la abstención (art. 102).
    if (file.kind === 'inconformity' && stage !== 'abstention') {
      const qualification = ctx.qualifications.lastQualification(complaint.folio);
      if (qualification?.severity !== 'non_serious') throw new ApiFailure('conflict');
      const previous = currentInconformity(state);
      if (previous !== null) throw new ApiFailure('conflict');
    }
    if (
      file.kind === 'inconformity' &&
      stage === 'abstention' &&
      currentInconformity(state) !== null
    ) {
      throw new ApiFailure('conflict');
    }
    if (pendingRemedies(state).some((remedy) => remedy.kind === file.kind)) {
      throw new ApiFailure('conflict');
    }
    const recorders =
      kind.resolvedBy === 'in_charge' ? [functionInChargeAt(stage)] : kind.recordedBy;
    const actor = actAsAny(recorders);
    return {
      ...base,
      action: 'remedy_filed',
      managementState: current,
      status: 'under_remedy',
      isUnderRemedy: true,
      note:
        file.note ??
        (file.kind === 'inconformity'
          ? 'La autoridad investigadora recibió el escrito de inconformidad con firma autógrafa y lo envía a la Sala (LGRA, arts. 104 y 109). Desde hoy corre el plazo de la Sala para resolver.'
          : `Se presentó el recurso de ${kind.name.toLowerCase()}. ${kind.effect}`),
      details: detailsOf(actor, {
        remedyId: toHex(randomBytes(16)),
        remedyKind: file.kind,
        remedyFiledBy: file.filedBy,
        remedyStage: stage,
        ...(file.legalBasis === undefined || actor.recordedForCourt
          ? {}
          : { legalBasis: file.legalBasis }),
      }),
    };
  }

  function planResolveRemedy(
    resolve: Extract<ProcedureActionRequest, { action: 'resolve_remedy' }>,
  ): PlannedStep {
    requireAccepted();
    const kind = findRemedyKind(resolve.kind);
    const remedy = pendingRemedies(state)
      .filter((item) => item.kind === resolve.kind)
      .at(-1);
    if (kind === undefined || remedy === undefined) throw new ApiFailure('conflict');
    if (resolve.outcome === 'admitted' && remedy.status === 'admitted') {
      throw new ApiFailure('conflict');
    }
    const resolver =
      kind.resolvedBy === 'in_charge'
        ? functionInChargeAt((remedy.stage ?? 'report_admitted') as AdministrativeStage)
        : kind.resolvedBy;
    const actor = actAs(resolver);
    const isFinal = resolve.outcome !== 'admitted';
    const stillPending = pendingRemedies(state).filter((item) => item.remedyId !== remedy.remedyId);
    const isUnderRemedy = !isFinal || stillPending.length > 0;
    // Efecto de la inconformidad revocada (LGRA, arts. 108 y 110): contra la abstención, la
    // substanciadora vuelve a pronunciarse sobre el informe; contra la calificación de no grave,
    // la investigadora vuelve a calificar.
    let legalStage = complaint.legalStage;
    if (resolve.kind === 'inconformity' && resolve.outcome === 'revoked') {
      legalStage = remedy.stage === 'abstention' ? 'report_filed' : 'investigation';
    }
    const outcomeNote: Record<string, string> = {
      admitted: `Se admitió el recurso de ${kind.name.toLowerCase()}; sigue en trámite.`,
      inadmissible: `El recurso de ${kind.name.toLowerCase()} no se admitió; el acto recurrido sigue igual.`,
      confirmed: `Se resolvió el recurso de ${kind.name.toLowerCase()}: se confirmó el acto.`,
      revoked: `Se resolvió el recurso de ${kind.name.toLowerCase()}: se revocó el acto. ${kind.onRevoked}`,
      modified: `Se resolvió el recurso de ${kind.name.toLowerCase()}: se modificó el acto.`,
    };
    return {
      ...base,
      action: 'remedy_resolved',
      managementState: current,
      legalStage,
      status: isUnderRemedy ? 'under_remedy' : statusForStage(legalStage, complaint.criminalStage),
      isUnderRemedy,
      note: resolve.note ?? outcomeNote[resolve.outcome] ?? null,
      details: detailsOf(actor, {
        remedyId: remedy.remedyId,
        remedyKind: resolve.kind,
        remedyOutcome: resolve.outcome,
        ...(actor.recordedForCourt ? {} : { legalBasis: resolve.legalBasis }),
      }),
    };
  }
}

/**
 * Aplica una acción del trámite: guarda el estado, el paso de la línea de tiempo (con su nota
 * pública y los datos de su acto) y, al cerrar, el acuerdo en versión pública con su motivo legal;
 * registra `complaint.status_changed` con el seudónimo de la cuenta. Todo en una transacción que
 * vuelve a leer la denuncia.
 * Lanza `not_found` si el folio no existe o la cuenta no es de la autoridad competente (ni el
 * Tribunal en sus etapas), sin distinguirlos; `forbidden`, `conflict` o `bad_request` según `plan`.
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
  // Seguridad: una denuncia de otra autoridad responde igual que una inexistente (SEC-17). El
  // Tribunal solo la alcanza en sus etapas o con un recurso que él resuelve.
  const isReachable =
    complaint !== null &&
    (isCompetent(ctx, account, complaint) || isCourtCompetent(ctx, account, complaint));
  if (!isReachable) throw new ApiFailure('not_found');
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
  const details = planned.details;
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
      ...(planned.criminalStage === null ? {} : { criminalStage: planned.criminalStage }),
      ...(planned.closureReason === null ? {} : { closureReason: planned.closureReason }),
      ...(planned.legalOutcome === null ? {} : { legalOutcome: planned.legalOutcome }),
      ...(agreementDigest === undefined ? {} : { agreementDigest }),
      ...(details.remedyKind === undefined ? {} : { remedyKind: details.remedyKind }),
      ...(details.remedyOutcome === undefined ? {} : { remedyOutcome: details.remedyOutcome }),
      ...(details.recordedForCourt === true ? { recordedForCourt: true } : {}),
      ...(details.agreement === undefined
        ? {}
        : { actAgreementDigest: sha256Hex(details.agreement.normalize('NFC')) }),
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
    criminalStage: planned.criminalStage,
    fundingSource: planned.fundingSource,
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
    details,
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
      legalOutcome: planned.legalOutcome,
      destination: planned.destination,
    });
  }
  if (planned.status !== complaint.status) ctx.statusHistory.insert(folio, planned.status, on);
  return {
    folio,
    status: planned.status,
    managementState: planned.managementState,
    ...(planned.legalStage === null ? {} : { legalStage: planned.legalStage }),
    ...(planned.criminalStage === null ? {} : { criminalStage: planned.criminalStage }),
    ...(planned.closureReason === null ? {} : { closureReason: planned.closureReason }),
    assignedAuthorityId: planned.assignedAuthorityId,
  };
}
