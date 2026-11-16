// Claves del trámite en dos capas: el flujo de gestión del S5 (buzón general, turno y cierre) y las
// etapas legales de la LGRA y del proceso penal, con las unidades de sus plazos.
import { z } from 'zod';

/**
 * Flujo de gestión del S5 tal como lo opera la versión de pruebas: la denuncia llega al buzón
 * general, se turna a una institución que la acepta, la reasigna o la devuelve, y se cierra con un
 * motivo de `ClosureReasonSchema`.
 */
export const ManagementStateSchema = z
  .enum(['received_in_inbox', 'routed', 'accepted', 'reassigned', 'returned_to_inbox', 'closed'])
  .meta({
    description:
      'Estado del flujo de gestión del S5. Nombres y explicaciones en el catálogo MANAGEMENT_STATES.',
  });
export type ManagementState = z.infer<typeof ManagementStateSchema>;

/**
 * Los seis motivos de cierre del S5. El motivo legal (archivo, abstención, prescripción…) va aparte,
 * en `LegalClosureReasonSchema`, para no romper el mapeo con la bandeja de la SESNA.
 */
export const ClosureReasonSchema = z
  .enum(['attended', 'channeled', 'inadmissible', 'insufficient_information', 'joined', 'other'])
  .meta({
    description:
      'Motivo de cierre del flujo de gestión. Nombres y explicaciones en CLOSURE_REASONS.',
  });
export type ClosureReason = z.infer<typeof ClosureReasonSchema>;

/**
 * Motivo legal del cierre, con su fundamento en el catálogo `LEGAL_CLOSURE_REASONS`: archivo por
 * falta de elementos (LGRA, art. 100), abstención (art. 101), prescripción y caducidad (art. 74),
 * sobreseimiento (arts. 196 y 197), incompetencia o remisión (arts. 14 y 196 fr. II, con destino
 * obligatorio, dentro o fuera de la red) y resolución firme (art. 206) con o sin sanción.
 */
export const LegalClosureReasonSchema = z
  .enum([
    'archived',
    'abstention',
    'prescribed',
    'expired',
    'dismissed',
    'incompetence',
    'sanctioned',
    'responsible_no_sanction',
    'not_responsible',
  ])
  .meta({
    description:
      'Motivo legal del cierre (aparte del motivo del S5). Nombres, fundamento y requisitos en LEGAL_CLOSURE_REASONS.',
  });
export type LegalClosureReason = z.infer<typeof LegalClosureReasonSchema>;

/** Vía legal: falta administrativa (LGRA) o hecho de corrupción (delito, proceso penal). */
export const LegalTrackSchema = z.enum(['administrative', 'criminal']).meta({
  description: 'Vía legal: administrative (falta administrativa) o criminal (hecho de corrupción).',
});
export type LegalTrack = z.infer<typeof LegalTrackSchema>;

/**
 * Etapas del procedimiento de responsabilidad administrativa (LGRA). El orden es el de lectura; las
 * transiciones válidas (con sus dos ramas después de la audiencia inicial: no grave ante la
 * substanciadora y resolutora, grave o de particulares ante el Tribunal) están en
 * `ADMINISTRATIVE_TRANSITIONS`.
 */
export const AdministrativeStageSchema = z
  .enum([
    'investigation',
    'qualification',
    'report_filed',
    'report_prevented',
    'abstention',
    'report_admitted',
    'summoned',
    'initial_hearing',
    'evidence_hearing',
    'closing_arguments',
    'instruction_closed',
    'resolution',
    'case_file_sent',
    'court_received',
    'court_evidence_hearing',
    'court_closing_arguments',
    'court_instruction_closed',
    'court_resolution',
    'final',
    'executed',
  ])
  .meta({ description: 'Etapa del procedimiento de responsabilidad administrativa (LGRA).' });
export type AdministrativeStage = z.infer<typeof AdministrativeStageSchema>;

/**
 * Etapas del proceso penal por hechos de corrupción. Corren en una capa aparte
 * (`criminalStage`), en paralelo a la administrativa: las vías son autónomas (CPEUM, art. 109;
 * LGRA, art. 14). Transiciones en `CRIMINAL_TRANSITIONS`.
 */
