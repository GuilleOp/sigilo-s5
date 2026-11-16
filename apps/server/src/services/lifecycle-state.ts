// Hechos del ciclo de vida legal que se derivan de la línea de tiempo de una denuncia: desde cuándo
// está en su etapa, recursos presentados y pendientes, la inconformidad (aviso, escrito firmado y
// resultado), medidas cautelares, reclasificación, recursos federales, inscripción de la sanción y
// qué funciones ejerció cada cuenta (separación de funciones, LGRA art. 115).
import {
  ADMINISTRATIVE_STAGES,
  CriminalStageSchema,
  findRemedyKind,
  isCriminalStage,
  SUBSTANTIATION_STAGES,
} from '@sigilo/contracts';
import type {
  AdministrativeStage,
  CriminalStage,
  FederalFunding,
  LegalStage,
  PrecautionaryOutcome,
  RemedyFiledBy,
  RemedyKind,
  RemedyOutcome,
} from '@sigilo/contracts';
import type { StoredStep } from '../db/procedure-repository.ts';

/** Función que ejerce una cuenta en un paso. */
export type ActingFunction = 'intake' | 'investigation' | 'substantiation' | 'court';

/** Recurso presentado y su situación. */
export interface RemedyState {
  remedyId: string;
  kind: RemedyKind;
  filedOn: string;
  filedBy: RemedyFiledBy;
  /** Etapa administrativa en que se presentó. */
  stage: LegalStage | null;
  status: 'pending' | 'admitted' | 'resolved';
  outcome: RemedyOutcome | null;
  resolvedOn: string | null;
  /** Posición del paso en que se presentó. */
  position: number;
}

/** Hechos del ciclo de vida de una denuncia. */
export interface LifecycleState {
  /** Día en que entró a su etapa administrativa vigente. */
  stageEnteredOn: string | null;
  /** Etapa penal según los pasos y día en que entró a ella. */
  criminalStageEnteredOn: string | null;
  remedies: RemedyState[];
  /** Último acto impugnable con inconformidad (abstención o calificación de no grave). */
  lastAbstention: {
    position: number;
    legalOn: string;
    legalBasis: string;
    agreement: string;
    authoritySequence: number | null;
  } | null;
  /** Posición del último paso de calificación. */
  lastQualificationPosition: number | null;
  /** El Tribunal devolvió el expediente después de la última calificación (rama no grave). */
  returnedByCourt: boolean;
  precautionary: {
    requestedOn: string;
    decidedOn: string | null;
    outcome: PrecautionaryOutcome | null;
  } | null;
  /** Reclasificación ordenada en la etapa vigente del Tribunal, si sigue pendiente. */
  reclassificationOrderedOn: string | null;
  federal: { funding: FederalFunding; flaggedOn: string; noticeSentOn: string | null } | null;
  sanctionRegistered: { legalOn: string; registryReference: string } | null;
  /**
   * Vista al Ministerio Público: el día y, si se dio a una fiscalía del nodo, su autoridad, que ve
   * la denuncia en su bandeja como copia de lectura y lleva la vía penal.
   */
  criminalReferral: { legalOn: string; authorityId: string | null } | null;
  /** Funciones que ejerció cada cuenta en esta denuncia. */
  functionsByActor: ReadonlyMap<string, ReadonlySet<ActingFunction>>;
}

const ADMINISTRATIVE_KEYS: ReadonlySet<string> = new Set(
  ADMINISTRATIVE_STAGES.map((stage) => stage.key),
);

const INVESTIGATION_KEYS: ReadonlySet<string> = new Set([
  'investigation',
  'qualification',
  'report_filed',
]);

/** Función que ejerció la cuenta en un paso anterior a la migración 19 (sin `details`). */
function legacyFunction(step: StoredStep): ActingFunction | null {
  if (step.action !== 'stage_advanced' || step.legalStage === null) return null;
  if (INVESTIGATION_KEYS.has(step.legalStage)) return 'investigation';
  if (SUBSTANTIATION_STAGES.has(step.legalStage)) return 'substantiation';
  return null;
}

/** Etapa penal a la que llevó el paso, o `null`. */
export function criminalStageOfStep(step: StoredStep): CriminalStage | null {
  const fromDetails = step.details?.criminalStage;
  if (fromDetails !== undefined) return fromDetails;
  // Pasos anteriores a la migración 19: la etapa penal iba en `legal_stage`.
  if (step.action === 'stage_advanced' && isCriminalStage(step.legalStage)) {
    const parsed = CriminalStageSchema.safeParse(step.legalStage);
    return parsed.success ? parsed.data : null;
  }
  return null;
}

