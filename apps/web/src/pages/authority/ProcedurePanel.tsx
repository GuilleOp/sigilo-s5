// Trámite de la denuncia en el panel: estado en el flujo de gestión y en las dos vías (la
// administrativa y la penal, en paralelo), plazos, recursos y las acciones que la función de la
// cuenta puede hacer con el catálogo del estándar: turnar, aceptar, reasignar, devolver, avanzar
// de etapa (con sus dos ramas), cerrar con motivo legal, abstenerse, reclasificar, medidas
// cautelares, recursos, vista al Ministerio Público, inscripción de la sanción y desistimiento. Si
// el estado no dio cuentas al Tribunal, la substanciación registra sus actuaciones con expediente.
import { useEffect, useRef, useState } from 'react';
import {
  CLOSURE_REASONS,
  COURT_ACCESS_STAGES,
  CRIMINAL_REFERRAL_BASES,
  ClosureReasonSchema,
  findLegalClosureReason,
  formatLegalReference,
  hasAnyFunction,
  hasFunction,
  MAX_REASSIGNMENTS,
  MIN_ROUTING_NOTE_LENGTH,
  PRECAUTIONARY_RULE,
  REMEDY_FILERS,
  REMEDY_OUTCOMES,
} from '@sigilo/contracts';
import type {
  AuthorityProfile,
  ClosureReason,
  ComplaintDetail,
  CourtRecord,
  CriminalReferralBasisKey,
  LegalClosureReason,
  LegalStage,
  PrecautionaryOutcome,
  ProcedureActionRequest,
  RemedyFiledBy,
  RemedyKind,
  RemedyOutcome,
} from '@sigilo/contracts';
import { Alert } from '../../components/Alert.tsx';
import { DeadlineList } from '../../components/DeadlineList.tsx';
import { SelectField, TextAreaField, TextField } from '../../components/Field.tsx';
import { VerificationResult } from '../../components/VerificationResult.tsx';
import { announce } from '../../lib/announce.ts';
import { focusAfterRender } from '../../lib/focus.ts';
import { formatDayDate } from '../../lib/format.ts';
import {
  actingMode,
  administrativeStage,
  canCloseAtStage,
  canRequestPrecautionary,
  closingFunction,
  hasPendingRemedy,
  isProsecutionAccount,
  legalClosureOptions,
  nextDay,
  precautionaryDecisionMode,
  precautionaryOutcomeOptions,
  precautionaryWaitFor,
  remedyFilingOptions,
  remedyResolutionOptions,
  requiresLegalOutcome,
  stageOptions,
  stageWaits,
  visibleDeadlines,
} from '../../lib/procedure-actions.ts';
import type { ActingMode } from '../../lib/procedure-actions.ts';
import { api } from '../../services/api.ts';
import { describeError } from '../../services/api-client.ts';
import { PINNED_KEYS } from '../../config/pinned-keys.ts';
import { useNetworkState } from '../../network/use-network-state.ts';
import type { AuthoritySession } from './authority-session.ts';
import { EvidenceKeysError, shareEvidenceKeys } from './evidence-keys.ts';
import { ProcedureLifecycle } from './ProcedureLifecycle.tsx';

interface ProcedurePanelProps {
  session: AuthoritySession;
  detail: ComplaintDetail;
  /** Recarga el detalle; se espera antes de mover el foco para que no lo pierda al repintar. */
  onChanged: () => Promise<unknown>;
}

type ActionKey = ProcedureActionRequest['action'];

const ACTION_LABELS: Readonly<Record<ActionKey, string>> = {
  route: 'Turnar a una autoridad',
  accept: 'Aceptar (o reabrir) la denuncia',
  reassign: 'Reasignar a otra autoridad',
  return: 'Devolver al buzón general',
  advance_stage: 'Avanzar a la siguiente etapa legal',
  close: 'Cerrar con fundamento',
  respond_conflict: 'Excusarse o justificar ante un posible conflicto de interés',
  order_reclassification: 'Ordenar reclasificar la falta (Tribunal)',
  request_precautionary: 'Pedir una medida cautelar',
  decide_precautionary: 'Resolver la medida cautelar',
  file_remedy: 'Registrar un recurso presentado con firma',
  resolve_remedy: 'Registrar la resolución de un recurso',
  refer_to_prosecutor: 'Dar vista al Ministerio Público',
  flag_federal_funds: 'Marcar recursos federales',
  send_federal_notice: 'Dar aviso a las autoridades federales',
  register_sanction: 'Registrar la inscripción de la sanción (S3)',
  record_withdrawal: 'Registrar un desistimiento',
};

/** Sanción declarada al cerrar: se verifica contra el registro público de sanciones (S3). */
interface SanctionDraft {
  isDeclared: boolean;
  fileNumber: string;
  personName: string;
  sanction: string;
  institution: string;
  stateCode: string;
}

const EMPTY_SANCTION: SanctionDraft = {
  isDeclared: false,
  fileNumber: '',
  personName: '',
  sanction: '',
  institution: '',
  stateCode: '00',
};

/** Reasignaciones que ya tuvo la denuncia según su línea de tiempo. */
function reassignmentsOf(detail: ComplaintDetail): number {
  return (detail.procedure?.steps ?? []).filter((step) => step.action === 'reassigned').length;
}

/** Indica si la denuncia ya alcanzó el tope de reasignaciones del S5 (el nodo responde 409). */
function isReassignmentCapped(detail: ComplaintDetail): boolean {
  return reassignmentsOf(detail) >= MAX_REASSIGNMENTS;
}

/**
 * Acciones que las funciones de la cuenta pueden hacer en el estado actual del flujo (una cuenta
 * de recepción e investigación suma las de ambas), con el catálogo del estándar. El nodo vuelve a
 * validar y responde 403 o 409 a lo demás.
 */