export const CriminalStageSchema = z
  .enum([
    'criminal_complaint_filed',
    'criminal_investigation',
    'prosecutor_determination',
    'judicial_review',
    'intermediate_stage',
    'alternative_exit',
    'trial',
    'sentence',
  ])
  .meta({ description: 'Etapa del proceso penal por hechos de corrupción (CNPP, art. 211).' });
export type CriminalStage = z.infer<typeof CriminalStageSchema>;

/** Cualquier etapa legal; las claves no se repiten entre vías. */
export const LegalStageSchema = z
  .enum([...AdministrativeStageSchema.options, ...CriminalStageSchema.options])
  .meta({
    description:
      'Etapa legal de cualquiera de las dos vías. Nombres y explicaciones en LEGAL_STAGES.',
  });
export type LegalStage = z.infer<typeof LegalStageSchema>;

/** Quién actúa en cada estado o etapa. */
export const ProcedureActorSchema = z
  .enum([
    'reporter',
    'inbox_operator',
    'receiving_institution',
    'investigating_authority',
    'substantiating_authority',
    'resolving_authority',
    'administrative_court',
    'prosecutor',
    'criminal_court',
  ])
  .meta({ description: 'Quién actúa en un estado o etapa. Nombres en PROCEDURE_ACTORS.' });
export type ProcedureActor = z.infer<typeof ProcedureActorSchema>;

/**
 * Unidad de un plazo. `natural_days` cuenta todos los días; `business_days` salta sábados, domingos
 * y los días inhábiles del calendario; `months` y `years` son de calendario; `hours` (72 horas del
 * art. 208 fr. IV de la LGRA) se cuenta en días completos: 24 horas por día natural.
 */
export const DeadlineUnitSchema = z
  .enum(['natural_days', 'business_days', 'months', 'years', 'hours'])
  .meta({ description: 'Unidad del plazo: días naturales, días hábiles, meses, años u horas.' });
export type DeadlineUnit = z.infer<typeof DeadlineUnitSchema>;

/** Plazos legales del catálogo `DEADLINE_RULES`. */
export const DeadlineKeySchema = z
  .enum([
    'serious_offense_start',
    'archive_notification',
    'information_request',
    'appeal_filing',
    'appeal_resolution',
    'prescription_non_serious',
    'prescription_serious',
    'inactivity_expiry',
    'report_correction',
    'report_admission',
    'initial_hearing_window',
    'parties_summons',
    'evidence_admission',
    'closing_arguments',
    'resolution_term',
    'resolution_notice',
    'court_referral',
    'reclassification',
    'precautionary_hearing',
    'precautionary_decision',
    'claim_filing',
    'claim_resolution',
    'revocation_filing',
    'revocation_resolution',
    'court_appeal_filing',
    'review_filing',
    'execution_report',
    'prosecutor_determination_challenge',
  ])
  .meta({
    description:
      'Plazo legal del catálogo DEADLINE_RULES. appeal_filing y appeal_resolution son los de la inconformidad (LGRA, arts. 103 y 107); la apelación es court_appeal_filing.',
  });
export type DeadlineKey = z.infer<typeof DeadlineKeySchema>;

/** Plazo concreto: cantidad entera positiva en una unidad. */
export const DeadlineTermSchema = z
  .object({
    unit: DeadlineUnitSchema,
    amount: z.number().int().positive().max(3650).meta({ description: 'Cantidad de unidades.' }),
  })
  .meta({ description: 'Plazo concreto: cantidad y unidad.' });
export type DeadlineTerm = z.infer<typeof DeadlineTermSchema>;

/** Situación de un plazo respecto de un día dado. */
export const DeadlineStatusSchema = z.enum(['running', 'due_soon', 'overdue']).meta({
  description:
    'Situación de un plazo: running (en curso), due_soon (por vencer) u overdue (vencido).',
});
export type DeadlineStatus = z.infer<typeof DeadlineStatusSchema>;