/** Deriva los hechos del ciclo de vida de los pasos de la denuncia, en orden. */
export function lifecycleStateOf(
  steps: readonly StoredStep[],
  currentStage: LegalStage | null,
  currentCriminalStage: CriminalStage | null,
): LifecycleState {
  let stageEnteredOn: string | null = null;
  let previousStage: string | null = null;
  let criminalStageEnteredOn: string | null = null;
  let previousCriminal: CriminalStage | null = null;
  const remedies: RemedyState[] = [];
  let lastAbstention: LifecycleState['lastAbstention'] = null;
  let lastQualificationPosition: number | null = null;
  let returnedByCourt = false;
  let precautionary: LifecycleState['precautionary'] = null;
  let reclassificationOrderedOn: string | null = null;
  let federal: LifecycleState['federal'] = null;
  let sanctionRegistered: LifecycleState['sanctionRegistered'] = null;
  let criminalReferral: LifecycleState['criminalReferral'] = null;
  const functionsByActor = new Map<string, Set<ActingFunction>>();

  steps.forEach((step, position) => {
    const stage =
      step.legalStage !== null && ADMINISTRATIVE_KEYS.has(step.legalStage) ? step.legalStage : null;
    if (stage !== previousStage) {
      stageEnteredOn = stage === null ? null : step.legalOn;
      previousStage = stage;
      // La reclasificación pendiente es de la etapa del Tribunal en que se ordenó.
      reclassificationOrderedOn = null;
    }
    const criminal = criminalStageOfStep(step);
    if (criminal !== null && criminal !== previousCriminal) {
      criminalStageEnteredOn = step.legalOn;
      previousCriminal = criminal;
    }
    const fn = step.details?.fn ?? legacyFunction(step);
    if (step.actorId !== null && fn !== null && fn !== undefined && fn !== 'reporter') {
      const set = functionsByActor.get(step.actorId) ?? new Set<ActingFunction>();
      set.add(fn);
      functionsByActor.set(step.actorId, set);
    }
    const details = step.details ?? {};
    switch (step.action) {
      case 'stage_advanced':
        if (step.legalStage === 'qualification' && criminal === null) {
          lastQualificationPosition = position;
          returnedByCourt = false;
        }
        break;
      case 'abstention_declared':
        lastAbstention = {
          position,
          legalOn: step.legalOn,
          legalBasis: details.legalBasis ?? '',
          agreement: details.agreement ?? '',
          authoritySequence: details.authoritySequence ?? null,
        };
        break;
      case 'returned_by_court':
        returnedByCourt = true;
        break;
      case 'remedy_filed':
        if (details.remedyKind !== undefined && details.remedyId !== undefined) {
          remedies.push({
            remedyId: details.remedyId,
            kind: details.remedyKind,
            filedOn: step.legalOn,
            filedBy: details.remedyFiledBy ?? 'other_party',
            stage: details.remedyStage ?? step.legalStage,
            status: 'pending',
            outcome: null,
            resolvedOn: null,
            position,
          });
        }
        break;
      case 'remedy_resolved': {
        const remedy = remedies.find((item) => item.remedyId === details.remedyId);
        if (remedy !== undefined && details.remedyOutcome !== undefined) {
          remedy.outcome = details.remedyOutcome;
          remedy.status = details.remedyOutcome === 'admitted' ? 'admitted' : 'resolved';
          remedy.resolvedOn = details.remedyOutcome === 'admitted' ? null : step.legalOn;
        }
        break;
      }
      case 'precautionary_requested':
        precautionary = { requestedOn: step.legalOn, decidedOn: null, outcome: null };
        break;
      case 'precautionary_decided':
        if (precautionary !== null && details.precautionaryOutcome !== undefined) {
          precautionary = {
            ...precautionary,
            decidedOn: step.legalOn,
            outcome: details.precautionaryOutcome,
          };
        }
        break;
      case 'reclassification_ordered':
        reclassificationOrderedOn = step.legalOn;
        break;
      case 'federal_funds_flagged':
        if (details.funding !== undefined) {
          federal = { funding: details.funding, flaggedOn: step.legalOn, noticeSentOn: null };
        }
        break;
      case 'federal_notice_sent':
        if (federal !== null) federal = { ...federal, noticeSentOn: step.legalOn };
        break;
      case 'sanction_registered':
        sanctionRegistered = {
          legalOn: step.legalOn,
          registryReference: details.registryReference ?? '',
        };
        break;
      case 'criminal_referral_filed':
        criminalReferral = {
          legalOn: step.legalOn,
          authorityId: details.prosecutorAuthorityId ?? null,
        };
        break;
      default:
        break;
    }
  });
  // Si la etapa actual no coincide con la de los pasos (datos migrados), no se sabe desde cuándo.
  const isCurrent = previousStage === currentStage;
  return {
    stageEnteredOn: isCurrent ? stageEnteredOn : null,
    criminalStageEnteredOn:
      previousCriminal === currentCriminalStage ? criminalStageEnteredOn : null,
    remedies,
    lastAbstention,
    lastQualificationPosition,
    returnedByCourt,
    precautionary,
    reclassificationOrderedOn: currentStage === 'court_received' ? reclassificationOrderedOn : null,
    federal,
    sanctionRegistered,
    criminalReferral,
    functionsByActor,
  };
}

/** Recursos presentados que siguen sin resolverse (pendientes o admitidos). */
export function pendingRemedies(state: LifecycleState): RemedyState[] {
  return state.remedies.filter((remedy) => remedy.status !== 'resolved');
}

/** Indica si algún recurso pendiente impide pasar a la etapa `to`. */
export function isBlockedByRemedy(state: LifecycleState, to: AdministrativeStage): boolean {
  return pendingRemedies(state).some(
    (remedy) => findRemedyKind(remedy.kind)?.blocks.includes(to) ?? false,
  );
}

/**
 * Inconformidad vigente: la última presentada después del acto que se impugna (la abstención o la
 * última calificación), o `null`.
 */
export function currentInconformity(state: LifecycleState): RemedyState | null {
  const actPosition = Math.max(
    state.lastAbstention?.position ?? -1,
    state.lastQualificationPosition ?? -1,
  );
  const list = state.remedies.filter(
    (remedy) => remedy.kind === 'inconformity' && remedy.position > actPosition,
  );
  return list.at(-1) ?? null;
}