function availableActions(session: AuthoritySession, detail: ComplaintDetail): ActionKey[] {
  const state = detail.summary.managementState ?? 'received_in_inbox';
  const account = session.account;
  const procedure = detail.procedure;
  const stage = administrativeStage(procedure);
  // LGRA, art. 58 (H5): la autoridad que se excusó no acepta, no avanza ni cierra; solo reasigna,
  // devuelve o turna (el nodo responde 409 a lo demás).
  const review = detail.conflictReview;
  const isExcused =
    review?.response === 'excuse' &&
    review.authorityId === detail.summary.assignedAuthorityId &&
    state !== 'closed';
  if (isExcused) {
    if (!hasFunction(account, 'intake')) return [];
    if (state === 'received_in_inbox' || state === 'returned_to_inbox') return ['route'];
    if (state === 'routed' || state === 'reassigned') {
      return isReassignmentCapped(detail) ? ['return'] : ['reassign', 'return'];
    }
    return [];
  }
  const actions = new Set<ActionKey>();
  if (hasFunction(account, 'intake')) {
    if (state === 'received_in_inbox' || state === 'returned_to_inbox') {
      actions.add('route').add('close');
    }
    if (state === 'routed' || state === 'reassigned') {
      actions.add('accept');
      if (!isReassignmentCapped(detail)) actions.add('reassign');
      actions.add('return');
    }
  }
  if (hasAnyFunction(account, ['intake', 'investigation']) && state === 'closed') {
    actions.add('accept');
  }
  if (state === 'accepted') {
    if (stageOptions(account, detail).length > 0) actions.add('advance_stage');
    // Con un recurso pendiente no se cierra: primero se registra su resolución (el panel lo dice).
    // Dictada la sentencia, el Tribunal no cierra: la declara firme (LGRA, art. 206).
    if (
      actingMode(account, closingFunction(detail), procedure) !== null &&
      !hasPendingRemedy(procedure) &&
      canCloseAtStage(detail)
    ) {
      actions.add('close');
    }
    if (stage === 'court_received' && actingMode(account, 'court', procedure) !== null) {
      actions.add('order_reclassification');
    }
    if (canRequestPrecautionary(account, detail)) actions.add('request_precautionary');
    if (precautionaryDecisionMode(account, detail) !== null) actions.add('decide_precautionary');
    if (remedyFilingOptions(account, detail).length > 0) actions.add('file_remedy');
    if (remedyResolutionOptions(account, detail).length > 0) actions.add('resolve_remedy');
    // La investigadora o la substanciadora dan vista; la fiscalía es el Ministerio Público.
    if (
      procedure?.criminalStage === undefined &&
      hasAnyFunction(account, ['investigation', 'substantiation']) &&
      !isProsecutionAccount(account)
    ) {
      actions.add('refer_to_prosecutor');
    }
    // La sanción firme se inscribe en el S3 (LGRA, art. 27), antes o después de ejecutarse.
    if (
      (stage === 'final' || stage === 'executed') &&
      procedure?.sanctionRegistered === undefined &&
      hasFunction(account, 'substantiation')
    ) {
      actions.add('register_sanction');
    }
  }
  if (
    state !== 'closed' &&
    hasAnyFunction(account, ['intake', 'investigation', 'substantiation'])
  ) {
    actions.add('record_withdrawal');
  }
  return [...actions];
}

/** Datos del formulario de cada acción. */
interface Draft {
  authorityId: string;
  stage: LegalStage | '';
  reason: ClosureReason;
  legalOutcome: LegalClosureReason | '';
  destinationKind: 'network' | 'outside';
  destinationName: string;
  note: string;
  legalBasis: string;
  agreement: string;
  severity: 'serious' | 'non_serious';
  courtFile: string;
  courtBasis: string;
  measure: string;
  precautionaryOutcome: PrecautionaryOutcome;
  remedyKind: RemedyKind | '';
  filedBy: RemedyFiledBy;
  isSigned: boolean;
  remedyOutcome: RemedyOutcome;
  referralBasis: CriminalReferralBasisKey;
  prosecutor: string;
  registryReference: string;
}

function emptyDraft(detail: ComplaintDetail, session: AuthoritySession): Draft {
  const stages = stageOptions(session.account, detail);
  return {
    authorityId: '',
    stage: stages[0]?.key ?? '',
    reason: 'attended',
    legalOutcome: '',
    destinationKind: 'outside',
    destinationName: '',
    note: '',
    legalBasis: '',
    agreement: '',
    severity: 'serious',
    courtFile: '',
    courtBasis: '',
    measure: '',
    precautionaryOutcome: 'granted',
    remedyKind: remedyFilingOptions(session.account, detail)[0]?.kind.key ?? '',
    filedBy: 'reporter',
    isSigned: false,
    remedyOutcome: 'confirmed',
    referralBasis: 'internal_control',
    prosecutor: '',
    registryReference: '',
  };
}