/**
 * Semáforo de turnado de la bandeja del S5: `a_tiempo`, `por_vencer` (cumplió el primer día sin
 * turnarse o sin aceptarse) o `vencida` (cumplió el segundo). Umbrales y unidad en `TURN_SEMAPHORE`.
 */
export const TurnSemaphoreStatusSchema = z.enum(['a_tiempo', 'por_vencer', 'vencida']).meta({
  description:
    'Semáforo de turnado del S5: a_tiempo, por_vencer (1 día hábil sin turnar o sin aceptar) o vencida (2 días hábiles). Umbrales en TURN_SEMAPHORE.',
});
export type TurnSemaphoreStatus = z.infer<typeof TurnSemaphoreStatusSchema>;

/**
 * Qué espera la denuncia: `routing` (está en el buzón general, sin turnar o devuelta) o
 * `acceptance` (turnada o reasignada, la autoridad todavía no la acepta).
 */
export const TurnWaitSchema = z.enum(['routing', 'acceptance']).meta({
  description:
    'Qué espera la denuncia: routing (en el buzón general, sin turnar o devuelta) o acceptance (turnada o reasignada, sin aceptar).',
});
export type TurnWait = z.infer<typeof TurnWaitSchema>;

/** Acción del trámite que queda en la línea de tiempo (y en la bitácora). */
export const ProcedureActionSchema = z
  .enum([
    'received',
    'routed',
    'accepted',
    'reassigned',
    'returned_to_inbox',
    'stage_advanced',
    'closed',
    'conflict_excused',
    'conflict_justified',
    'transferred',
    'appeal_filed',
    'abstention_declared',
    'report_not_filed',
    'returned_by_court',
    'reclassification_ordered',
    'offense_reclassified',
    'precautionary_requested',
    'precautionary_decided',
    'remedy_filed',
    'remedy_resolved',
    'criminal_referral_filed',
    'federal_funds_flagged',
    'federal_notice_sent',
    'sanction_registered',
    'withdrawal_received',
  ])
  .meta({
    description:
      'Acción del trámite: recepción, turno, aceptación, reasignación, devolución al buzón general, avance de etapa legal, cierre, excusa o justificación ante un posible conflicto de interés, turnado a otro nodo, aviso de inconformidad de la persona denunciante (appeal_filed), abstención, IPRA no presentado, devolución del Tribunal, orden de reclasificar (reclassification_ordered) y reclasificación de la investigadora (offense_reclassified), medidas cautelares, recursos, vista al Ministerio Público y avance de la vía penal, recursos federales, registro de la sanción y desistimiento.',
  });
export type ProcedureAction = z.infer<typeof ProcedureActionSchema>;

/** Calificación de la falta que hace la autoridad investigadora (LGRA, art. 100). */
export const QualificationSeveritySchema = z.enum(['serious', 'non_serious']).meta({
  description: 'Calificación de la falta: serious (grave) o non_serious (no grave).',
});

/**
 * Recurso (LGRA): inconformidad contra la calificación de no grave o la abstención (arts. 102 a
 * 110), reclamación (213 y 214), revocación (210 a 212), apelación (215 a 219) y revisión (220 y
 * 221). Plazos, quién lo resuelve y su efecto en el trámite en `REMEDY_KINDS`.
 */
export const RemedyKindSchema = z
  .enum(['inconformity', 'claim', 'revocation', 'appeal', 'review'])
  .meta({
    description:
      'Recurso: inconformity (inconformidad), claim (reclamación), revocation (revocación), appeal (apelación) o review (revisión). Detalle en REMEDY_KINDS.',
  });
export type RemedyKind = z.infer<typeof RemedyKindSchema>;

/**
 * Resultado de un recurso: `admitted` (procedente: se admite y sigue pendiente de resolver),
 * `inadmissible` (improcedente o no presentado, por ejemplo sin firma autógrafa), `confirmed`
 * (se confirma el acto), `revoked` (se revoca o deja sin efecto) o `modified` (se modifica).
 */
