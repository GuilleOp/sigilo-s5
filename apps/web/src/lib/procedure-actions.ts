// Qué puede hacer cada cuenta del panel en el estado actual del trámite, con el mismo catálogo del
// estándar que valida el nodo: transiciones entre etapas (con sus dos ramas), recursos que puede
// registrar o resolver, motivos legales de cierre, medidas cautelares, vista al Ministerio Público
// y el registro de actuaciones del Tribunal cuando el estado no le dio cuentas. El nodo vuelve a
// validar todo; aquí solo se ofrece lo que tiene sentido.
import {
  COURT_ACCESS_STAGES,
  CRIMINAL_STAGES,
  CRIMINAL_TRANSITIONS,
  findDeadlineRule,
  findLegalStage,
  formatLegalReference,
  functionInChargeAt,
  hasFunction,
  isClosureAllowedAt,
  isCriminalStage,
  isLegalClosureAllowedAt,
  LEGAL_CLOSURE_REASONS,
  PRECAUTIONARY_RULE,
  REMEDY_KINDS,
  remedyKindForFilingDeadline,
  STAGE_WAIT_TEXTS,
  transitionsFrom,
} from '@sigilo/contracts';
import type {
  AdministrativeStage,
  AuthorityAccountView,
  ComplaintDetail,
  DeadlineView,
  LegalClosureReasonOption,
  LegalStage,
  ProcedureFunction,
  ProcedureView,
  RemedyKind,
  RemedyKindOption,
  StageTransition,
} from '@sigilo/contracts';

/** Cómo actúa la cuenta para un acto de una función: con la suya o como registro del Tribunal. */
export type ActingMode = 'own' | 'court_record';

/**
 * Modo en que la cuenta puede hacer un acto de la función `fn`, o `null`. Los actos del Tribunal
 * los hace su cuenta; si el estado no dio cuentas al Tribunal (`courtRecording`), la substanciación
 * los registra con número de expediente.
 */
export function actingMode(
  account: Pick<AuthorityAccountView, 'functions'>,
  fn: ProcedureFunction | 'intake',
  procedure: ProcedureView | undefined,
): ActingMode | null {
  if (hasFunction(account, fn)) return 'own';
  const canRecord =
    fn === 'court' && procedure?.courtRecording === true && hasFunction(account, 'substantiation');
  return canRecord ? 'court_record' : null;
}

/** Etapa administrativa vigente (sin la penal). */
export function administrativeStage(
  procedure: ProcedureView | undefined,
): AdministrativeStage | null {
  const stage = procedure?.legalStage;
  if (stage === undefined || isCriminalStage(stage)) return null;
  return stage as AdministrativeStage;
}

/** Calificación que decide la rama, o `null` si no se sabe (el nodo decide). */
function branchSeverity(procedure: ProcedureView | undefined): 'serious' | 'non_serious' | null {
  if (procedure === undefined) return null;
  if (procedure.steps.some((step) => step.action === 'returned_by_court')) return 'non_serious';
  return procedure.qualification?.severity ?? null;
}

/** Paso que la cuenta puede dar a otra etapa. */
export interface StageOption {
  key: LegalStage;
  label: string;
  requiresLegalBasis: boolean;
  requiresAgreement: boolean;
  mode: ActingMode;
}

/** Recursos que impiden pasar a `to` mientras están pendientes. */
function isBlocked(procedure: ProcedureView | undefined, to: LegalStage): boolean {
  return (procedure?.remedies ?? []).some(
    (remedy) =>
      remedy.status !== 'resolved' &&
      (REMEDY_KINDS.find((kind) => kind.key === remedy.kind)?.blocks.includes(
        to as AdministrativeStage,
      ) ??
        false),
  );
}

/**
 * Plazo de `transition.afterDeadlines` que sigue abierto (el que vence más tarde), o `null`. Usa
 * los plazos que ya calculó el nodo con su reloj y su calendario. Si el recurso de ese plazo se
 * presentó en la etapa y ya se resolvió, no hay que esperar (LGRA, art. 206). El nodo decide.
 */
