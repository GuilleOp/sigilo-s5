// Trámite visible: acciones de la autoridad sobre una denuncia (turnar, aceptar, reasignar,
// devolver, avanzar de etapa y cerrar con fundamento) y la vista con la línea de tiempo, los plazos
// y las reglas cumplidas que ven la persona denunciante y la autoridad.
import { z } from 'zod';
import { AccountIdSchema } from './authority-access.ts';
import { AuthorityIdSchema } from './network.ts';
import { ComplaintStatusSchema } from './complaint.ts';
import { SanctionCheckViewSchema, SanctionClaimSchema } from './context-view.ts';
import { DayDateSchema, FolioSchema, Sha256HexSchema } from './primitives.ts';
import {
  ClosureReasonSchema,
  DeadlineKeySchema,
  DeadlineStatusSchema,
  EscalationRuleKeySchema,
  LegalStageSchema,
  ManagementStateSchema,
  ProcedureActionSchema,
  RuleEffectSchema,
  QualificationSeveritySchema,
  TurnSemaphoreStatusSchema,
  TurnWaitSchema,
} from './procedure.ts';

/** Día civil en la hora del centro de México con el que se cuentan los plazos legales. */
export const LegalDaySchema = DayDateSchema.meta({
  description:
    'Día civil en la hora del centro de México (America/Mexico_City) con el que se cuentan los plazos legales; puede diferir del día UTC.',
});

/**
 * Semáforo de turnado de la bandeja del S5 para una denuncia que espera turno o aceptación. Los
 * días cuentan en días hábiles (`TURN_SEMAPHORE`) con el reloj del nodo.
 */
export const TurnSemaphoreSchema = z
  .object({
    waitingFor: TurnWaitSchema,
    status: TurnSemaphoreStatusSchema,
    sinceOn: LegalDaySchema.meta({
      description:
        'Día en que la denuncia entró al estado que espera (recepción, turno o devolución).',
    }),
    elapsedDays: z.number().int().nonnegative().meta({
      description: 'Días hábiles completos desde sinceOn hasta hoy.',
    }),
    warningOn: LegalDaySchema.meta({ description: 'Día desde el que queda «por vencer».' }),
    overdueOn: LegalDaySchema.meta({ description: 'Día desde el que queda «vencida».' }),
  })
  .meta({
    description:
      'Semáforo de turnado del S5: cuánto lleva la denuncia sin turnarse o sin aceptarse. Solo en las denuncias que esperan.',
  });
export type TurnSemaphore = z.infer<typeof TurnSemaphoreSchema>;

/** Nota pública de la autoridad: la persona denunciante la lee tal cual en su seguimiento. */
export const PublicNoteSchema = z
  .string()
  .min(1)
  .max(2000)
  .meta({ description: 'Nota pública de la autoridad; la persona denunciante la lee tal cual.' });

/** Fundamento legal y motivo, visible para la persona denunciante. */
export const LegalBasisTextSchema = z
  .string()
  .min(20)
  .max(1000)
  .meta({ description: 'Fundamento legal y motivo; la persona denunciante lo ve.' });

/** Versión pública del acuerdo de cierre: texto completo sin datos personales. */
export const AgreementTextSchema = z.string().min(50).max(20_000).meta({
  description:
    'Versión pública del acuerdo de cierre, sin datos personales. Queda disponible para el auditor y para la persona denunciante.',
});

const RouteActionSchema = z.strictObject({
  action: z.literal('route'),
  authorityId: AuthorityIdSchema,
  note: PublicNoteSchema.optional(),
});
const AcceptActionSchema = z.strictObject({
  action: z.literal('accept'),
  note: PublicNoteSchema.optional(),
});
const ReassignActionSchema = z.strictObject({
  action: z.literal('reassign'),
  authorityId: AuthorityIdSchema,
  note: PublicNoteSchema,
});
const ReturnActionSchema = z.strictObject({
  action: z.literal('return'),
  note: PublicNoteSchema,
});
/** Calificación de la falta con su fundamento y la versión pública del acuerdo (LGRA, art. 100). */
export const QualificationInputSchema = z
  .strictObject({
    severity: QualificationSeveritySchema,
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
  })
  .meta({
    description:
      'Calificación de la falta como grave o no grave, con fundamento y acuerdo en versión pública. Si es no grave, se notifica a quien denunció y puede inconformarse (LGRA, arts. 102 y 103).',
  });
export type QualificationInput = z.infer<typeof QualificationInputSchema>;

