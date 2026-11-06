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

/** Los seis motivos de cierre del S5. */
export const ClosureReasonSchema = z
  .enum(['attended', 'channeled', 'inadmissible', 'insufficient_information', 'joined', 'other'])
  .meta({
    description:
      'Motivo de cierre del flujo de gestión. Nombres y explicaciones en CLOSURE_REASONS.',
  });
export type ClosureReason = z.infer<typeof ClosureReasonSchema>;

/** Vía legal: falta administrativa (LGRA) o hecho de corrupción (delito, proceso penal). */
export const LegalTrackSchema = z.enum(['administrative', 'criminal']).meta({
  description: 'Vía legal: administrative (falta administrativa) o criminal (hecho de corrupción).',
});
export type LegalTrack = z.infer<typeof LegalTrackSchema>;

/** Etapas del procedimiento de responsabilidad administrativa (LGRA), en orden. */
export const AdministrativeStageSchema = z
  .enum([
    'investigation',
    'qualification',
    'report_filed',
    'case_file_sent',
    'evidence_hearing',
    'closing_arguments',
    'instruction_closed',
    'resolution',
  ])
  .meta({ description: 'Etapa del procedimiento de responsabilidad administrativa (LGRA).' });
export type AdministrativeStage = z.infer<typeof AdministrativeStageSchema>;

/** Etapas del proceso penal acusatorio por hechos de corrupción, en orden. */
export const CriminalStageSchema = z
  .enum(['criminal_investigation', 'intermediate_stage', 'trial', 'sentence'])
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
 * y los días inhábiles del calendario; `months` y `years` son de calendario.
 */
export const DeadlineUnitSchema = z
  .enum(['natural_days', 'business_days', 'months', 'years'])
  .meta({ description: 'Unidad del plazo: días naturales, días hábiles, meses o años.' });
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
  ])
  .meta({ description: 'Plazo legal del catálogo DEADLINE_RULES.' });
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
  ])
  .meta({
    description:
      'Acción del trámite: recepción, turno, aceptación, reasignación, devolución al buzón general, avance de etapa legal, cierre, excusa o justificación ante un posible conflicto de interés, turnado a otro nodo o inconformidad de la persona denunciante.',
  });
export type ProcedureAction = z.infer<typeof ProcedureActionSchema>;

/** Calificación de la falta que hace la autoridad investigadora (LGRA, art. 100). */
export const QualificationSeveritySchema = z.enum(['serious', 'non_serious']).meta({
  description: 'Calificación de la falta: serious (grave) o non_serious (no grave).',
});
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