export function openWaitFor(
  procedure: ProcedureView | undefined,
  transition: Pick<StageTransition, 'afterDeadlines'>,
): DeadlineView | null {
  const keys = transition.afterDeadlines ?? [];
  if (procedure === undefined || keys.length === 0) return null;
  const open = procedure.deadlines.filter(
    (deadline) => keys.includes(deadline.key) && deadline.status !== 'overdue',
  );
  const latest = open.reduce<DeadlineView | null>(
    (best, item) => (best === null || item.dueOn > best.dueOn ? item : best),
    null,
  );
  if (latest === null) return null;
  const kinds = keys.map(remedyKindForFilingDeadline);
  const hasResolvedRemedy = (procedure.remedies ?? []).some(
    (remedy) =>
      kinds.includes(remedy.kind) &&
      remedy.status === 'resolved' &&
      remedy.filedOn >= latest.startsOn,
  );
  return hasResolvedRemedy ? null : latest;
}

/**
 * Plazo con mínimo de `transition.afterMinimumOf` que todavía no se cumple (la audiencia inicial,
 * antes de 10 días hábiles desde el emplazamiento), o `null`. Sin el dato, el nodo decide.
 */
export function earliestWaitFor(
  procedure: ProcedureView | undefined,
  transition: Pick<StageTransition, 'afterMinimumOf'>,
): (DeadlineView & { earliestOn: string }) | null {
  const key = transition.afterMinimumOf;
  if (procedure === undefined || key === undefined) return null;
  const deadline = procedure.deadlines.find((item) => item.key === key);
  if (deadline?.earliestOn === undefined || deadline.isEarliestReached !== false) return null;
  return { ...deadline, earliestOn: deadline.earliestOn };
}

/** Fundamento breve del plazo para el aviso («LGRA, art. 208, fracc. III»). */
function legalBasisOf(key: DeadlineView['key']): string[] {
  return (findDeadlineRule(key)?.legalBasis ?? []).map(formatLegalReference);
}