/** Panel del trámite. */
export function ProcedurePanel({ session, detail, onChanged }: ProcedurePanelProps) {
  const actions = availableActions(session, detail);
  const procedure = detail.procedure;
  const account = session.account;
  const stages = stageOptions(account, detail);
  const filings = remedyFilingOptions(account, detail);
  const resolutions = remedyResolutionOptions(account, detail);
  const [authorities, setAuthorities] = useState<AuthorityProfile[]>([]);
  const [action, setAction] = useState<ActionKey | ''>(actions[0] ?? '');
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(detail, session));
  const [sanction, setSanction] = useState<SanctionDraft>(EMPTY_SANCTION);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [isSaving, setSaving] = useState(false);
  const isSavingRef = useRef(false);
  const isMounted = useRef(true);
  const current = detail.summary.assignedAuthorityId;
  const network = useNetworkState();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  useEffect(() => {
    isMounted.current = true;
    api.listAuthorities(session.token).then(
      (list) => {
        if (isMounted.current) setAuthorities(list);
      },
      () => undefined,
    );
    return () => {
      isMounted.current = false;
    };
  }, [session.token]);

  // Solo autoridades que pueden aceptar lo turnado (con recepción): nunca el Tribunal ni el buzón.
  const targets = authorities.filter((item) => item.canReceive && item.authorityId !== current);
  // La fiscalía no lleva la vía administrativa: no ve sus plazos (art. 64 fr. II, prescripción…).
  const deadlines = visibleDeadlines(account, procedure);
  // Medida cautelar: durante la vista solo cabe la provisional (LGRA, arts. 126 y 127).
  const precautionaryOutcomes = precautionaryOutcomeOptions(detail);
  const precautionaryOutcome =
    precautionaryOutcomes.find((item) => item.key === draft.precautionaryOutcome)?.key ??
    precautionaryOutcomes[0]?.key ??
    draft.precautionaryOutcome;
  const precautionaryHearingOn = precautionaryWaitFor(account, detail);
  const selectedStage = stages.find((item) => item.key === draft.stage);
  const legalOutcomes = legalClosureOptions(detail);
  const isLegalOutcomeRequired = requiresLegalOutcome(detail);
  const waits = stageWaits(account, detail);
  const canCloseLater =
    detail.summary.managementState === 'accepted' &&
    hasPendingRemedy(procedure) &&
    actingMode(account, closingFunction(detail), procedure) !== null;
  const isSanctionUnregistered = procedure?.sanctionRegistered === undefined;
  const legalOutcome =
    draft.legalOutcome === '' ? undefined : findLegalClosureReason(draft.legalOutcome);
  const selectedResolution = resolutions.find((item) => item.kind.key === draft.remedyKind);
  const selectedFiling = filings.find((item) => item.kind.key === draft.remedyKind);
  /** Modo de la acción elegida: con la función propia o como registro de actuación del Tribunal. */
  const mode: ActingMode | null = (() => {
    switch (action) {
      case 'advance_stage':
        return selectedStage?.mode ?? null;
      case 'close':
        return actingMode(account, closingFunction(detail), procedure);
      case 'order_reclassification':
        return actingMode(account, 'court', procedure);
      case 'decide_precautionary':
        return precautionaryDecisionMode(account, detail);
      case 'file_remedy':
        return selectedFiling?.mode ?? null;
      case 'resolve_remedy':
        return selectedResolution?.mode ?? null;
      default:
        return 'own';
    }
  })();
  const isCourtRecord = mode === 'court_record';
  const isQualification = action === 'advance_stage' && draft.stage === 'qualification';
  const needsBasis =
    action === 'close' ||
    isQualification ||
    action === 'order_reclassification' ||
    action === 'request_precautionary' ||
    action === 'decide_precautionary' ||
    action === 'resolve_remedy' ||
    action === 'register_sanction' ||
    (action === 'advance_stage' && selectedStage?.requiresLegalBasis === true);
  const needsAgreement =
    action === 'close' ||
    isQualification ||
    (action === 'advance_stage' && selectedStage?.requiresAgreement === true);

  /**
   * H8: errores por campo (identificador del campo → mensaje), para marcarlos con aria-invalid,
   * asociarlos con su campo y llevar el foco al primero.
   */
  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    const note = draft.note.trim();
    if ((action === 'route' || action === 'reassign') && draft.authorityId === '') {
      found['procedure-authority'] = 'Elige la autoridad.';
    }
    if (action === 'route' && note.length < MIN_ROUTING_NOTE_LENGTH) {
      found['procedure-note'] =
        `Escribe por qué la envías a esta autoridad (al menos ${MIN_ROUTING_NOTE_LENGTH} caracteres).`;
    }
    if (
      (action === 'reassign' || action === 'return' || action === 'record_withdrawal') &&
      note === ''
    ) {
      found['procedure-note'] = 'Escribe la nota pública: la persona la leerá.';
    }
    if (action === 'advance_stage' && draft.stage === '')
      found['procedure-stage'] = 'Elige la etapa.';
    const prefix = isQualification ? 'qualification' : 'procedure';
    // Con el registro de actuación del Tribunal, el fundamento va con el expediente.
    if (needsBasis && !(isCourtRecord && !needsAgreement)) {
      if (draft.legalBasis.trim().length < 20) {
        found[`${prefix}-legal-basis`] = 'Escribe el fundamento (al menos 20 caracteres).';
      }
    }
    if (needsAgreement && draft.agreement.trim().length < 50) {
      found[`${prefix}-agreement`] =
        'Escribe el acuerdo en versión pública (al menos 50 caracteres).';
    }
    if (isCourtRecord) {
      if (draft.courtFile.trim().length < 3)
        found['court-file'] = 'Escribe el número de expediente.';
      if (draft.courtBasis.trim().length < 20) {
        found['court-basis'] =
          'Escribe el fundamento de la actuación del Tribunal (al menos 20 caracteres).';
      }
    }
    if (action === 'close' && isLegalOutcomeRequired && legalOutcome === undefined) {
      found['procedure-legal-outcome'] =
        'Elige el motivo legal: desde que se presentó el informe, el cierre lo lleva.';
    }
    if (action === 'close' && legalOutcome?.key === 'sanctioned' && isSanctionUnregistered) {
      found['procedure-legal-outcome'] =
        'Primero registra la inscripción de la sanción en el S3 (LGRA, art. 27).';
    }
    if (action === 'close' && legalOutcome?.requiresDestination === true) {
      if (draft.destinationName.trim().length < 3) {
        found['closure-destination'] = 'Escribe a qué autoridad se remitió.';
      }
    }
    if (action === 'close' && sanction.isDeclared) {
      for (const field of ['fileNumber', 'personName', 'sanction', 'institution'] as const) {
        if (sanction[field].trim() === '') found[`sanction-${field}`] = 'Escribe este dato.';
      }
    }
    if (action === 'request_precautionary' && draft.measure.trim().length < 10) {
      found['precautionary-measure'] = 'Describe la medida (al menos 10 caracteres).';
    }
    if (action === 'file_remedy' && !draft.isSigned) {
      found['remedy-signed'] = 'Solo se registra el escrito con firma autógrafa (LGRA, art. 109).';
    }
    if (action === 'refer_to_prosecutor' && draft.prosecutor.trim().length < 3) {
      found['referral-prosecutor'] = 'Escribe a qué fiscalía se dio vista.';
    }
    if (action === 'register_sanction' && draft.registryReference.trim().length < 3) {
      found['sanction-registry'] = 'Escribe la referencia de la inscripción.';
    }
    return found;
  }

  function courtRecord(): { courtRecord?: CourtRecord } {
    return isCourtRecord
      ? { courtRecord: { fileNumber: draft.courtFile.trim(), legalBasis: draft.courtBasis.trim() } }
      : {};
  }

  function buildRequest(): ProcedureActionRequest | null {
    const note = draft.note.trim();
    const withNote = note === '' ? {} : { note };
    const legalBasis = draft.legalBasis.trim();
    const agreement = draft.agreement.trim();
    switch (action) {
      case 'route':
        return { action, authorityId: draft.authorityId, note };
      case 'accept':
        return { action, ...withNote };
      case 'reassign':
        return { action, authorityId: draft.authorityId, note };
      case 'return':
        return { action, note };
      case 'advance_stage': {
        if (draft.stage === '') return null;
        if (draft.stage === 'qualification') {
          // La calificación lleva su gravedad, su fundamento y el acuerdo (el auditor lo revisa).
          return {
            action,
            stage: draft.stage,
            ...withNote,
            qualification: { severity: draft.severity, legalBasis, agreement },
          };
        }
        return {
          action,
          stage: draft.stage,
          ...withNote,
          ...(selectedStage?.requiresLegalBasis === true && !isCourtRecord ? { legalBasis } : {}),
          ...(selectedStage?.requiresAgreement === true ? { agreement } : {}),
          ...courtRecord(),
        };
      }
      case 'close': {
        const base = {
          action,
          reason: draft.reason,
          legalBasis,
          agreement,
          ...(legalOutcome === undefined ? {} : { legalOutcome: legalOutcome.key }),
          ...(legalOutcome?.requiresDestination === true
            ? {
                destination: {
                  kind: draft.destinationKind,
                  name: draft.destinationName.trim(),
                },
              }
            : {}),
          ...courtRecord(),
        };
        if (!sanction.isDeclared) return base;
        return {
          ...base,
          sanction: {
            fileNumber: sanction.fileNumber.trim(),
            personName: sanction.personName.trim(),
            sanction: sanction.sanction.trim(),
            institution: sanction.institution.trim(),
            stateCode: sanction.stateCode.trim(),
          },
        };
      }
      case 'order_reclassification':
        return {
          action,
          legalBasis: isCourtRecord ? draft.courtBasis.trim() : legalBasis,
          ...withNote,
          ...courtRecord(),
        };
      case 'request_precautionary':
        return { action, measure: draft.measure.trim(), legalBasis };
      case 'decide_precautionary':
        return {
          action,
          outcome: precautionaryOutcome,
          legalBasis: isCourtRecord ? draft.courtBasis.trim() : legalBasis,
          ...courtRecord(),
        };
      case 'file_remedy':
        return draft.remedyKind === ''
          ? null
          : {
              action,
              kind: draft.remedyKind,
              filedBy: draft.filedBy,
              signed: true,
              ...(legalBasis.length >= 20 ? { legalBasis } : {}),
              ...withNote,
              ...courtRecord(),
            };
      case 'resolve_remedy':
        return draft.remedyKind === ''
          ? null
          : {
              action,
              kind: draft.remedyKind,
              outcome: draft.remedyOutcome,
              legalBasis: isCourtRecord ? draft.courtBasis.trim() : legalBasis,
              ...withNote,
              ...courtRecord(),
            };
      case 'refer_to_prosecutor':
        return {
          action,
          basis: draft.referralBasis,
          prosecutor: draft.prosecutor.trim(),
          ...withNote,
        };
      case 'register_sanction':
        return { action, registryReference: draft.registryReference.trim(), legalBasis };
      case 'record_withdrawal':
        return { action, note };
      default:
        return null;
    }
  }

  async function apply(): Promise<void> {
    if (isSavingRef.current) return;
    const found = validate();
    setErrors(found);
    const firstInvalid = Object.keys(found)[0];
    const request = firstInvalid === undefined ? buildRequest() : null;
    if (request === null) {
      setMessage('Revisa los datos marcados de la acción.');
      if (firstInvalid !== undefined) focusAfterRender(firstInvalid);
      return;
    }
    isSavingRef.current = true;
    setSaving(true);
    try {
      // Turnar o reasignar dentro del nodo: antes, la autoridad destino recibe las llaves de las
      // pruebas cifradas (re-cifradas aquí hacia su llave); sin ellas no podría abrirlas.
      if (request.action === 'route' || request.action === 'reassign') {
        await shareEvidenceKeys({
          session,
          detail,
          targetAuthorityId: request.authorityId,
          network,
          pinned: PINNED_KEYS,
          api,
        });
      }
      const state = await api.applyProcedure(session.token, detail.summary.folio, request);
      if (!isMounted.current) return;
      // Si la denuncia pasó a otra autoridad, ya no se puede volver a leer: no se recarga.
      // El Tribunal deja de ver la denuncia cuando sale de sus etapas (por ejemplo, al quedar firme
      // o al resolver una inconformidad).
      const isCourt = hasFunction(account, 'court');
      const isGone = isCourt
        ? state.legalStage === undefined || !COURT_ACCESS_STAGES.has(state.legalStage)
        : state.assignedAuthorityId !== account.authorityId;
      if (isGone) {
        setMessage(
          `Listo: ${ACTION_LABELS[request.action]}. La denuncia ya no está en tu bandeja.`,
        );
        // H3: el botón pulsado desaparece; el foco va al resultado.
        focusAfterRender('procedure-message');
        return;
      }
      setMessage(`Listo: ${ACTION_LABELS[request.action]}.`);
      // H3: el panel se vuelve a pintar con el estado nuevo; el foco va a su encabezado y el
      // resultado se anuncia.
      announce(`Listo: ${ACTION_LABELS[request.action]}.`);
      await onChanged();
      if (isMounted.current) focusAfterRender('procedure-title');
    } catch (failure) {
      if (isMounted.current) {
        setMessage(
          failure instanceof EvidenceKeysError
            ? failure.message
            : describeError(failure, 'No pudimos aplicar la acción. Inténtalo de nuevo.'),
        );
      }
    } finally {
      isSavingRef.current = false;
      if (isMounted.current) setSaving(false);
    }
  }

  const prefix = isQualification ? 'qualification' : 'procedure';
  const showBasis = needsBasis && !(isCourtRecord && !needsAgreement);

  return (
    <section className="card" aria-labelledby="procedure-title" data-testid="procedure-panel">
      <h3 id="procedure-title" tabIndex={-1}>
        Trámite
      </h3>
      {procedure && (
        <>
          <p data-testid="procedure-state">
            {procedure.managementStateName}
            {procedure.legalStageName ? ` · Etapa: ${procedure.legalStageName}` : ''}
          </p>
          {procedure.criminalStageName !== undefined && (
            <p data-testid="procedure-criminal-stage">
              Vía penal, en paralelo: {procedure.criminalStageName}
            </p>
          )}
          <DeadlineList deadlines={deadlines} testId="procedure-deadlines" />
          {(waits.length > 0 || canCloseLater || precautionaryHearingOn !== null) && (
            <ul className="field__hint" data-testid="procedure-waits">
              {waits.map((wait) => (
                <li key={wait.key}>
                  «{wait.label}»: {wait.text}
                  {wait.dueOn === undefined ? '' : ` hasta el ${formatDayDate(wait.dueOn)}`}. Podrás
                  hacerlo a partir del {formatDayDate(wait.availableOn)}
                  {wait.isRemedyWait
                    ? ' si nadie presenta el recurso, o al registrar la resolución del recurso presentado (LGRA, art. 206).'
                    : wait.legalBasis.length > 0
                      ? ` (${wait.legalBasis.join('; ')}).`
                      : '.'}
                </li>
              ))}
              {precautionaryHearingOn !== null && (
                <li>
                  «Resolver la medida cautelar»: la vista a quienes afecta corre hasta el{' '}
                  {formatDayDate(precautionaryHearingOn)}. Mientras tanto solo puedes concederla
                  provisionalmente; podrás concederla o negarla a partir del{' '}
                  {formatDayDate(nextDay(precautionaryHearingOn))} (LGRA, arts. 126 y 127).
                </li>
              )}
              {canCloseLater && (
                <li>
                  «Cerrar con fundamento»: hay un recurso pendiente. Primero registra su resolución.
                </li>
              )}
            </ul>
          )}
          {procedure.rules.length > 0 && (
            <ul className="rule-list" data-testid="procedure-rules">
              {procedure.rules.map((rule) => (
                <li key={`${rule.ruleKey}-${rule.on}`} className="rule" data-effect={rule.effect}>
                  <strong>{rule.name}</strong> ({formatDayDate(rule.on)}):{' '}
                  {rule.effect === 'escalate' ? 'escaló a la supervisora.' : 'aviso.'}{' '}
                  {rule.explanation}
                </li>
              ))}
            </ul>
          )}
          {procedure.qualification !== undefined && (
            <div className="qualification" data-testid="procedure-qualification">
              <p>
                <strong>Calificación: {procedure.qualification.severityName}</strong> (
                {formatDayDate(procedure.qualification.legalOn)}).{' '}
                {procedure.qualification.appeal?.signedOn !== undefined
                  ? `Inconformidad presentada con firma el ${formatDayDate(procedure.qualification.appeal.signedOn)}.`
                  : procedure.qualification.appeal !== undefined
                    ? `La persona dio aviso de inconformidad el ${formatDayDate(procedure.qualification.appeal.legalOn)}; falta el escrito con firma autógrafa.`
                    : procedure.qualification.appealDueOn !== undefined
                      ? `Puede inconformarse, con escrito firmado, hasta el ${formatDayDate(procedure.qualification.appealDueOn)}.`
                      : ''}
              </p>
              {procedure.qualification.appeal !== undefined && (
                <p>Motivos: «{procedure.qualification.appeal.reasons}»</p>
              )}
            </div>
          )}
          <ProcedureLifecycle procedure={procedure} />
          {procedure.closure !== undefined && (
            <div className="closure" data-testid="procedure-closure">
              <p>
                <strong>Cierre: {procedure.closure.reasonName}</strong> (
                {formatDayDate(procedure.closure.legalOn)}). Fundamento: «
                {procedure.closure.legalBasis}»
              </p>
              {procedure.closure.legalOutcomeName !== undefined && (
                <p data-testid="procedure-legal-outcome">
                  Motivo legal: {procedure.closure.legalOutcomeName}
                  {procedure.closure.destination !== undefined &&
                    ` · Remitida a ${procedure.closure.destination.name}${procedure.closure.destination.kind === 'outside' ? ' (fuera de la red)' : ''}`}
                </p>
              )}
              {procedure.closure.sanctionCheck !== undefined && (
                <VerificationResult
                  outcome={procedure.closure.sanctionCheck.outcome}
                  testId="procedure-sanction-check"
                >
                  <p>{procedure.closure.sanctionCheck.explanation}</p>
                  {procedure.closure.sanctionCheck.unverifiable && (
                    <p>
                      Señal «sanción no verificable»: el registro cubre a la institución, pasó el
                      plazo de publicación y no aparece.
                    </p>
                  )}
                </VerificationResult>
              )}
            </div>
          )}
        </>
      )}
      {actions.includes('return') && isReassignmentCapped(detail) && (
        <Alert tone="warning" title="Ya no se puede reasignar" testId="reassignment-cap">
          <p>
            Esta denuncia ya se reasignó {MAX_REASSIGNMENTS} veces, el máximo (como en el S5). Si no
            le corresponde a tu autoridad, devuélvela al buzón general con una nota para que la
            turnen de nuevo. Si nadie la acepta, al cumplirse la meta de turnado del S5 la
            supervisión recibe un aviso para revisarla.
          </p>
          {action !== 'return' && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setAction('return');
                focusAfterRender('procedure-note');
              }}
              data-testid="reassignment-cap-return"
            >
              Devolver al buzón general
            </button>
          )}
        </Alert>
      )}
      {actions.length === 0 ? (
        <p>Tu función no tiene acciones del trámite en este estado.</p>
      ) : (
        <>
          <SelectField
            id="procedure-action"
            label="Acción"
            value={action}
            onChange={(event) => setAction(event.target.value as ActionKey)}
            data-testid="procedure-action"
          >
            {actions.map((key) => (
              <option key={key} value={key}>
                {ACTION_LABELS[key]}
              </option>
            ))}
          </SelectField>
          {isCourtRecord && (
            <fieldset className="field court-record" data-testid="court-record">
              <legend>Registro de actuación del Tribunal</legend>
              <p className="field__hint">
                Tu estado no dio cuentas al Tribunal en el sistema: registras lo que el Tribunal ya
                resolvió, con su número de expediente y su fundamento. En la línea de tiempo se lee
                como registrado por otra autoridad.
              </p>
              <TextField
                id="court-file"
                label="Número de expediente del Tribunal"
                error={errors['court-file']}
                value={draft.courtFile}
                maxLength={80}
                onChange={(event) => set('courtFile', event.target.value)}
                data-testid="court-file"
              />
              <TextAreaField
                id="court-basis"
                label="Fundamento de la actuación del Tribunal"
                error={errors['court-basis']}
                rows={2}
                maxLength={1000}
                value={draft.courtBasis}
                onChange={(event) => set('courtBasis', event.target.value)}
                data-testid="court-basis"
              />
            </fieldset>
          )}
          {(action === 'route' || action === 'reassign') && (
            <SelectField
              id="procedure-authority"
              error={errors['procedure-authority']}
              hint={
                action === 'reassign'
                  ? `Reasignaciones de esta denuncia: ${reassignmentsOf(detail)} de ${MAX_REASSIGNMENTS}.`
                  : undefined
              }
              label="Autoridad"
              value={draft.authorityId}
              onChange={(event) => set('authorityId', event.target.value)}
              data-testid="procedure-authority"
            >
              <option value="">Elige la autoridad</option>
              {targets.map((item) => (
                <option key={item.authorityId} value={item.authorityId}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          )}
          {action === 'advance_stage' && (
            <SelectField
              id="procedure-stage"
              error={errors['procedure-stage']}
              label="Etapa"
              value={draft.stage}
              onChange={(event) => set('stage', event.target.value as LegalStage)}
              data-testid="procedure-stage"
            >
              {stages.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </SelectField>
          )}
          {isQualification && (
            <fieldset className="field qualification-fields" data-testid="qualification-fields">
              <legend>Calificación de la falta (LGRA, art. 100)</legend>
              <p className="field__hint">
                Si la calificas como no grave, se notifica a quien denunció y puede inconformarse en
                5 días hábiles con escrito firmado (arts. 102, 103 y 109). El auditor revisa el
                acuerdo.
              </p>
              <SelectField
                id="qualification-severity"
                label="Gravedad"
                value={draft.severity}
                onChange={(event) =>
                  set('severity', event.target.value === 'non_serious' ? 'non_serious' : 'serious')
                }
                data-testid="qualification-severity"
              >
                <option value="serious">Falta grave (o de particulares)</option>
                <option value="non_serious">Falta no grave</option>
              </SelectField>
            </fieldset>
          )}
          {action === 'close' && (
            <>
              <SelectField
                id="procedure-legal-outcome"
                label={isLegalOutcomeRequired ? 'Motivo legal' : 'Motivo legal (opcional)'}
                error={errors['procedure-legal-outcome']}
                hint={
                  isLegalOutcomeRequired
                    ? 'Desde que se presentó el informe, el cierre lleva su motivo legal, aparte del motivo del S5.'
                    : 'El motivo legal va aparte del motivo del S5 y dice el fundamento del cierre.'
                }
                value={draft.legalOutcome}
                onChange={(event) => {
                  const value = event.target.value as LegalClosureReason | '';
                  set('legalOutcome', value);
                  const option = value === '' ? undefined : findLegalClosureReason(value);
                  if (option !== undefined && !option.s5Reasons.includes(draft.reason)) {
                    set('reason', option.s5Reasons[0] ?? 'other');
                  }
                }}
                data-testid="procedure-legal-outcome"
              >
                <option value="">
                  {isLegalOutcomeRequired ? 'Elige el motivo legal' : 'Sin motivo legal'}
                </option>
                {legalOutcomes.map((item) => (
                  <option
                    key={item.key}
                    value={item.key}
                    disabled={item.key === 'sanctioned' && isSanctionUnregistered}
                  >
                    {item.key === 'sanctioned' && isSanctionUnregistered
                      ? `${item.name} (primero registra la inscripción en el S3)`
                      : item.name}
                  </option>
                ))}
              </SelectField>
              {legalOutcome !== undefined && (
                <p className="field__hint" data-testid="procedure-legal-outcome-help">
                  {legalOutcome.explanation}
                </p>
              )}
              <SelectField
                id="procedure-reason"
                label="Motivo de cierre del S5"
                value={draft.reason}
                onChange={(event) => set('reason', ClosureReasonSchema.parse(event.target.value))}
                data-testid="procedure-reason"
              >
                {CLOSURE_REASONS.filter(
                  (item) => legalOutcome === undefined || legalOutcome.s5Reasons.includes(item.key),
                ).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name}
                  </option>
                ))}
              </SelectField>
              {legalOutcome?.requiresDestination === true && (
                <fieldset className="field" data-testid="closure-destination-fields">
                  <legend>Autoridad a la que se remite (LGRA, arts. 14 y 196 fr. II)</legend>
                  <SelectField
                    id="closure-destination-kind"
                    label="Dónde está"
                    value={draft.destinationKind}
                    onChange={(event) =>
                      set(
                        'destinationKind',
                        event.target.value === 'network' ? 'network' : 'outside',
                      )
                    }
                    data-testid="closure-destination-kind"
                  >
                    <option value="outside">Fuera de la red (institución sin nodo)</option>
                    <option value="network">En la red (otro nodo o autoridad)</option>
                  </SelectField>
                  <TextField
                    id="closure-destination"
                    label="Nombre de la autoridad"
                    error={errors['closure-destination']}
                    value={draft.destinationName}
                    maxLength={300}
                    onChange={(event) => set('destinationName', event.target.value)}
                    data-testid="closure-destination"
                  />
                </fieldset>
              )}
            </>
          )}
          {action === 'request_precautionary' && (
            <TextAreaField
              id="precautionary-measure"
              label="Medida que pides (reservada: la persona denunciante no la ve)"
              hint={`Por ejemplo: ${PRECAUTIONARY_RULE.examples.join('; ')}.`}
              error={errors['precautionary-measure']}
              rows={2}
              maxLength={2000}
              value={draft.measure}
              onChange={(event) => set('measure', event.target.value)}
              data-testid="precautionary-measure"
            />
          )}
          {action === 'decide_precautionary' && (
            <SelectField
              id="precautionary-outcome"
              label="Resolución de la medida (LGRA, arts. 125 a 127)"
              value={precautionaryOutcome}
              onChange={(event) =>
                set('precautionaryOutcome', event.target.value as PrecautionaryOutcome)
              }
              data-testid="precautionary-outcome"
            >
              {precautionaryOutcomes.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          )}
          {(action === 'file_remedy' || action === 'resolve_remedy') && (
            <SelectField
              id="remedy-kind"
              label="Recurso"
              value={draft.remedyKind}
              onChange={(event) => set('remedyKind', event.target.value as RemedyKind)}
              data-testid="remedy-kind"
            >
              <option value="">Elige el recurso</option>
              {(action === 'file_remedy' ? filings : resolutions).map((item) => (
                <option key={item.kind.key} value={item.kind.key}>
                  {item.kind.name}
                </option>
              ))}
            </SelectField>
          )}
          {action === 'file_remedy' && selectedFiling !== undefined && (
            <>
              <p className="field__hint" data-testid="remedy-help">
                {selectedFiling.kind.against} Se presenta ante: {selectedFiling.kind.filedBefore}{' '}
                {selectedFiling.kind.effect}
              </p>
              <SelectField
                id="remedy-filed-by"
                label="Quién lo presentó"
                value={draft.filedBy}
                onChange={(event) => set('filedBy', event.target.value as RemedyFiledBy)}
                data-testid="remedy-filed-by"
              >
                {REMEDY_FILERS.filter((item) => selectedFiling.kind.filedBy.includes(item.key)).map(
                  (item) => (
                    <option key={item.key} value={item.key}>
                      {item.name}
                    </option>
                  ),
                )}
              </SelectField>
              <div className="choice">
                <input
                  type="checkbox"
                  id="remedy-signed"
                  checked={draft.isSigned}
                  aria-invalid={errors['remedy-signed'] ? true : undefined}
                  aria-describedby={errors['remedy-signed'] ? 'remedy-signed-error' : undefined}
                  onChange={(event) => set('isSigned', event.target.checked)}
                  data-testid="remedy-signed"
                />
                <label htmlFor="remedy-signed">
                  Recibí el escrito con firma autógrafa (sin firma no se tiene por presentado).
                </label>
              </div>
              {errors['remedy-signed'] && (
                <p id="remedy-signed-error" className="field__error">
                  Error: {errors['remedy-signed']}
                </p>
              )}
            </>
          )}
          {action === 'resolve_remedy' && selectedResolution !== undefined && (
            <SelectField
              id="remedy-outcome"
              label="Resultado"
              value={draft.remedyOutcome}
              onChange={(event) => set('remedyOutcome', event.target.value as RemedyOutcome)}
              data-testid="remedy-outcome"
            >
              {REMEDY_OUTCOMES.filter(
                (item) => item.key !== 'admitted' || !selectedResolution.isAdmitted,
              ).map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </SelectField>
          )}
          {action === 'refer_to_prosecutor' && (
            <>
              <p className="field__hint" data-testid="referral-hint">
                Aquí se registra la vista en el trámite. La vía penal corre aparte y al mismo
                tiempo: la vista no detiene el procedimiento administrativo. Remitir la denuncia y
                sus pruebas a la fiscalía es un paso aparte, por oficio: SIGILO todavía no la
                entrega en la bandeja de la fiscalía.
              </p>
              <SelectField
                id="referral-basis"
                label="Quién da la vista"
                value={draft.referralBasis}
                onChange={(event) =>
                  set('referralBasis', event.target.value as CriminalReferralBasisKey)
                }
                data-testid="referral-basis"
              >
                {CRIMINAL_REFERRAL_BASES.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name} ({item.legalBasis.map(formatLegalReference).join('; ')})
                  </option>
                ))}
              </SelectField>
              <TextField
                id="referral-prosecutor"
                label="Fiscalía que recibe la vista"
                error={errors['referral-prosecutor']}
                value={draft.prosecutor}
                maxLength={300}
                onChange={(event) => set('prosecutor', event.target.value)}
                data-testid="referral-prosecutor"
              />
            </>
          )}
          {action === 'register_sanction' && (
            <TextField
              id="sanction-registry"
              label="Referencia de la inscripción en el S3"
              hint="Solo se registra el acto de inscripción; no hay conexión con el S3."
              error={errors['sanction-registry']}
              value={draft.registryReference}
              maxLength={200}
              onChange={(event) => set('registryReference', event.target.value)}
              data-testid="sanction-registry"
            />
          )}
          {showBasis && (
            <TextAreaField
              id={`${prefix}-legal-basis`}
              error={errors[`${prefix}-legal-basis`]}
              label="Fundamento legal"
              hint="Al menos 20 caracteres. La persona denunciante lo verá."
              rows={2}
              maxLength={1000}
              value={draft.legalBasis}
              onChange={(event) => set('legalBasis', event.target.value)}
              data-testid={`${prefix}-legal-basis`}
            />
          )}
          {needsAgreement && (
            <TextAreaField
              id={`${prefix}-agreement`}
              error={errors[`${prefix}-agreement`]}
              label={
                isQualification
                  ? 'Acuerdo de calificación en versión pública'
                  : 'Acuerdo en versión pública'
              }
              hint="Al menos 50 caracteres, sin datos personales. La persona y el auditor lo leerán."
              rows={4}
              maxLength={20000}
              value={draft.agreement}
              onChange={(event) => set('agreement', event.target.value)}
              data-testid={`${prefix}-agreement`}
            />
          )}
          {action === 'close' && (
            <>
              <div className="choice">
                <input
                  type="checkbox"
                  id="procedure-sanction"
                  checked={sanction.isDeclared}
                  onChange={(event) =>
                    setSanction((value) => ({ ...value, isDeclared: event.target.checked }))
                  }
                  data-testid="procedure-sanction"
                />
                <label htmlFor="procedure-sanction">
                  Declarar la sanción impuesta (se verificará contra el registro público)
                </label>
              </div>
              {sanction.isDeclared && (
                <fieldset className="field sanction-fields">
                  <legend>Sanción declarada</legend>
                  <p className="field__hint">
                    Solo lo confirmado en el registro público cuenta como sanción verificada. Si no
                    aparece, se informa «sin cobertura», nunca «falsa».
                  </p>
                  {(
                    [
                      ['fileNumber', 'Expediente de la resolución'],
                      ['personName', 'Persona sancionada'],
                      ['sanction', 'Sanción (por ejemplo, «Amonestación pública»)'],
                      ['institution', 'Institución de la persona'],
                      ['stateCode', 'Entidad (clave INEGI; 00 para lo federal)'],
                    ] as const
                  ).map(([field, label]) => (
                    <TextField
                      key={field}
                      id={`sanction-${field}`}
                      error={errors[`sanction-${field}`]}
                      label={label}
                      value={sanction[field]}
                      maxLength={field === 'institution' ? 300 : 200}
                      onChange={(event) =>
                        setSanction((value) => ({ ...value, [field]: event.target.value }))
                      }
                      data-testid={`sanction-${field}`}
                    />
                  ))}
                </fieldset>
              )}
            </>
          )}
          {action !== '' &&
            action !== 'close' &&
            action !== 'request_precautionary' &&
            action !== 'decide_precautionary' &&
            action !== 'register_sanction' && (
              <TextAreaField
                id="procedure-note"
                error={errors['procedure-note']}
                label={
                  action === 'route'
                    ? 'Motivo del turno (obligatorio)'
                    : action === 'reassign' || action === 'return' || action === 'record_withdrawal'
                      ? 'Nota pública (obligatoria)'
                      : 'Nota pública (opcional)'
                }
                hint={
                  action === 'route'
                    ? `Por qué la envías a esta autoridad; la persona lo leerá. Al menos ${MIN_ROUTING_NOTE_LENGTH} caracteres.`
                    : action === 'record_withdrawal'
                      ? 'La investigación también es de oficio: el desistimiento queda documentado y no cierra la denuncia (LGRA, arts. 91 y 94).'
                      : 'La persona denunciante la leerá tal cual en su seguimiento.'
                }
                rows={2}
                maxLength={2000}
                value={draft.note}
                onChange={(event) => set('note', event.target.value)}
                data-testid="procedure-note"
              />
            )}
          <button
            type="button"
            className="button"
            aria-disabled={isSaving ? true : undefined}
            onClick={() => void apply()}
            data-testid="apply-procedure"
          >
            {isSaving ? 'Guardando...' : 'Aplicar'}
          </button>
        </>
      )}
      <p
        id="procedure-message"
        tabIndex={-1}
        role="status"
        aria-live="polite"
        data-testid="procedure-message"
      >
        {message}
      </p>
    </section>
  );
}