const AdvanceStageActionSchema = z.strictObject({
  action: z.literal('advance_stage'),
  stage: LegalStageSchema,
  note: PublicNoteSchema.optional(),
  /** Al pasar a `qualification`: la calificación, que el auditor revisa (AUD-01 y AUD-03). */
  qualification: QualificationInputSchema.optional(),
});
const CloseActionSchema = z.strictObject({
  action: z.literal('close'),
  reason: ClosureReasonSchema,
  legalBasis: LegalBasisTextSchema,
  agreement: AgreementTextSchema,
  /** Sanción declarada (cierre con sanción): el nodo la verifica contra S3. */
  sanction: SanctionClaimSchema.optional(),
});
const RespondConflictActionSchema = z.strictObject({
  action: z.literal('respond_conflict'),
  response: z.enum(['excuse', 'justification']).meta({
    description:
      'excuse: la autoridad se excusa (LGRA, art. 58); justification: explica por qué no hay conflicto.',
  }),
  note: PublicNoteSchema,
});

/**
 * Acción de la autoridad sobre el trámite. `route`: el buzón general turna a una autoridad del
 * nodo; `accept`, `reassign` y `return`: la autoridad turnada acepta, reasigna o devuelve al buzón
 * general; `advance_stage`: la investigación avanza a una etapa legal; `close`: cierre con uno de
 * los seis motivos, su fundamento y la versión pública del acuerdo.
 */
export const ProcedureActionRequestSchema = z
  .discriminatedUnion('action', [
    RouteActionSchema,
    AcceptActionSchema,
    ReassignActionSchema,
    ReturnActionSchema,
    AdvanceStageActionSchema,
    CloseActionSchema,
    RespondConflictActionSchema,
  ])
  .meta({
    description:
      'Acción del trámite: route, accept, reassign, return, advance_stage, close (con sanción opcional, que se verifica contra S3) o respond_conflict (excusa o justificación ante un posible conflicto). Cada una queda en la bitácora y, si lleva nota, en el seguimiento.',
  });
export type ProcedureActionRequest = z.infer<typeof ProcedureActionRequestSchema>;

/** Estado del trámite después de una acción. */
export const ProcedureStateSchema = z
  .object({
    folio: FolioSchema,
    status: ComplaintStatusSchema,
    managementState: ManagementStateSchema,
    legalStage: LegalStageSchema.optional(),
    closureReason: ClosureReasonSchema.optional(),
    assignedAuthorityId: AuthorityIdSchema,
  })
  .meta({ description: 'Estado del trámite: estatus, flujo de gestión, etapa y autoridad.' });
export type ProcedureState = z.infer<typeof ProcedureStateSchema>;

/** Paso de la línea de tiempo, con su explicación en lenguaje sencillo. */
export const ProcedureStepSchema = z
  .object({
    on: DayDateSchema.meta({ description: 'Día (UTC) de la acción.' }),
    legalOn: LegalDaySchema,
    action: ProcedureActionSchema,
    managementState: ManagementStateSchema,
    legalStage: LegalStageSchema.optional(),
    closureReason: ClosureReasonSchema.optional(),
    title: z.string().meta({ description: 'Qué pasó, en pocas palabras.' }),
    explanation: z.string().meta({ description: 'Qué significa, en lenguaje sencillo.' }),
    note: PublicNoteSchema.optional(),
  })
  .meta({ description: 'Paso del trámite en la línea de tiempo.' });
export type ProcedureStep = z.infer<typeof ProcedureStepSchema>;

/** Plazo legal vigente con su situación. */
export const DeadlineViewSchema = z
  .object({
    key: DeadlineKeySchema,
    name: z.string().meta({ description: 'Nombre del plazo.' }),
    explanation: z.string().meta({ description: 'Qué exige el plazo, en lenguaje sencillo.' }),
    startsOn: LegalDaySchema,
    dueOn: LegalDaySchema,
    status: DeadlineStatusSchema,
    remaining: z.number().int().meta({
      description: 'Días que faltan en remainingUnit (0 el último día, negativo si venció).',
    }),
    remainingUnit: z
      .enum(['natural_days', 'business_days'])
      .meta({ description: 'Unidad de remaining: días naturales o días hábiles.' }),
    legalBasis: z.array(z.string()).meta({ description: 'Fundamentos con el nombre de la ley.' }),
  })
  .meta({
    description: 'Plazo legal con su vencimiento y situación (en curso, por vencer, vencido).',
  });
export type DeadlineView = z.infer<typeof DeadlineViewSchema>;