/** Día siguiente a `day` (AAAA-MM-DD). */
export function nextDay(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Paso que la cuenta dará cuando venza un plazo, con el aviso de hasta cuándo corre. */
export interface StageWait {
  key: AdministrativeStage;
  label: string;
  /** Qué sigue abierto («La sentencia todavía puede apelarse»). */
  text: string;
  /** Último día del plazo que se espera (no lo hay cuando se espera un mínimo). */
  dueOn?: string;
  /** Primer día en que procede el paso. */
  availableOn: string;
  /** El plazo es para presentar un recurso: si se presenta y se resuelve, no hay que esperar. */
  isRemedyWait: boolean;
  /** Fundamento del plazo, para el aviso. */
  legalBasis: readonly string[];
}

/** Pasos que la cuenta podría dar, pero que esperan a que venza un plazo legal. */
export function stageWaits(
  account: Pick<AuthorityAccountView, 'functions'>,
  detail: ComplaintDetail,
): StageWait[] {
  const procedure = detail.procedure;
  if ((detail.summary.managementState ?? 'received_in_inbox') !== 'accepted') return [];
  const severity = branchSeverity(procedure);
  const waits: StageWait[] = [];
  for (const transition of transitionsFrom(administrativeStage(procedure))) {
    if (transition.severities !== undefined && severity !== null) {
      if (!transition.severities.includes(severity)) continue;
    }
    if (isBlocked(procedure, transition.to)) continue;
    if (actingMode(account, transition.fn, procedure) === null) continue;
    const wait = openWaitFor(procedure, transition);
    if (wait !== null) {
      waits.push({
        key: transition.to,
        label: transition.label,
        text: STAGE_WAIT_TEXTS[wait.key] ?? `Todavía corre el plazo «${wait.name}»`,
        dueOn: wait.dueOn,
        availableOn: nextDay(wait.dueOn),
        isRemedyWait: remedyKindForFilingDeadline(wait.key) !== undefined,
        legalBasis: legalBasisOf(wait.key),
      });
      continue;
    }
    const earliest = earliestWaitFor(procedure, transition);
    if (earliest !== null) {
      waits.push({
        key: transition.to,
        label: transition.label,
        text: STAGE_WAIT_TEXTS[earliest.key] ?? `El paso espera el plazo «${earliest.name}»`,
        availableOn: earliest.earliestOn,
        isRemedyWait: false,
        legalBasis: legalBasisOf(earliest.key),
      });
    }
  }
  return waits;
}

/**
 * Plazos que la cuenta ve en el panel. La fiscalía no lleva la vía administrativa (LGRA, arts. 3
 * fr. II y 91): solo ve los plazos de la vía penal, no los del procedimiento administrativo (art. 64
 * fr. II, prescripción, audiencia, alegatos…).
 */
export function visibleDeadlines(
  account: Pick<AuthorityAccountView, 'isProsecution'>,
  procedure: ProcedureView | undefined,
): DeadlineView[] {
  const deadlines = procedure?.deadlines ?? [];
  if (!isProsecutionAccount(account)) return deadlines;
  const criminal = new Set<string>(CRIMINAL_STAGES.flatMap((stage) => stage.deadlines));
  return deadlines.filter((item) => criminal.has(item.key));
}

/**
 * Indica si se puede cerrar en la etapa vigente: dictada la sentencia, el Tribunal no cierra; la
 * declara firme y la autoridad que ejecuta cierra después (LGRA, art. 206).
 */
export function canCloseAtStage(detail: ComplaintDetail): boolean {
  return isClosureAllowedAt(administrativeStage(detail.procedure));
}

/** Indica si hay un recurso sin resolver: mientras tanto no se cierra la denuncia. */
export function hasPendingRemedy(procedure: ProcedureView | undefined): boolean {
  return (procedure?.remedies ?? []).some((remedy) => remedy.status !== 'resolved');
}

/** Desde que se presenta el informe, el cierre lleva su motivo legal (LGRA, art. 100). */
export function requiresLegalOutcome(detail: ComplaintDetail): boolean {
  const stage = administrativeStage(detail.procedure);
  return stage !== null && stage !== 'investigation' && stage !== 'qualification';
}

/** Indica si la cuenta es de una fiscalía (el nodo lo dice en la sesión). */
export function isProsecutionAccount(
  account: Pick<AuthorityAccountView, 'isProsecution'>,
): boolean {
  return account.isProsecution === true;
}

/**
 * Etapas (administrativas y penales) a las que la cuenta puede pasar la denuncia. La fiscalía solo
 * avanza la vía penal; las demás, solo la administrativa (dan vista al Ministerio Público aparte).
 */
export function stageOptions(
  account: Pick<AuthorityAccountView, 'functions' | 'isProsecution'>,
  detail: ComplaintDetail,
): StageOption[] {
  const procedure = detail.procedure;
  if ((detail.summary.managementState ?? 'received_in_inbox') !== 'accepted') return [];
  const stage = administrativeStage(procedure);
  const severity = branchSeverity(procedure);
  const options: StageOption[] = [];
  const isProsecution = isProsecutionAccount(account);
  for (const transition of isProsecution ? [] : transitionsFrom(stage)) {
    if (transition.severities !== undefined && severity !== null) {
      if (!transition.severities.includes(severity)) continue;
    }
    if (isBlocked(procedure, transition.to)) continue;
    // Firmeza, informe no presentado y cierre de la instrucción esperan a que venza su plazo; la
    // audiencia inicial, a que se cumpla su mínimo (se explica en el panel).
    if (openWaitFor(procedure, transition) !== null) continue;
    if (earliestWaitFor(procedure, transition) !== null) continue;
    const mode = actingMode(account, transition.fn, procedure);
    if (mode === null) continue;
    options.push({
      key: transition.to,
      label: transition.label,
      requiresLegalBasis: transition.requires?.includes('legalBasis') ?? false,
      requiresAgreement: transition.requires?.includes('agreement') ?? false,
      mode,
    });
  }
  // La vía penal corre aparte: solo la registra la fiscalía.
  if (isProsecution && hasFunction(account, 'investigation')) {
    const criminal = procedure?.criminalStage ?? null;
    for (const transition of CRIMINAL_TRANSITIONS) {
      if (transition.from !== criminal) continue;
      // Sin vista previa, la vía penal sola empieza en la fiscalía (sin etapa administrativa).
      if (criminal === null && stage !== null) continue;
      options.push({
        key: transition.to,
        label: `Vía penal: ${transition.label}`,
        requiresLegalBasis: false,
        requiresAgreement: false,
        mode: 'own',
      });
    }
  }
  return options;
}

/** Función que cierra en la etapa vigente. */
export function closingFunction(detail: ComplaintDetail): ProcedureFunction | 'intake' {
  const state = detail.summary.managementState ?? 'received_in_inbox';
  if (state === 'received_in_inbox' || state === 'returned_to_inbox') return 'intake';
  const stage = administrativeStage(detail.procedure);
  return stage === null ? 'investigation' : functionInChargeAt(stage);
}

/** Motivos legales de cierre que caben en la etapa vigente. */
export function legalClosureOptions(detail: ComplaintDetail): LegalClosureReasonOption[] {
  const stage = administrativeStage(detail.procedure);
  return LEGAL_CLOSURE_REASONS.filter((reason) => isLegalClosureAllowedAt(reason, stage));
}

/** Recurso que la cuenta puede registrar como presentado. */
export interface RemedyFilingOption {
  kind: RemedyKindOption;
  mode: ActingMode;
}

function pendingKinds(procedure: ProcedureView | undefined): Set<RemedyKind> {
  return new Set(
    (procedure?.remedies ?? [])
      .filter((remedy) => remedy.status !== 'resolved')
      .map((remedy) => remedy.kind),
  );
}

/** Recursos que la cuenta puede registrar en la etapa vigente. */
export function remedyFilingOptions(
  account: Pick<AuthorityAccountView, 'functions'>,
  detail: ComplaintDetail,
): RemedyFilingOption[] {
  const procedure = detail.procedure;
  const stage = administrativeStage(procedure);
  if (stage === null || detail.summary.managementState !== 'accepted') return [];
  const pending = pendingKinds(procedure);
  const options: RemedyFilingOption[] = [];
  for (const kind of REMEDY_KINDS) {
    if (!kind.stages.includes(stage) || pending.has(kind.key)) continue;
    // La inconformidad solo contra la no grave o la abstención (LGRA, art. 102), una vez por acto.
    if (kind.key === 'inconformity') {
      const isOpen = stage === 'abstention' || procedure?.qualification?.severity === 'non_serious';
      if (!isOpen || procedure?.inconformity?.signedOn !== undefined) continue;
    }
    const recorders: readonly (ProcedureFunction | 'intake')[] =
      kind.resolvedBy === 'in_charge' ? [functionInChargeAt(stage)] : kind.recordedBy;
    const own = recorders.find((fn) => fn !== 'court' && hasFunction(account, fn));
    const mode =
      own !== undefined
        ? 'own'
        : recorders.includes('court')
          ? actingMode(account, 'court', procedure)
          : null;
    if (mode !== null) options.push({ kind, mode });
  }
  return options;
}

/** Recurso pendiente que la cuenta puede resolver. */
export interface RemedyResolutionOption {
  kind: RemedyKindOption;
  isAdmitted: boolean;
  mode: ActingMode;
}

/** Recursos pendientes que la cuenta puede resolver. */
export function remedyResolutionOptions(
  account: Pick<AuthorityAccountView, 'functions'>,
  detail: ComplaintDetail,
): RemedyResolutionOption[] {
  const procedure = detail.procedure;
  const options: RemedyResolutionOption[] = [];
  for (const remedy of procedure?.remedies ?? []) {
    if (remedy.status === 'resolved') continue;
    const kind = REMEDY_KINDS.find((item) => item.key === remedy.kind);
    if (kind === undefined) continue;
    const stage = administrativeStage(procedure) ?? 'report_admitted';
    const fn = kind.resolvedBy === 'in_charge' ? functionInChargeAt(stage) : kind.resolvedBy;
    const mode = actingMode(account, fn, procedure);
    if (mode !== null) options.push({ kind, isAdmitted: remedy.status === 'admitted', mode });
  }
  return options;
}

/** Indica si la investigadora puede pedir una medida cautelar ahora. */
export function canRequestPrecautionary(
  account: Pick<AuthorityAccountView, 'functions'>,
  detail: ComplaintDetail,
): boolean {
  const stage = administrativeStage(detail.procedure);
  const stages: readonly string[] = PRECAUTIONARY_RULE.stages;
  const pending = detail.procedure?.precautionary;
  return (
    hasFunction(account, 'investigation') &&
    detail.summary.managementState === 'accepted' &&
    stage !== null &&
    stages.includes(stage) &&
    !isPrecautionaryPending(pending)
  );
}

/** La medida está sin resolver o concedida solo provisionalmente (falta la decisión definitiva). */
function isPrecautionaryPending(pending: ProcedureView['precautionary']): boolean {
  return (
    pending !== undefined && (pending.decidedOn === undefined || pending.outcome === 'provisional')
  );
}

/**
 * Último día de la vista de 5 días hábiles sobre la medida cautelar, si sigue corriendo: mientras
 * tanto solo se concede provisionalmente (LGRA, arts. 126 y 127). Usa el plazo que calculó el nodo.
 */
export function precautionaryHearingDueOn(detail: ComplaintDetail): string | null {
  const hearing = detail.procedure?.deadlines.find((item) => item.key === 'precautionary_hearing');
  return hearing === undefined || hearing.status === 'overdue' ? null : hearing.dueOn;
}

/**
 * Resoluciones que caben ahora para la medida pendiente: durante la vista, solo la provisional;
 * vencida, concederla o negarla (también después de la provisional, que se dicta una vez).
 */
export function precautionaryOutcomeOptions(
  detail: ComplaintDetail,
): (typeof PRECAUTIONARY_RULE.outcomes)[number][] {
  const pending = detail.procedure?.precautionary;
  if (!isPrecautionaryPending(pending)) return [];
  const isHearingOpen = precautionaryHearingDueOn(detail) !== null;
  const wasProvisional = pending?.outcome === 'provisional';
  return PRECAUTIONARY_RULE.outcomes.filter((item) =>
    item.key === 'provisional' ? !wasProvisional : !isHearingOpen,
  );
}

/** Modo en que la cuenta puede resolver la medida cautelar pendiente, o `null`. */
export function precautionaryDecisionMode(
  account: Pick<AuthorityAccountView, 'functions'>,
  detail: ComplaintDetail,
): ActingMode | null {
  if (precautionaryOutcomeOptions(detail).length === 0) return null;
  return precautionaryDeciderMode(account, detail);
}

/** Resuelve la substanciadora o, en las etapas del Tribunal, el Tribunal (LGRA, art. 123). */
function precautionaryDeciderMode(
  account: Pick<AuthorityAccountView, 'functions'>,
  detail: ComplaintDetail,
): ActingMode | null {
  const stage = administrativeStage(detail.procedure);
  const isCourt = stage !== null && COURT_ACCESS_STAGES.has(stage);
  return actingMode(account, isCourt ? 'court' : 'substantiation', detail.procedure);
}

/**
 * Para quien resuelve la medida pendiente: último día de la vista, si sigue corriendo, para avisar
 * desde cuándo puede concederla o negarla. `null` si no aplica.
 */
export function precautionaryWaitFor(
  account: Pick<AuthorityAccountView, 'functions'>,
  detail: ComplaintDetail,
): string | null {
  if (detail.summary.managementState !== 'accepted') return null;
  if (!isPrecautionaryPending(detail.procedure?.precautionary)) return null;
  if (precautionaryDeciderMode(account, detail) === null) return null;
  return precautionaryHearingDueOn(detail);
}

/** Nombre de una etapa (administrativa o penal). */
export function stageName(stage: LegalStage | undefined): string | undefined {
  return stage === undefined ? undefined : findLegalStage(stage)?.name;
}