export const RemedyOutcomeSchema = z
  .enum(['admitted', 'inadmissible', 'confirmed', 'revoked', 'modified'])
  .meta({
    description:
      'Resultado del recurso: admitted (procedente, sigue en trámite), inadmissible (improcedente), confirmed (confirmada), revoked (revocada) o modified (modificada).',
  });
export type RemedyOutcome = z.infer<typeof RemedyOutcomeSchema>;

/** Quién presenta el recurso. La persona denunciante puede ser tercera (LGRA, art. 116 fr. IV). */
export const RemedyFiledBySchema = z
  .enum(['reporter', 'accused', 'investigating_authority', 'other_party'])
  .meta({
    description:
      'Quién presentó el recurso: reporter (la persona denunciante, también como tercera), accused (la persona señalada), investigating_authority (la autoridad investigadora) u other_party.',
  });
export type RemedyFiledBy = z.infer<typeof RemedyFiledBySchema>;

/** Resultado del incidente de medidas cautelares (LGRA, arts. 123 a 129). */
export const PrecautionaryOutcomeSchema = z.enum(['granted', 'provisional', 'denied']).meta({
  description:
    'Medida cautelar: granted (concedida), provisional (concedida provisionalmente, art. 127) o denied (negada).',
});
export type PrecautionaryOutcome = z.infer<typeof PrecautionaryOutcomeSchema>;

/**
 * Origen del dinero cuando la denuncia involucra recursos federales en un ente local:
 * aportaciones (Ramo 33) o convenios y subsidios federales (Ley de Coordinación Fiscal, art. 49;
 * LFRCF, art. 47).
 */
export const FederalFundingSchema = z.enum(['aportaciones', 'convenio_federal']).meta({
  description:
    'Recursos federales en un ente local: aportaciones (Ramo 33) o convenio_federal (convenios y subsidios). Regla en FEDERAL_FUNDS_RULE.',
});
export type FederalFunding = z.infer<typeof FederalFundingSchema>;
export type QualificationSeverity = z.infer<typeof QualificationSeveritySchema>;

/**
 * Gravedad legal de una conducta, deducida de su artículo: faltas no graves (LGRA, arts. 49 y 50),
 * graves (arts. 51 a 64), de particulares (arts. 65 a 72) y delitos por hechos de corrupción (CPF).
 */
export const OffenseSeveritySchema = z
  .enum(['non_serious', 'serious', 'private_party', 'crime'])
  .meta({
    description:
      'Gravedad de la conducta: non_serious (falta no grave), serious (grave), private_party (de particulares) o crime (delito).',
  });
export type OffenseSeverity = z.infer<typeof OffenseSeveritySchema>;

/** Reglas públicas de escalamiento y de alerta del catálogo `ESCALATION_RULES`. */
export const EscalationRuleKeySchema = z
  .enum([
    'escalation.grave-stalled',
    'escalation.archive-unnotified',
    'escalation.conflict',
    'escalation.archive-signals',
    'escalation.downgrade-signals',
    'escalation.declined-serious',
    'escalation.conflict-justified',
    'escalation.transfer-unconfirmed',
    'alert.turn-overdue',
    'alert.prescription-12m',
    'alert.prescription-6m',
    'alert.prescription-3m',
    'alert.inactivity-warning',
    'alert.inactivity-expiry',
    'alert.expiry-warning',
    'alert.expiry-reached',
  ])
  .meta({
    description: 'Regla pública de escalamiento o de alerta del catálogo ESCALATION_RULES.',
  });
export type EscalationRuleKey = z.infer<typeof EscalationRuleKeySchema>;

/**
 * Efecto de una regla: `escalate` entrega el sobre de escalamiento a la autoridad supervisora;
 * `alert` solo deja el aviso en la bitácora y en el seguimiento.
 */
export const RuleEffectSchema = z.enum(['escalate', 'alert']).meta({
  description:
    'Efecto de la regla: escalate (entrega el sobre de escalamiento a la supervisora) o alert (solo avisa).',
});
export type RuleEffect = z.infer<typeof RuleEffectSchema>;