/** Cierre con su motivo, su fundamento y la versión pública del acuerdo. */
export const ClosureViewSchema = z
  .object({
    on: DayDateSchema,
    legalOn: LegalDaySchema,
    reason: ClosureReasonSchema,
    reasonName: z.string().meta({ description: 'Nombre del motivo de cierre.' }),
    reasonExplanation: z
      .string()
      .meta({ description: 'Qué significa el motivo, en lenguaje sencillo.' }),
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
    sanctionCheck: SanctionCheckViewSchema.optional(),
  })
  .meta({ description: 'Cierre del trámite con fundamento y acuerdo en versión pública.' });
export type ClosureView = z.infer<typeof ClosureViewSchema>;

/** Inconformidad de la persona denunciante contra la calificación de no grave (LGRA, arts. 102 a 110). */
export const AppealViewSchema = z
  .object({
    filedOn: DayDateSchema,
    legalOn: LegalDaySchema,
    reasons: z
      .string()
      .meta({ description: 'Motivos por los que estima indebida la calificación.' }),
    resolutionDueOn: LegalDaySchema.optional().meta({
      description: 'Plazo de la Sala para resolver: 30 días hábiles (LGRA, art. 107).',
    }),
  })
  .meta({ description: 'Recurso de inconformidad presentado contra la calificación.' });
export type AppealView = z.infer<typeof AppealViewSchema>;

/** Calificación de la falta con su acuerdo, y la inconformidad si la hubo. */
export const QualificationViewSchema = z
  .object({
    on: DayDateSchema,
    legalOn: LegalDaySchema,
    severity: QualificationSeveritySchema,
    severityName: z.string().meta({ description: 'Falta grave o falta no grave.' }),
    explanation: z
      .string()
      .meta({ description: 'Qué significa y qué puede hacer quien denunció.' }),
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
    appealDueOn: LegalDaySchema.optional().meta({
      description:
        'Último día para inconformarse: 5 días hábiles desde la notificación (LGRA, art. 103).',
    }),
    appeal: AppealViewSchema.optional(),
  })
  .meta({ description: 'Calificación de la falta (LGRA, arts. 100 y 102).' });
export type QualificationView = z.infer<typeof QualificationViewSchema>;

/** Regla pública que se cumplió: escalamiento o alerta. */
export const RuleTriggerViewSchema = z
  .object({
    on: DayDateSchema,
    ruleKey: EscalationRuleKeySchema,
    name: z.string().meta({ description: 'Nombre de la regla.' }),
    explanation: z
      .string()
      .meta({ description: 'Qué vigila la regla y qué pasa, en lenguaje sencillo.' }),
    effect: RuleEffectSchema,
    dueOn: LegalDaySchema.meta({ description: 'Vencimiento que dio lugar a la regla.' }),
  })
  .meta({ description: 'Regla pública de escalamiento o de alerta que se cumplió.' });
export type RuleTriggerView = z.infer<typeof RuleTriggerViewSchema>;

/** Vista del trámite: dónde está, qué significa, qué pasó, qué plazos corren y qué reglas se cumplieron. */
export const ProcedureViewSchema = z
  .object({
    managementState: ManagementStateSchema,
    managementStateName: z.string().meta({ description: 'Nombre del estado actual.' }),
    explanation: z.string().meta({ description: 'Qué significa el estado actual.' }),
    legalStage: LegalStageSchema.optional(),
    legalStageName: z.string().optional().meta({ description: 'Nombre de la etapa legal.' }),
    closure: ClosureViewSchema.optional(),
    qualification: QualificationViewSchema.optional(),
    steps: z
      .array(ProcedureStepSchema)
      .meta({ description: 'Pasos del más antiguo al más reciente.' }),
    deadlines: z.array(DeadlineViewSchema).meta({ description: 'Plazos legales que corren.' }),
    rules: z
      .array(RuleTriggerViewSchema)
      .meta({ description: 'Reglas públicas que se cumplieron (escalamientos y alertas).' }),
  })
  .meta({ description: 'Trámite de la denuncia con su línea de tiempo, plazos y reglas.' });
export type ProcedureView = z.infer<typeof ProcedureViewSchema>;

/** Acuerdo de cierre tal como lo consulta el auditor (`GET authorityClosures`). */
export const ClosureRecordSchema = z
  .object({
    folio: FolioSchema,
    authorityId: AuthorityIdSchema,
    on: DayDateSchema,
    legalOn: LegalDaySchema,
    reason: ClosureReasonSchema,
    legalBasis: LegalBasisTextSchema,
    agreement: AgreementTextSchema,
    agreementDigest: Sha256HexSchema.meta({
      description: 'SHA-256 del texto del acuerdo; va en los datos de su evento de bitácora.',
    }),
    actorId: AccountIdSchema,
  })
  .meta({ description: 'Acuerdo de cierre en versión pública, para el auditor.' });
export type ClosureRecord = z.infer<typeof ClosureRecordSchema>;
